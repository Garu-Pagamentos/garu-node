import { describe, expect, it } from 'vitest';

import { Garu } from '../src/index.js';
import { mockFetch } from './helpers.js';

const PLAN_UUID = 'e5d0d8fe-0000-4000-8000-000000000001';
const PRODUCT_UUID = '40381e8e-6ee7-4b8e-9393-766a6e2109d2';

// A R$1.200 product sold in 12x at production's fator 1,30. Derived by hand:
// 1200 × 1,30 = 1560,00 total, 1560 / 12 = 130,00 a parcela.
const planBody = {
  uuid: PLAN_UUID,
  status: 'pending_activation',
  installments: 12,
  installmentsPaid: 0,
  baseValue: 1200,
  fator: 1.3,
  installmentAmount: 130,
  totalScheduled: 1560,
  totalCollected: 0,
  firstDueDate: '2026-09-05',
  graceDays: 5,
  cancelReason: null,
  product: { uuid: PRODUCT_UUID, name: 'Curso' },
  customer: { name: 'Ana', email: 'ana@example.com', document: '***9822**' },
  activatedAt: null,
  completedAt: null,
  canceledAt: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  installmentsDetail: [
    {
      number: 1,
      amount: 130,
      dueDate: '2026-09-05',
      status: 'scheduled',
      paidAt: null,
      boleto: { barcodeLine: '50990000010', pdfUrl: 'https://garu.com.br/b/1' },
      reissueCount: 0
    }
  ]
};

describe('installmentPlans.create', () => {
  it('posts to the v1 route and returns the plan with its first slip', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: planBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const plan = await garu.installmentPlans.create({
      productId: PRODUCT_UUID,
      customerId: 4821,
      installments: 12
    });

    expect(calls[0]!.url).toBe('https://garu.com.br/api/v1/installment-plans');
    expect(calls[0]!.method).toBe('POST');
    // Independently derived above, not read back off the response builder.
    expect(plan.totalScheduled).toBe(1560);
    expect(plan.installmentAmount).toBe(130);
    expect(plan.installmentsDetail).toHaveLength(1);
  });

  it('always sends an idempotency key', async () => {
    // This call registers a REAL boleto. A retry without a key puts two
    // payable barcodes in one buyer's hands, so the SDK never lets the
    // caller forget it.
    const { fetch, calls } = mockFetch([{ status: 201, body: planBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.create({
      productId: PRODUCT_UUID,
      customerId: 4821,
      installments: 12
    });

    expect(calls[0]!.headers['x-idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours a caller-supplied key and keeps it out of the body', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: planBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.create({
      productId: PRODUCT_UUID,
      customerId: 4821,
      installments: 12,
      idempotencyKey: 'order-9912'
    });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('order-9912');
    expect(calls[0]!.body).not.toHaveProperty('idempotencyKey');
  });

  it('forwards the affiliate so the commission is not lost', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: planBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.create({
      productId: PRODUCT_UUID,
      customerId: 4821,
      installments: 12,
      affiliateId: 5
    });

    expect(calls[0]!.body).toMatchObject({ affiliateId: 5 });
  });
});

describe('installmentPlans.list', () => {
  it('repeats the status parameter for a multi-status filter', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.list({ status: ['active', 'defaulted'], customerId: 4821 });

    const url = calls[0]!.url;
    expect(url).toContain('status=active');
    expect(url).toContain('status=defaulted');
    expect(url).toContain('customerId=4821');
  });
});

describe('installmentPlans actions', () => {
  it('addresses a parcela by its number', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { status: 'emitted', reason: null, installment: null } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.reissueInstallment(PLAN_UUID, 4);

    expect(calls[0]!.url).toBe(
      `https://garu.com.br/api/v1/installment-plans/${PLAN_UUID}/installments/4/reissue`
    );
  });

  it('opens a refund request rather than moving money', async () => {
    const requestBody = {
      uuid: 'a1b2c3d4-0000-4000-8000-000000000001',
      status: 'pending',
      amount: 390,
      reason: 'Produto não entregue',
      installmentPlanId: PLAN_UUID,
      chargeId: null,
      requestedBy: { type: 'api_key', id: 'key-1' },
      resolvedBy: null,
      sellerNote: null,
      resolvedAt: null,
      createdAt: '2026-09-01T09:00:00.000Z'
    };
    const { fetch, calls } = mockFetch([{ status: 202, body: requestBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const request = await garu.installmentPlans.requestRefund(PLAN_UUID, {
      reason: 'Produto não entregue'
    });

    expect(calls[0]!.url).toBe(
      `https://garu.com.br/api/v1/installment-plans/${PLAN_UUID}/refund-requests`
    );
    // Pending, not refunded: Garu records the ask, the seller moves the money.
    expect(request.status).toBe('pending');
    expect(request.installmentPlanId).toBe(PLAN_UUID);
    expect(calls[0]!.body).not.toHaveProperty('idempotencyKey');
    expect(calls[0]!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('respects a caller-supplied idempotency key on requestRefund', async () => {
    const requestBody = {
      uuid: 'a1b2c3d4-0000-4000-8000-000000000001',
      status: 'pending',
      amount: 390,
      reason: null,
      installmentPlanId: PLAN_UUID,
      chargeId: null,
      requestedBy: { type: 'api_key', id: 'key-1' },
      resolvedBy: null,
      sellerNote: null,
      resolvedAt: null,
      createdAt: '2026-09-01T09:00:00.000Z'
    };
    const { fetch, calls } = mockFetch([{ status: 202, body: requestBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.installmentPlans.requestRefund(PLAN_UUID, { idempotencyKey: 'refund-key-1' });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('refund-key-1');
  });
});
