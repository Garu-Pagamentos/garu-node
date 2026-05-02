import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError } from '../src/index.js';
import { mockFetch } from './helpers.js';

const fakeCharge = {
  id: 'sch_abc123',
  sellerId: 10,
  customerId: 42,
  productId: null,
  amount: 297.5,
  description: 'Mensalidade Junho',
  type: 'one_time' as const,
  dueDate: '2026-06-15',
  methods: ['pix', 'boleto'] as const,
  status: 'scheduled' as const,
  externalReference: null,
  metadata: null,
  createdAt: '2026-05-01T12:00:00Z',
  updatedAt: '2026-05-01T12:00:00Z'
};

const newClient = (fetchImpl: typeof fetch): Garu =>
  new Garu({ apiKey: 'sk_test_abc', fetch: fetchImpl, maxRetries: 0 });

describe('scheduledCharges.create', () => {
  it('posts the body and returns the schedule', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: fakeCharge }]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.create({
      customerId: 42,
      amount: 297.5,
      type: 'one_time',
      dueDate: '2026-06-15',
      methods: ['pix', 'boleto'],
      description: 'Mensalidade Junho'
    });

    expect(result.id).toBe('sch_abc123');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toMatchObject({
      customerId: 42,
      amount: 297.5,
      type: 'one_time',
      dueDate: '2026-06-15',
      methods: ['pix', 'boleto']
    });
  });

  it('auto-attaches an X-Idempotency-Key (UUIDv4) when caller omits one', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: fakeCharge }]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.create({
      customerId: 42,
      amount: 297.5,
      type: 'one_time',
      dueDate: '2026-06-15',
      methods: ['pix']
    });

    expect(calls[0]!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    // The idempotency key must NOT leak into the request body.
    expect(calls[0]!.body).not.toHaveProperty('idempotencyKey');
  });

  it('respects a caller-supplied idempotency key', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: fakeCharge }]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.create({
      customerId: 42,
      amount: 297.5,
      type: 'one_time',
      dueDate: '2026-06-15',
      methods: ['pix'],
      idempotencyKey: 'my-stable-key'
    });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('my-stable-key');
    expect(calls[0]!.body).not.toHaveProperty('idempotencyKey');
  });
});

describe('scheduledCharges.list', () => {
  it('lists with no filters and default pagination', async () => {
    const listBody = {
      data: [fakeCharge],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.list();

    expect(result.data).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges');
    expect(calls[0]!.method).toBe('GET');
  });

  it('forwards a single status as one query param', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.list({ status: 'overdue', limit: 50 });

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges?limit=50&status=overdue');
  });

  it('forwards multiple statuses as repeated query params', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.list({ status: ['scheduled', 'due_today'] });

    expect(calls[0]!.url).toBe(
      'https://garu.com.br/api/scheduled-charges?status=scheduled&status=due_today'
    );
  });

  it('forwards customer + date-range filters', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.list({
      customerId: 42,
      type: 'one_time',
      dueFrom: '2026-06-01',
      dueTo: '2026-06-30',
      search: 'maria'
    });

    expect(calls[0]!.url).toContain('customerId=42');
    expect(calls[0]!.url).toContain('type=one_time');
    expect(calls[0]!.url).toContain('dueFrom=2026-06-01');
    expect(calls[0]!.url).toContain('dueTo=2026-06-30');
    expect(calls[0]!.url).toContain('search=maria');
  });
});

describe('scheduledCharges.get', () => {
  it('returns the bundle (charge + events + transactions)', async () => {
    const detail = {
      charge: fakeCharge,
      events: [
        {
          id: 1,
          scheduledChargeId: 'sch_abc123',
          eventType: 'created',
          actor: { type: 'user', id: 1 },
          payload: { amount: 297.5 },
          createdAt: '2026-05-01T12:00:00Z'
        }
      ],
      transactions: []
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: detail }]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.get('sch_abc123');

    expect(result.charge.id).toBe('sch_abc123');
    expect(result.events).toHaveLength(1);
    expect(result.transactions).toHaveLength(0);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123');
    expect(calls[0]!.method).toBe('GET');
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { message: 'Scheduled charge not found.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.scheduledCharges.get('sch_missing')).rejects.toBeInstanceOf(
      GaruNotFoundError
    );
  });
});

describe('scheduledCharges.postpone', () => {
  it('posts new dueDate + reason to the action endpoint', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...fakeCharge, dueDate: '2026-07-01' } }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.postpone('sch_abc123', {
      newDueDate: '2026-07-01',
      reason: 'cliente pediu mais prazo'
    });

    expect(result.dueDate).toBe('2026-07-01');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/postpone');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      newDueDate: '2026-07-01',
      reason: 'cliente pediu mais prazo'
    });
  });
});

describe('scheduledCharges.pause / resume', () => {
  it('pause posts an optional reason', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...fakeCharge, status: 'paused' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.pause('sch_abc123', { reason: 'em negociação' });

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/pause');
    expect(calls[0]!.body).toEqual({ reason: 'em negociação' });
  });

  it('pause works with no params', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...fakeCharge, status: 'paused' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.pause('sch_abc123');

    expect(calls[0]!.body).toEqual({});
  });

  it('resume posts no body', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...fakeCharge, status: 'scheduled' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.resume('sch_abc123');

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/resume');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toBeUndefined();
  });
});

describe('scheduledCharges.markPaid', () => {
  it('posts paymentDate + externalReference', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { ...fakeCharge, status: 'paid' } }]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.markPaid('sch_abc123', {
      paymentDate: '2026-06-20',
      externalReference: 'TED 4472881'
    });

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/mark-paid');
    expect(calls[0]!.body).toEqual({
      paymentDate: '2026-06-20',
      externalReference: 'TED 4472881'
    });
  });
});
