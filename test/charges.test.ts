import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError, GaruValidationError } from '../src/index.js';
import { mockFetch } from './helpers.js';

const fakeCustomer = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com.br',
  document: '12345678909',
  phone: '11987654321'
};

describe('charges.create', () => {
  it('sends a PIX charge with auto-generated idempotency key', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { id: 1, status: 'pending', paymentMethodId: 'pix' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.create({
      productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
      paymentMethod: 'pix',
      customer: fakeCustomer
    });

    expect(charge.id).toBe(1);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe('https://garu.com.br/api/transactions');
    expect(call!.method).toBe('POST');
    expect(call!.headers.authorization).toBe('Bearer sk_test_abc');
    expect(call!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(call!.body).toMatchObject({
      productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
      paymentMethodId: 'pix',
      customer: fakeCustomer,
      link: null,
      affiliateId: null
    });
  });

  it('maps credit_card to backend wire value creditcard and attaches CardInfo', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: { id: 2, status: 'authorized' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: 'prod-uuid',
      paymentMethod: 'credit_card',
      customer: fakeCustomer,
      cardInfo: {
        cardNumber: '4111111111111111',
        cvv: '123',
        expirationDate: '2030-12',
        holderName: 'MARIA SILVA',
        installments: 3
      }
    });

    const [call] = calls;
    expect((call!.body as { paymentMethodId: string }).paymentMethodId).toBe('creditcard');
    expect((call!.body as { CardInfo: { installments: number } }).CardInfo.installments).toBe(3);
  });

  it('respects caller-supplied idempotency key', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: { id: 3 } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.create({
      productId: 'p',
      paymentMethod: 'pix',
      customer: fakeCustomer,
      idempotencyKey: 'my-custom-key'
    });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('my-custom-key');
  });
});

describe('charges.refund', () => {
  it('refunds partially with amount and reason', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { id: 7, status: 'refunded' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await garu.charges.refund(7, { amount: 1000, reason: 'customer_request' });

    expect(calls[0]!.url).toBe('https://garu.com.br/api/transactions/7/refund');
    expect(calls[0]!.body).toEqual({ amount: 1000, reason: 'customer_request' });
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { statusCode: 404, message: 'Transação não encontrada' } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    await expect(garu.charges.refund(999)).rejects.toBeInstanceOf(GaruNotFoundError);
  });

  it('maps 400 to GaruValidationError and does not retry', async () => {
    const { fetch, calls } = mockFetch([
      { status: 400, body: { message: 'Invalid amount' } },
      { status: 200, body: { id: 7 } }
    ]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 2 });

    await expect(garu.charges.refund(7, { amount: -1 })).rejects.toBeInstanceOf(
      GaruValidationError
    );
    expect(calls).toHaveLength(1);
  });
});

describe('charges.get', () => {
  it('hits the right path', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { id: 4472, status: 'paid' } }]);
    const garu = new Garu({ apiKey: 'sk_test_abc', fetch, maxRetries: 0 });

    const charge = await garu.charges.get(4472);

    expect(charge.status).toBe('paid');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/transactions/4472');
    expect(calls[0]!.method).toBe('GET');
  });
});
