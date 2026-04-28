import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError } from '../src/index.js';
import { mockFetch } from './helpers.js';

describe('products.list', () => {
  it('lists products with defaults', async () => {
    const listBody = {
      data: [{ id: 1, uuid: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f', name: 'Curso' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.products.list();

    expect(result.data).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/products/seller');
    expect(calls[0]!.method).toBe('GET');
  });

  it('passes search, pagination, and tab', async () => {
    const listBody = { data: [], meta: { page: 2, limit: 5, total: 0, totalPages: 0 } };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.products.list({ page: 2, limit: 5, search: 'curso', tab: 'active' });

    const url = calls[0]!.url;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
    expect(url).toContain('search=curso');
    expect(url).toContain('tab=active');
  });
});

describe('products.get', () => {
  it('fetches a product by UUID', async () => {
    const uuid = 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f';
    const product = { id: 42, uuid, name: 'Curso Avançado' };
    const { fetch, calls } = mockFetch([{ status: 200, body: product }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.products.get(uuid);

    expect(result.uuid).toBe(uuid);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/products/uuid/${uuid}`);
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Product not found' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.products.get('does-not-exist')).rejects.toBeInstanceOf(
      GaruNotFoundError
    );
  });
});
