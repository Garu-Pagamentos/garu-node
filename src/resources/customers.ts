import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  CreateCustomerParams,
  CustomerList,
  CustomerRecord,
  ListCustomersParams,
  SetBillingEmailOverrideParams,
  UpdateCustomerParams
} from '../types.js';

/**
 * Customers — manage your customer base.
 *
 * Backed by `/api/v1/customers`, keyed on `uuid`. Customers are scoped to the
 * seller identified by the API key. The backend uses a junction table
 * (`customer_seller_profile`) so the same person can exist across multiple
 * sellers without duplication — creating a customer whose `document` already
 * exists globally attaches your own profile to it instead of erroring.
 */
export class Customers {
  constructor(private readonly http: HttpClient) {}

  /**
   * Register a customer for the current seller.
   *
   * Attaches an `X-Idempotency-Key` header automatically — if you don't pass
   * `idempotencyKey`, the SDK generates a UUIDv4. Safe to retry: the same key
   * returns the originally-created/matched customer for 24h.
   *
   * @example
   * const customer = await garu.customers.create({
   *   name: 'Maria Silva',
   *   email: 'maria@exemplo.com.br',
   *   document: '12345678909',
   *   phone: '11987654321',
   *   personType: 'fisica'
   * });
   * customer.uuid;
   */
  async create(params: CreateCustomerParams): Promise<CustomerRecord> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const { idempotencyKey: _omit, ...body } = params;
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.POST as Function)('/api/v1/customers', {
        body,
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: CustomerRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * List customers for the authenticated seller, with pagination and search.
   *
   * @example
   * const { data, totalCount } = await garu.customers.list({ search: 'maria', limit: 10 });
   *
   * @example
   * // Customers with at least one overdue scheduled charge (carnê included).
   * const atRisk = await garu.customers.list({ status: 'overdue' });
   */
  async list(params: ListCustomersParams = {}): Promise<CustomerList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.search) query.search = params.search;
    if (params.status) query.status = params.status;

    const qs = new URLSearchParams(query).toString();
    const url = `/api/v1/customers${qs ? `?${qs}` : ''}`;

    return this.http.call<CustomerList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: CustomerList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch a single customer by uuid.
   *
   * @example
   * const customer = await garu.customers.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
   */
  async get(uuid: string): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.GET as Function)(`/api/v1/customers/${uuid}`, { signal }).then(
        (r: { data?: CustomerRecord; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Update a customer's profile for the current seller. Partial — only the
   * fields you pass change.
   *
   * @example
   * const updated = await garu.customers.update('a1b2c3d4-...', { name: 'Maria Santos' });
   */
  async update(uuid: string, params: UpdateCustomerParams): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.PATCH as Function)(`/api/v1/customers/${uuid}`, {
        body: params,
        signal
      }).then((r: { data?: CustomerRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Set or clear the per-seller billing email override.
   *
   * The override is sticky: it takes precedence over the per-seller last-used
   * email and the global `customer.email` for outbound seller→customer emails,
   * and is **never** auto-overwritten by subsequent payments or registrations.
   *
   * @example
   * // Set
   * await garu.customers.setBillingEmailOverride('a1b2c3d4-...', {
   *   billingEmailOverride: 'cobrancas@empresa.com.br'
   * });
   *
   * // Clear and fall back to the last-used email
   * await garu.customers.setBillingEmailOverride('a1b2c3d4-...', { billingEmailOverride: null });
   */
  async setBillingEmailOverride(
    uuid: string,
    params: SetBillingEmailOverrideParams
  ): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.PATCH as Function)(`/api/v1/customers/${uuid}/billing-email-override`, {
        body: params,
        signal
      }).then((r: { data?: CustomerRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Remove a customer from the current seller (unlinks your profile — the
   * global customer and other sellers' profiles are untouched).
   *
   * @example
   * await garu.customers.delete('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
   */
  async delete(uuid: string): Promise<{ removed: boolean }> {
    return this.http.call<{ removed: boolean }>((signal) =>
      (this.http.client.DELETE as Function)(`/api/v1/customers/${uuid}`, {
        body: {},
        signal
      }).then((r: { data?: { removed: boolean }; error?: unknown; response: Response }) => r)
    );
  }
}
