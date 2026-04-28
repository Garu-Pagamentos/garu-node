import type { HttpClient } from '../http.js';
import type { ListProductsParams, Product, ProductList } from '../types.js';

/**
 * Products — discover products available to charge.
 *
 * Products are scoped to the seller identified by the API key. The UUID
 * returned here is the same identifier accepted by `charges.create({ productId })`.
 */
export class Products {
  constructor(private readonly http: HttpClient) {}

  /**
   * List products for the authenticated seller, with pagination and search.
   *
   * @example
   * const { data, meta } = await garu.products.list({ search: 'curso', limit: 10 });
   */
  async list(params: ListProductsParams = {}): Promise<ProductList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.search) query.search = params.search;
    if (params.tab) query.tab = params.tab;

    const qs = new URLSearchParams(query).toString();
    const url = `/api/products/seller${qs ? `?${qs}` : ''}`;

    return this.http.call<ProductList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: ProductList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch a single product by UUID — the same identifier used by
   * `charges.create({ productId })`.
   *
   * @example
   * const product = await garu.products.get('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f');
   */
  async get(uuid: string): Promise<Product> {
    return this.http.call<Product>((signal) =>
      (this.http.client.GET as Function)(`/api/products/uuid/${uuid}`, { signal }).then(
        (r: { data?: Product; error?: unknown; response: Response }) => r
      )
    );
  }
}
