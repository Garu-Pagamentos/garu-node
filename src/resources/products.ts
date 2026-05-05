import type { HttpClient } from '../http.js';
import type {
  ListProductsParams,
  Product,
  ProductList,
  ProductPortalConfig,
  SetProductPortalConfigParams
} from '../types.js';

/**
 * Per-product portal customization (Garu v0.8.0). Used by B2B2C platforms
 * that model their professionals/coaches as Products under a single seller
 * and want per-product branding on the customer payment + portal pages.
 */
export class ProductPortalConfigResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get the portal customization for a product. Returns `null` when no
   * per-product config exists (the product falls back to seller-level
   * portal config).
   *
   * @example
   * const cfg = await garu.products.portalConfig.get(57);
   */
  async get(productId: number): Promise<ProductPortalConfig | null> {
    return this.http.call<ProductPortalConfig | null>((signal) =>
      (this.http.client.GET as Function)(`/api/products/${productId}/portal-config`, {
        signal
      }).then((r: { data?: ProductPortalConfig | null; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Create or merge the portal customization (idempotent upsert). Both
   * `set` and `patch` have the same merge semantics — only fields present
   * in the body are written, unspecified fields keep their persisted
   * value. Use `clear` to reset everything.
   *
   * @example
   * await garu.products.portalConfig.set(57, {
   *   businessName: 'Coach Maria — Corrida & Trilha',
   *   primaryColor: '#257264',
   *   logoUrl: 'https://cdn.atletia.com.br/coaches/maria.png'
   * });
   */
  async set(productId: number, params: SetProductPortalConfigParams): Promise<ProductPortalConfig> {
    return this.http.call<ProductPortalConfig>((signal) =>
      (this.http.client.POST as Function)(`/api/products/${productId}/portal-config`, {
        body: params,
        signal
      }).then((r: { data?: ProductPortalConfig; error?: unknown; response: Response }) => r)
    );
  }

  /** Same merge semantics as `set` — alias for HTTP-PATCH-prefering callers. */
  async patch(
    productId: number,
    params: SetProductPortalConfigParams
  ): Promise<ProductPortalConfig> {
    return this.http.call<ProductPortalConfig>((signal) =>
      (this.http.client.PATCH as Function)(`/api/products/${productId}/portal-config`, {
        body: params,
        signal
      }).then((r: { data?: ProductPortalConfig; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Remove the per-product config. The product falls back to the
   * seller-level portal config. Returns `{ removed: true }` when a row was
   * deleted, `{ removed: false }` when there was nothing to remove.
   *
   * @example
   * await garu.products.portalConfig.clear(57);
   */
  async clear(productId: number): Promise<{ removed: boolean }> {
    return this.http.call<{ removed: boolean }>((signal) =>
      (this.http.client.DELETE as Function)(`/api/products/${productId}/portal-config`, {
        signal
      }).then((r: { data?: { removed: boolean }; error?: unknown; response: Response }) => r)
    );
  }
}

/**
 * Products — discover products available to charge, and customize the
 * per-product portal experience (v0.8.0).
 *
 * Products are scoped to the seller identified by the API key. The UUID
 * returned here is the same identifier accepted by `charges.create({ productId })`.
 */
export class Products {
  /** Per-product portal customization (Garu v0.8.0). */
  readonly portalConfig: ProductPortalConfigResource;

  constructor(private readonly http: HttpClient) {
    this.portalConfig = new ProductPortalConfigResource(http);
  }

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
