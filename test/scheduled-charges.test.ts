import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError, GaruValidationError } from '../src/index.js';
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
  maxRecoveryDays: null,
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

  it('forwards optional maxRecoveryDays in the body', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { ...fakeCharge, maxRecoveryDays: 30 } }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.create({
      customerId: 42,
      amount: 297.5,
      type: 'one_time',
      dueDate: '2026-06-15',
      methods: ['pix'],
      maxRecoveryDays: 30
    });

    expect(result.maxRecoveryDays).toBe(30);
    expect(calls[0]!.body).toMatchObject({ maxRecoveryDays: 30 });
  });

  it('forwards a recurring pix_automatic schedule (BACEN auto-debit)', async () => {
    const pixAutomaticCharge = {
      ...fakeCharge,
      productId: 17,
      type: 'recurring' as const,
      methods: ['pix_automatic'] as const
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: pixAutomaticCharge }]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.create({
      customerId: 42,
      productId: 17,
      amount: 49.9,
      type: 'recurring',
      dueDate: '2026-06-15',
      methods: ['pix_automatic'],
      recurrence: { interval: 'monthly' }
    });

    expect(result.methods).toEqual(['pix_automatic']);
    expect(calls[0]!.body).toMatchObject({
      productId: 17,
      type: 'recurring',
      methods: ['pix_automatic'],
      recurrence: { interval: 'monthly' }
    });
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

  it('resume posts an empty `{}` body so the backend body-parser accepts it', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { ...fakeCharge, status: 'scheduled' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.resume('sch_abc123');

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/resume');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({});
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

describe('scheduledCharges.chargeNow', () => {
  it('posts an empty `{}` body to the charge-now endpoint and returns the dispatch result', async () => {
    const { fetch, calls } = mockFetch([
      {
        status: 200,
        body: {
          outcome: 'dispatched',
          cycleNumber: 1,
          message: 'Cobrança enviada agora.'
        }
      }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.chargeNow('sch_abc123');

    expect(result.outcome).toBe('dispatched');
    expect(result.cycleNumber).toBe(1);
    expect(result.message).toBe('Cobrança enviada agora.');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch_abc123/charge-now');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({});
  });

  it('does not attach an idempotency key — the endpoint is idempotent server-side', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { outcome: 'dispatched', cycleNumber: null, message: 'ok' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.chargeNow('sch_abc123');

    expect(calls[0]!.headers).not.toHaveProperty('x-idempotency-key');
  });

  it('URL-encodes the id in the path so a stray special char cannot alter the route', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { outcome: 'dispatched', cycleNumber: null, message: 'ok' } }
    ]);
    const garu = newClient(fetch);

    await garu.scheduledCharges.chargeNow('sch a/b');

    expect(calls[0]!.url).toBe('https://garu.com.br/api/scheduled-charges/sch%20a%2Fb/charge-now');
  });

  it('surfaces the already_sent no-op outcome', async () => {
    const { fetch } = mockFetch([
      {
        status: 200,
        body: {
          outcome: 'already_sent',
          cycleNumber: 3,
          message: 'Cobrança deste ciclo já havia sido enviada.'
        }
      }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.chargeNow('sch_abc123');

    expect(result.outcome).toBe('already_sent');
    expect(result.cycleNumber).toBe(3);
  });

  it('surfaces a not_sent outcome with a reason (distinct from failed)', async () => {
    const { fetch } = mockFetch([
      {
        status: 200,
        body: {
          outcome: 'not_sent',
          cycleNumber: 1,
          reason: 'no_saved_payment_method',
          message: 'Nenhum método de pagamento salvo para cobrar.'
        }
      }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.chargeNow('sch_abc123');

    expect(result.outcome).toBe('not_sent');
    expect(result.reason).toBe('no_saved_payment_method');
  });

  it('surfaces a failed outcome with a reason', async () => {
    const { fetch } = mockFetch([
      {
        status: 200,
        body: {
          outcome: 'failed',
          cycleNumber: 2,
          reason: 'card_expired',
          message: 'O cartão salvo está vencido.'
        }
      }
    ]);
    const garu = newClient(fetch);

    const result = await garu.scheduledCharges.chargeNow('sch_abc123');

    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('card_expired');
  });

  it('maps 400 (not in a billable status) to GaruValidationError', async () => {
    const { fetch } = mockFetch([
      { status: 400, body: { message: 'Scheduled charge is not in a billable status.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.scheduledCharges.chargeNow('sch_paid')).rejects.toBeInstanceOf(
      GaruValidationError
    );
  });

  it('maps 404 (not the caller’s charge) to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { message: 'Scheduled charge not found.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.scheduledCharges.chargeNow('sch_missing')).rejects.toBeInstanceOf(
      GaruNotFoundError
    );
  });
});
