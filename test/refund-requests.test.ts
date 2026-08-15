import { describe, expect, it } from 'vitest';

import { Garu } from '../src/index.js';
import { mockFetch } from './helpers.js';

const REQUEST_UUID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PLAN_UUID = 'e5d0d8fe-0000-4000-8000-000000000001';

const requestBody = {
  uuid: REQUEST_UUID,
  status: 'pending',
  amount: 390,
  reason: 'Comprador desistiu',
  installmentPlanId: PLAN_UUID,
  chargeId: null,
  requestedBy: { type: 'user', id: 3 },
  resolvedBy: null,
  sellerNote: null,
  resolvedAt: null,
  createdAt: '2026-09-01T09:00:00.000Z'
};

describe('refundRequests.list', () => {
  it('answers "what do I still owe a buyer"', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [requestBody], count: 1, totalCount: 1, totalPages: 1 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const owed = await garu.refundRequests.list({ status: 'pending' });

    expect(calls[0]!.url).toContain('status=pending');
    expect(owed.data[0]!.amount).toBe(390);
  });

  it('filters by carnê or by charge', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } },
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.refundRequests.list({ planId: PLAN_UUID });
    await garu.refundRequests.list({ chargeId: 'charge-uuid' });

    expect(calls[0]!.url).toContain(`planId=${PLAN_UUID}`);
    expect(calls[1]!.url).toContain('chargeId=charge-uuid');
  });
});

describe('refundRequests.confirm', () => {
  it('records the seller assertion, and only that', async () => {
    // Garu never observes the transfer. Confirming says "I sent it"; the
    // money moved out of band, before this call.
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...requestBody, status: 'confirmed', sellerNote: 'Pix E123' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.refundRequests.confirm(REQUEST_UUID, { note: 'Pix E123' });

    expect(calls[0]!.url).toBe(
      `https://garu.com.br/api/v1/refund-requests/${REQUEST_UUID}/confirm`
    );
    expect(calls[0]!.body).toMatchObject({ note: 'Pix E123' });
    expect(result.status).toBe('confirmed');
  });

  it('rejects without touching the carnê', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...requestBody, status: 'rejected' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.refundRequests.reject(REQUEST_UUID);

    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/refund-requests/${REQUEST_UUID}/reject`);
    expect(result.status).toBe('rejected');
  });
});
