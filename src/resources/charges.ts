import type { HttpClient } from '../http.js';
import type { components } from '../generated/schema.js';
import { generateIdempotencyKey } from '../idempotency.js';
import {
  toWirePaymentMethod,
  type Charge,
  type ChargeList,
  type CreateChargeParams,
  type ListChargesParams,
  type RefundChargeParams
} from '../types.js';

type CreateTransactionBody = components['schemas']['CreateTransactionRequest'];

/**
 * Charges — the core of the Garu API.
 *
 * A charge represents a single payment attempt against a product. The SDK
 * surfaces charges under `garu.charges` even though the backend route is
 * `/api/transactions` — this matches Stripe convention and is the name every
 * other Garu surface (MCP, CLI, docs) uses.
 */
export class Charges {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a charge (PIX, credit card, or boleto).
   *
   * Automatically attaches an `X-Idempotency-Key` header — if you don't pass
   * `idempotencyKey`, the SDK generates a UUIDv4. Safe to retry: the backend
   * caches the first response for 24h.
   *
   * @example
   * // PIX charge
   * const charge = await garu.charges.create({
   *   productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
   *   paymentMethod: 'pix',
   *   customer: {
   *     name: 'Maria Silva',
   *     email: 'maria@exemplo.com.br',
   *     document: '12345678909',
   *     phone: '11987654321'
   *   }
   * });
   * // charge.id, charge.status
   *
   * @example
   * // Credit card charge, 3 installments
   * const charge = await garu.charges.create({
   *   productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
   *   paymentMethod: 'credit_card',
   *   customer: { name: 'Maria Silva', email: 'maria@exemplo.com.br', document: '12345678909', phone: '11987654321' },
   *   cardInfo: {
   *     cardNumber: '4111111111111111',
   *     cvv: '123',
   *     expirationDate: '2030-12',
   *     holderName: 'MARIA SILVA',
   *     installments: 3
   *   }
   * });
   */
  async create(params: CreateChargeParams): Promise<Charge> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const body = this.buildCreateBody(params);

    return this.http.call<Charge>(
      (signal) =>
        this.http.client.POST('/api/transactions', {
          body,
          headers: { 'X-Idempotency-Key': idempotencyKey },
          signal
        }) as Promise<{ data?: Charge; error?: unknown; response: Response }>
    );
  }

  /**
   * List charges for the authenticated seller, with pagination and filters.
   *
   * @example
   * const { data, meta } = await garu.charges.list({ status: 'paid', limit: 10 });
   * // meta.total paid charges
   */
  async list(params: ListChargesParams = {}): Promise<ChargeList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.status) query.status = params.status;
    if (params.search) query.search = params.search;
    if (params.paymentMethod) query.paymentMethod = params.paymentMethod;

    const qs = new URLSearchParams(query).toString();
    const url = `/api/transactions${qs ? `?${qs}` : ''}`;

    return this.http.call<ChargeList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: ChargeList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch a single charge by numeric ID.
   *
   * @example
   * const charge = await garu.charges.get(4472);
   * if (charge.status === 'paid') { ... }
   */
  async get(id: number): Promise<Charge> {
    return this.http.call<Charge>(
      (signal) =>
        this.http.client.GET('/api/transactions/{id}', {
          params: { path: { id } },
          signal
        }) as Promise<{ data?: Charge; error?: unknown; response: Response }>
    );
  }

  /**
   * Refund a charge — fully, or partially by passing `amount` in centavos.
   *
   * @example
   * // Full refund
   * await garu.charges.refund(4472);
   *
   * @example
   * // Partial refund of R$ 10,00
   * await garu.charges.refund(4472, { amount: 1000, reason: 'customer_request' });
   */
  async refund(id: number, params: RefundChargeParams = {}): Promise<Charge> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const body: Record<string, unknown> = {};
    if (params.amount !== undefined) body.amount = params.amount;
    if (params.reason !== undefined) body.reason = params.reason;

    return this.http.call<Charge>(
      (signal) =>
        this.http.client.POST('/api/transactions/{id}/refund', {
          params: { path: { id } },
          body: body as never,
          headers: { 'X-Idempotency-Key': idempotencyKey },
          signal
        }) as Promise<{ data?: Charge; error?: unknown; response: Response }>
    );
  }

  private buildCreateBody(params: CreateChargeParams): CreateTransactionBody {
    const body: Record<string, unknown> = {
      customer: params.customer,
      productId: params.productId,
      paymentMethodId: toWirePaymentMethod(params.paymentMethod),
      link: params.link ?? null,
      affiliateId: params.affiliateId ?? null
    };
    if (params.additionalInfo !== undefined) body.additionalInfo = params.additionalInfo;
    if (params.priceId !== undefined) body.priceId = params.priceId;
    if (params.checkoutSessionToken !== undefined) {
      body.checkoutSessionToken = params.checkoutSessionToken;
    }
    if (params.cardInfo) body.CardInfo = params.cardInfo;
    return body as unknown as CreateTransactionBody;
  }
}
