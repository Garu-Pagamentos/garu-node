import type { HttpClient, OpenapiCallResult } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  CancelChargeResult,
  Charge,
  ChargeList,
  CreateChargeParams,
  ListChargesParams,
  RefundChargeParams
} from '../types.js';

/**
 * Charges — create and manage payments against a product.
 *
 * Backed by `/api/v1/charges`, the versioned public contract. A charge is keyed
 * by `uuid`; there is no numeric id. Create returns everything needed to render
 * a transparent checkout: the PIX EMV (`pix.code`), the boleto line and a
 * Garu-hosted PDF (`boleto`), or the card authorization (`card`).
 */
export class Charges {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a charge (PIX, boleto, or credit card).
   *
   * Attaches an `X-Idempotency-Key` header automatically — if you don't pass
   * `idempotencyKey`, the SDK generates a UUIDv4. Safe to retry: the same key
   * returns the original charge for 24h.
   *
   * @example
   * // PIX — render charge.pix.code as a QR in your own checkout
   * const charge = await garu.charges.create({
   *   productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   *   paymentMethod: 'pix',
   *   customer: {
   *     name: 'Maria Silva',
   *     email: 'maria@exemplo.com.br',
   *     document: '12345678909',
   *     phone: '11987654321'
   *   }
   * });
   * console.log(charge.uuid, charge.pix?.code);
   *
   * @example
   * // Credit card, 2 installments. Server-to-server only (PCI scope).
   * const charge = await garu.charges.create({
   *   productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   *   paymentMethod: 'creditCard',
   *   customer: { name: 'Maria Silva', email: 'maria@exemplo.com.br', document: '12345678909', phone: '11987654321' },
   *   card: {
   *     number: '4111111111111111',
   *     holderName: 'MARIA SILVA',
   *     expirationDate: '2030-12',
   *     cvv: '123',
   *     installments: 2
   *   }
   * });
   * // charge.amount is the base price; charge.chargedTotal is what was charged.
   */
  async create(params: CreateChargeParams): Promise<Charge> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const body: Record<string, unknown> = {
      productId: params.productId,
      paymentMethod: params.paymentMethod,
      customer: params.customer
    };
    if (params.card) body.card = params.card;
    if (params.checkoutSessionToken) body.checkoutSessionToken = params.checkoutSessionToken;
    if (params.additionalInfo !== undefined) body.additionalInfo = params.additionalInfo;

    return this.post<Charge>('/api/v1/charges', body, { 'X-Idempotency-Key': idempotencyKey });
  }

  /**
   * Retrieve a charge by uuid.
   *
   * @example
   * const charge = await garu.charges.retrieve('6f1c9b2e-4a7d-4f0b-9a3e-1d2c3b4a5e6f');
   * if (charge.status === 'paid') fulfil(charge);
   */
  async retrieve(uuid: string): Promise<Charge> {
    return this.get<Charge>(`/api/v1/charges/${encodeURIComponent(uuid)}`);
  }

  /**
   * List charges for the authenticated account, newest first by default.
   *
   * @example
   * const { data, totalCount } = await garu.charges.list({ status: 'paid', limit: 50 });
   * console.log(`${data.length} of ${totalCount} paid charges`);
   */
  async list(params: ListChargesParams = {}): Promise<ChargeList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.status) query.status = params.status;
    if (params.paymentMethod) query.paymentMethod = params.paymentMethod;
    if (params.productId) query.productId = params.productId;
    if (params.createdAfter) query.createdAfter = params.createdAfter;
    if (params.createdBefore) query.createdBefore = params.createdBefore;
    if (params.search) query.search = params.search;
    if (params.sort) query.sort = params.sort;

    const qs = new URLSearchParams(query).toString();
    return this.get<ChargeList>(`/api/v1/charges${qs ? `?${qs}` : ''}`);
  }

  /**
   * Refund a charge, fully or partially. `amount` is in reais.
   *
   * For a Pix Automático charge the refund is a devolução: it returns with the
   * charge in `refund_pending`, reaching `refunded` only once the transfer
   * settles.
   *
   * @example
   * await garu.charges.refund('6f1c9b2e-...');                       // full
   * await garu.charges.refund('6f1c9b2e-...', { amount: 10.0 });     // R$10,00
   */
  async refund(uuid: string, params: RefundChargeParams = {}): Promise<Charge> {
    const body: Record<string, unknown> = {};
    if (params.amount !== undefined) body.amount = params.amount;
    if (params.reason !== undefined) body.reason = params.reason;

    return this.post<Charge>(`/api/v1/charges/${encodeURIComponent(uuid)}/refund`, body);
  }

  /**
   * Cancel an unpaid charge.
   *
   * @example
   * const { canceled } = await garu.charges.cancel('6f1c9b2e-...');
   */
  async cancel(uuid: string): Promise<CancelChargeResult> {
    return this.http.call<CancelChargeResult>(
      (signal) =>
        (this.http.client.DELETE as CallableFunction)(
          `/api/v1/charges/${encodeURIComponent(uuid)}`,
          { signal }
        ) as OpenapiCallResult<CancelChargeResult>
    );
  }

  // v1 charge routes are not in the generated OpenAPI schema (it is regenerated
  // from a live deploy), so these use the client's untyped path.
  private get<T>(url: string): Promise<T> {
    return this.http.call<T>(
      (signal) => (this.http.client.GET as CallableFunction)(url, { signal }) as OpenapiCallResult<T>
    );
  }

  private post<T>(
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.http.call<T>(
      (signal) =>
        (this.http.client.POST as CallableFunction)(url, { body, headers, signal }) as OpenapiCallResult<T>
    );
  }
}
