import type { HttpClient } from '../http.js';
import type {
  CreateCustomerParams,
  CustomerList,
  CustomerRecord,
  ListCustomersParams,
  UpdateCustomerParams
} from '../types.js';

/**
 * Customers — manage your customer base.
 *
 * Customers are scoped to the seller identified by the API key. The backend
 * uses a junction table (`customer_seller_profile`) so the same person can
 * exist across multiple sellers without duplication.
 */
export class Customers {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a customer and link it to the current seller.
   *
   * @example
   * const customer = await garu.customers.create({
   *   name: 'Maria Silva',
   *   email: 'maria@exemplo.com.br',
   *   document: '12345678909',
   *   phone: '11987654321',
   *   personType: 'fisica'
   * });
   */
  async create(params: CreateCustomerParams): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.POST as Function)('/api/customers', {
        body: params,
        signal
      }).then((r: { data?: CustomerRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * List customers for the authenticated seller, with pagination and search.
   *
   * @example
   * const { data, meta } = await garu.customers.list({ search: 'maria', limit: 10 });
   */
  async list(params: ListCustomersParams = {}): Promise<CustomerList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.search) query.search = params.search;

    const qs = new URLSearchParams(query).toString();
    const url = `/api/customers${qs ? `?${qs}` : ''}`;

    return this.http.call<CustomerList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: CustomerList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch a single customer by numeric ID.
   *
   * @example
   * const customer = await garu.customers.get(42);
   */
  async get(id: number): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.GET as Function)(`/api/customers/${id}`, { signal }).then(
        (r: { data?: CustomerRecord; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Update a customer's profile for the current seller.
   *
   * @example
   * const updated = await garu.customers.update(42, { name: 'Maria Santos' });
   */
  async update(id: number, params: UpdateCustomerParams): Promise<CustomerRecord> {
    return this.http.call<CustomerRecord>((signal) =>
      (this.http.client.PUT as Function)(`/api/customers/${id}`, {
        body: params,
        signal
      }).then((r: { data?: CustomerRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Remove a customer from the current seller.
   *
   * @example
   * await garu.customers.delete(42);
   */
  async delete(id: number): Promise<void> {
    await this.http.call<unknown>((signal) =>
      (this.http.client.DELETE as Function)(`/api/customers/${id}`, { signal }).then(
        (r: { data?: unknown; error?: unknown; response: Response }) => r
      )
    );
  }
}
