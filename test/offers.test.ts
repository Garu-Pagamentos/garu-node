import { describe, expect, it } from 'vitest';

import { Garu, GaruAPIError } from '../src/index.js';
import { mockFetch } from './helpers.js';

const PRODUCT = 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f';
const OFFER = 'offer_1Hv7j4EGexuTiOU5BlLNGGuL';

const offerBody = {
  id: OFFER,
  productUuid: PRODUCT,
  name: 'Black Friday',
  slug: 'black-friday',
  value: 97.0,
  isActive: true,
  createdAt: '2026-09-12T14:22:01.000Z',
  updatedAt: '2026-09-12T14:22:01.000Z'
};

describe('offers.list', () => {
  it('lists a product offers, active by default', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [offerBody], totalCount: 1, totalPages: 1 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const result = await garu.offers.list(PRODUCT);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.value).toBe(97.0);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/products/${PRODUCT}/offers`);
    expect(calls[0]!.method).toBe('GET');
  });

  it('passes the active filter and pagination', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], totalCount: 0, totalPages: 0 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.offers.list(PRODUCT, { active: 'all', page: 2, limit: 5 });

    expect(calls[0]!.url).toContain('active=all');
    expect(calls[0]!.url).toContain('page=2');
    expect(calls[0]!.url).toContain('limit=5');
  });
});

describe('offers.create', () => {
  it('sends the price in reais, not centavos', async () => {
    // The unit is the one thing an integrator gets wrong most expensively.
    const { fetch, calls } = mockFetch([{ status: 201, body: offerBody }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.offers.create(PRODUCT, { name: 'Black Friday', value: 97.0, slug: 'black-friday' });

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ name: 'Black Friday', value: 97.0, slug: 'black-friday' });
  });

  it('surfaces the 409 when the price cannot cover fixed co-producer shares', async () => {
    const conflict = {
      status: 409,
      body: { message: 'Este produto tem R$ 150,00 em co-produtores de valor fixo.' }
    };
    const { fetch } = mockFetch([conflict, conflict]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    // A 409 here is deliberately a generic GaruAPIError, not a duplicate-charge
    // error — errors.ts keeps that mapping narrow on purpose. Integrators
    // distinguish the cases by `status` and `message`.
    await expect(garu.offers.create(PRODUCT, { name: 'Promo', value: 97 })).rejects.toMatchObject({
      status: 409
    });
    expect(
      await garu.offers
        .create(PRODUCT, { name: 'Promo', value: 97 })
        .catch((e: unknown) => e instanceof GaruAPIError)
    ).toBe(true);
  });
});

describe('offers.update / del', () => {
  it('deactivates without deleting, so past sales keep their attribution', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { ...offerBody, isActive: false } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const updated = await garu.offers.update(OFFER, { isActive: false });

    expect(updated.isActive).toBe(false);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/offers/${OFFER}`);
  });

  it('refuses to delete an offer that already sold', async () => {
    const { fetch } = mockFetch([
      { status: 409, body: { message: 'Esta oferta já tem vendas e não pode ser excluída.' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.offers.del(OFFER)).rejects.toMatchObject({ status: 409 });
  });
});

describe('charges.create with an offer', () => {
  it('forwards the offer so the server prices from it', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { uuid: 'chg_1', status: 'pending' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: PRODUCT,
      offer: 'black-friday',
      paymentMethod: 'pix',
      customer: {
        name: 'Maria',
        email: 'maria@example.com',
        document: '52998224725',
        phone: '11999999999'
      }
    });

    expect((calls[0]!.body as Record<string, unknown>).offer).toBe('black-friday');
  });

  it('omits the field entirely when no offer is given', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { uuid: 'chg_1', status: 'pending' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: PRODUCT,
      paymentMethod: 'pix',
      customer: {
        name: 'Maria',
        email: 'maria@example.com',
        document: '52998224725',
        phone: '11999999999'
      }
    });

    expect((calls[0]!.body as Record<string, unknown>).offer).toBeUndefined();
  });
});
