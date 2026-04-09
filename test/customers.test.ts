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

describe('customers.create', () => {
  it('creates a customer', async () => {
    const saved = { id: 1, ...fakeCustomer, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const { fetch, calls } = mockFetch([{ status: 201, body: saved }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.create(fakeCustomer);

    expect(result.id).toBe(1);
    expect(result.name).toBe('Maria Silva');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/customers');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toMatchObject(fakeCustomer);
  });
});

describe('customers.list', () => {
  it('lists customers with defaults', async () => {
    const listBody = {
      data: [{ id: 1, name: 'Maria' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.list();

    expect(result.data).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/customers');
    expect(calls[0]!.method).toBe('GET');
  });

  it('passes search and pagination', async () => {
    const listBody = { data: [], meta: { page: 2, limit: 5, total: 0, totalPages: 0 } };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.list({ page: 2, limit: 5, search: 'maria' });

    const url = calls[0]!.url;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
    expect(url).toContain('search=maria');
  });
});

describe('customers.get', () => {
  it('fetches a single customer', async () => {
    const customer = { id: 42, name: 'João', email: 'joao@test.com' };
    const { fetch, calls } = mockFetch([{ status: 200, body: customer }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.get(42);

    expect(result.id).toBe(42);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/customers/42');
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Customer not found' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.customers.get(999)).rejects.toBeInstanceOf(GaruNotFoundError);
  });
});

describe('customers.update', () => {
  it('updates a customer', async () => {
    const updated = { id: 42, name: 'Maria Santos', email: 'maria@test.com' };
    const { fetch, calls } = mockFetch([{ status: 200, body: updated }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.customers.update(42, { name: 'Maria Santos' });

    expect(result.name).toBe('Maria Santos');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/customers/42');
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ name: 'Maria Santos' });
  });
});

describe('customers.delete', () => {
  it('deletes a customer', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { message: 'Customer removed from seller' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.customers.delete(42);

    expect(calls[0]!.url).toBe('https://garu.com.br/api/customers/42');
    expect(calls[0]!.method).toBe('DELETE');
  });
});
