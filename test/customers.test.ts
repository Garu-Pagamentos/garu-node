import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError } from '../src/index.js';
import { mockFetch } from './helpers.js';

const fakeCustomer = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com.br',
  document: '12345678909',
  phone: '11987654321',
  personType: 'fisica' as const
};

const CUSTOMER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('customers.create', () => {
  it('creates a customer', async () => {
    const saved = {
      uuid: CUSTOMER_UUID,
      ...fakeCustomer,
      billingEmail: fakeCustomer.email,
      hasBillingEmailOverride: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: saved }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.create(fakeCustomer);

    expect(result.uuid).toBe(CUSTOMER_UUID);
    expect(result.name).toBe('Maria Silva');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/v1/customers');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toMatchObject(fakeCustomer);
    expect(calls[0]!.body).not.toHaveProperty('idempotencyKey');
    expect(calls[0]!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('respects a caller-supplied idempotency key', async () => {
    const saved = {
      uuid: CUSTOMER_UUID,
      ...fakeCustomer,
      billingEmail: fakeCustomer.email,
      hasBillingEmailOverride: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: saved }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.create({ ...fakeCustomer, idempotencyKey: 'idem-key-1' });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('idem-key-1');
  });
});

describe('customers.list', () => {
  it('lists customers with defaults', async () => {
    const listBody = {
      data: [{ uuid: CUSTOMER_UUID, name: 'Maria' }],
      count: 1,
      totalCount: 1,
      totalPages: 1
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.list();

    expect(result.data).toHaveLength(1);
    expect(result.totalCount).toBe(1);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/v1/customers');
    expect(calls[0]!.method).toBe('GET');
  });

  it('passes search and pagination', async () => {
    const listBody = { data: [], count: 0, totalCount: 0, totalPages: 0 };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.list({ page: 2, limit: 5, search: 'maria' });

    const url = calls[0]!.url;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
    expect(url).toContain('search=maria');
  });

  it('passes the overdue status filter', async () => {
    const listBody = { data: [], count: 0, totalCount: 0, totalPages: 0 };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.list({ status: 'overdue' });

    expect(calls[0]!.url).toContain('status=overdue');
  });
});

describe('customers.get', () => {
  it('fetches a single customer by uuid', async () => {
    const customer = { uuid: CUSTOMER_UUID, name: 'João', email: 'joao@test.com' };
    const { fetch, calls } = mockFetch([{ status: 200, body: customer }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.get(CUSTOMER_UUID);

    expect(result.uuid).toBe(CUSTOMER_UUID);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/customers/${CUSTOMER_UUID}`);
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Customer not found' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.customers.get('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      GaruNotFoundError
    );
  });
});

describe('customers.update', () => {
  it('partially updates a customer via PATCH', async () => {
    const updated = { uuid: CUSTOMER_UUID, name: 'Maria Santos', email: 'maria@test.com' };
    const { fetch, calls } = mockFetch([{ status: 200, body: updated }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.update(CUSTOMER_UUID, { name: 'Maria Santos' });

    expect(result.name).toBe('Maria Santos');
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/customers/${CUSTOMER_UUID}`);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toEqual({ name: 'Maria Santos' });
  });
});

describe('customers.setBillingEmailOverride', () => {
  it('sets the override', async () => {
    const updated = {
      uuid: CUSTOMER_UUID,
      billingEmail: 'cobrancas@empresa.com.br',
      hasBillingEmailOverride: true
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: updated }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.setBillingEmailOverride(CUSTOMER_UUID, {
      billingEmailOverride: 'cobrancas@empresa.com.br'
    });

    expect(result.hasBillingEmailOverride).toBe(true);
    expect(calls[0]!.url).toBe(
      `https://garu.com.br/api/v1/customers/${CUSTOMER_UUID}/billing-email-override`
    );
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toEqual({ billingEmailOverride: 'cobrancas@empresa.com.br' });
  });

  it('clears the override with null', async () => {
    const updated = { uuid: CUSTOMER_UUID, hasBillingEmailOverride: false };
    const { fetch, calls } = mockFetch([{ status: 200, body: updated }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.setBillingEmailOverride(CUSTOMER_UUID, { billingEmailOverride: null });

    expect(calls[0]!.body).toEqual({ billingEmailOverride: null });
  });
});

describe('customers.delete', () => {
  it('deletes a customer by uuid', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { removed: true } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.delete(CUSTOMER_UUID);

    expect(result.removed).toBe(true);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/customers/${CUSTOMER_UUID}`);
    expect(calls[0]!.method).toBe('DELETE');
  });
});
