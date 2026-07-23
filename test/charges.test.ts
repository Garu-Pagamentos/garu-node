import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError, GaruValidationError } from '../src/index.js';
import { mockFetch } from './helpers.js';

const fakeCustomer = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com.br',
  document: '12345678909',
  phone: '11987654321'
};

const CHARGE_UUID = '6f1c9b2e-4a7d-4f0b-9a3e-1d2c3b4a5e6f';

const pixCharge = {
  uuid: CHARGE_UUID,
  status: 'pending',
  paymentMethod: 'pix',
  amount: 349.0,
  chargedTotal: 349.0,
  installments: 1,
  product: { uuid: 'prod-uuid', name: 'Curso' },
  customer: { name: 'Maria Silva', email: 'maria@exemplo.com.br', document: '***456789**' },
  pix: { code: '00020101021226...' },
  boleto: null,
  card: null,
  refund: null,
  createdAt: '2026-07-22T14:03:11.000Z',
  expiresAt: null
};

describe('charges.create', () => {
  it('posts to /api/v1/charges with an auto-generated idempotency key', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: pixCharge }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.create({
      productId: 'prod-uuid',
      paymentMethod: 'pix',
      customer: fakeCustomer
    });

    expect(charge.uuid).toBe(CHARGE_UUID);
    expect(charge.pix?.code).toBe('00020101021226...');
    const [call] = calls;
    expect(call!.url).toBe('https://garu.com.br/api/v1/charges');
    expect(call!.method).toBe('POST');
    expect(call!.headers.authorization).toBe('Bearer sk_test_abc');
    expect(call!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(call!.body).toMatchObject({
      productId: 'prod-uuid',
      paymentMethod: 'pix',
      customer: fakeCustomer
    });
  });

  it('sends card under `card` for a creditCard charge (never cardInfo)', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { ...pixCharge, paymentMethod: 'creditCard', status: 'paid' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: 'prod-uuid',
      paymentMethod: 'creditCard',
      customer: fakeCustomer,
      card: {
        number: '4111111111111111',
        holderName: 'MARIA SILVA',
        expirationDate: '2030-12',
        cvv: '123',
        installments: 2
      }
    });

    expect(calls[0]!.body).toMatchObject({
      paymentMethod: 'creditCard',
      card: { number: '4111111111111111', installments: 2 }
    });
    expect(calls[0]!.body).not.toHaveProperty('cardInfo');
  });

  it('respects a caller-supplied idempotency key', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: pixCharge }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: 'prod-uuid',
      paymentMethod: 'pix',
      customer: fakeCustomer,
      idempotencyKey: 'my-key-123'
    });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('my-key-123');
  });
});

describe('charges.retrieve', () => {
  it('gets a charge by uuid', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: pixCharge }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.retrieve(CHARGE_UUID);

    expect(charge.uuid).toBe(CHARGE_UUID);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/charges/${CHARGE_UUID}`);
    expect(calls[0]!.method).toBe('GET');
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'not found' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.charges.retrieve('missing')).rejects.toBeInstanceOf(GaruNotFoundError);
  });
});

describe('charges.list', () => {
  it('returns the v1 envelope and defaults', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [pixCharge], count: 1, totalCount: 137, totalPages: 7 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.charges.list();

    expect(result.totalCount).toBe(137);
    expect(result.count).toBe(1);
    expect(result.data[0]!.uuid).toBe(CHARGE_UUID);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/v1/charges');
  });

  it('passes filters as query params', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.list({
      status: 'paid',
      paymentMethod: 'creditCard',
      productId: 'prod-uuid',
      createdAfter: '2026-07-01T00:00:00Z',
      limit: 50,
      sort: '-amount'
    });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/v1/charges');
    expect(url.searchParams.get('status')).toBe('paid');
    expect(url.searchParams.get('paymentMethod')).toBe('creditCard');
    expect(url.searchParams.get('productId')).toBe('prod-uuid');
    expect(url.searchParams.get('createdAfter')).toBe('2026-07-01T00:00:00Z');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('sort')).toBe('-amount');
  });
});

describe('charges.refund', () => {
  it('refunds partially with amount in reais and reason', async () => {
    const { fetch, calls } = mockFetch([
      {
        status: 200,
        body: {
          ...pixCharge,
          status: 'refunded',
          refund: { amount: 10.0, reason: 'Cliente desistiu', refundedAt: '2026-07-23T10:00:00Z' }
        }
      }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.refund(CHARGE_UUID, {
      amount: 10.0,
      reason: 'Cliente desistiu'
    });

    expect(charge.refund?.amount).toBe(10.0);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/charges/${CHARGE_UUID}/refund`);
    expect(calls[0]!.method).toBe('POST');
    // Reais, not centavos — 10.0 must travel as 10, never 1000.
    expect(calls[0]!.body).toEqual({ amount: 10.0, reason: 'Cliente desistiu' });
  });

  it('reports a Pix refund still settling as refund_pending', async () => {
    const { fetch } = mockFetch([
      {
        status: 200,
        body: {
          ...pixCharge,
          status: 'refund_pending',
          refund: { amount: 349.0, reason: null, refundedAt: null }
        }
      }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.refund(CHARGE_UUID);

    expect(charge.status).toBe('refund_pending');
    expect(charge.refund?.refundedAt).toBeNull();
  });

  it('maps 400 to GaruValidationError and does not retry', async () => {
    const { fetch, calls } = mockFetch([{ status: 400, body: { message: 'not refundable' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 2 });

    await expect(garu.charges.refund(CHARGE_UUID)).rejects.toBeInstanceOf(GaruValidationError);
    expect(calls).toHaveLength(1);
  });
});

describe('charges.cancel', () => {
  it('deletes the charge by uuid', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { canceled: true } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.charges.cancel(CHARGE_UUID);

    expect(result.canceled).toBe(true);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/charges/${CHARGE_UUID}`);
    expect(calls[0]!.method).toBe('DELETE');
  });
});
