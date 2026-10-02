import type { HttpClient } from '../http.js';
import { idempotencyHeaders } from '../idempotency.js';
import type {
  CreateProductParams,
  ListProductsParams,
  Product,
  ProductList,
  ProductPortalConfig,
  SetProductPortalConfigParams,
  UpdateProductParams
} from '../types.js';

/**
 * Per-product portal customization. Used by B2B2C platforms that model
 * their professionals/coaches as Products under a single seller and want
 * per-product branding on the customer payment + portal pages.
 *
 * `productId` accepts either the product UUID (preferred — same identifier
 * returned by `garu.products.list()` and webhook payloads) or the legacy
 * numeric id. UUID support added in Garu v0.10.0.
 */
export class ProductPortalConfigResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get the portal customization for a product. Returns `null` when no
   * per-product config exists (the product falls back to seller-level
   * portal config).
   *
   * @example
   * const cfg = await garu.products.portalConfig.get('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f');
   */
  async get(productId: string | number): Promise<ProductPortalConfig | null> {
    return this.http.call<ProductPortalConfig | null>((signal) =>
      (this.http.client.GET as Function)(
        `/api/v1/products/${encodeURIComponent(String(productId))}/portal-config`,
        {
          signal
        }
      ).then((r: { data?: ProductPortalConfig | null; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Create or merge the portal customization (idempotent upsert). Both
   * `set` and `patch` have the same merge semantics — only fields present
   * in the body are written, unspecified fields keep their persisted
   * value. Use `clear` to reset everything.
   *
   * @example
   * await garu.products.portalConfig.set('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f', {
   *   businessName: 'Coach Maria — Corrida & Trilha',
   *   primaryColor: '#257264',
   *   logoUrl: 'https://cdn.atletia.com.br/coaches/maria.png'
   * });
   */
  async set(
    productId: string | number,
    params: SetProductPortalConfigParams
  ): Promise<ProductPortalConfig> {
    return this.http.call<ProductPortalConfig>((signal) =>
      (this.http.client.POST as Function)(
        `/api/v1/products/${encodeURIComponent(String(productId))}/portal-config`,
        {
          body: params,
          signal
        }
      ).then((r: { data?: ProductPortalConfig; error?: unknown; response: Response }) => r)
    );
  }

  /** Same merge semantics as `set` — alias for HTTP-PATCH-prefering callers. */
  async patch(
    productId: string | number,
    params: SetProductPortalConfigParams
  ): Promise<ProductPortalConfig> {
    return this.http.call<ProductPortalConfig>((signal) =>
      (this.http.client.PATCH as Function)(
        `/api/v1/products/${encodeURIComponent(String(productId))}/portal-config`,
        {
          body: params,
          signal
        }
      ).then((r: { data?: ProductPortalConfig; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Remove the per-product config. The product falls back to the
   * seller-level portal config. Returns `{ removed: true }` when a row was
   * deleted, `{ removed: false }` when there was nothing to remove.
   *
   * @example
   * await garu.products.portalConfig.clear('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f');
   */
  async clear(productId: string | number): Promise<{ removed: boolean }> {
    return this.http.call<{ removed: boolean }>((signal) =>
      (this.http.client.DELETE as Function)(
        `/api/v1/products/${encodeURIComponent(String(productId))}/portal-config`,
        {
          body: {},
          signal
        }
      ).then((r: { data?: { removed: boolean }; error?: unknown; response: Response }) => r)
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
   * const { data, totalCount } = await garu.products.list({ search: 'curso', limit: 10 });
   */
  async list(params: ListProductsParams = {}): Promise<ProductList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.search) query.search = params.search;

    const qs = new URLSearchParams(query).toString();
    const url = `/api/v1/products${qs ? `?${qs}` : ''}`;

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
      (this.http.client.GET as Function)(`/api/v1/products/${uuid}`, { signal }).then(
        (r: { data?: Product; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Create a product for the authenticated seller. Returns the created
   * product (HTTP 201). The API requires `name`, `image` and `value`; the
   * other fields fall back to seller/server defaults.
   *
   * `value` is in reais (decimal BRL), NOT centavos. It must be `0` or at
   * least R$ 5,00, the platform minimum price:
   * - `0` creates a product with no price. It is accepted, but it cannot be
   *   sold through its payment link. Use it when you bill the product another
   *   way, e.g. through scheduled charges.
   * - From `0.01` to `4.99`, or a negative value, the API answers 400
   *   (`GaruValidationError`).
   * - On a subscription product (`isSubscription: true`) the product's own
   *   `value` is not checked: its price lives on its subscription prices.
   *
   * Pass `idempotencyKey` to make this safe to retry: the same key returns the
   * original product for 24h. Derive it from something stable in your own
   * domain (an order id, a booking id) so a retry reproduces it. Omit it and
   * no key is sent — the SDK does NOT invent one, because a key generated per
   * call is different every time and protects nothing.
   *
   * @example
   * const product = await garu.products.create({
   *   name: 'Curso de Fotografia',
   *   image: 'https://cdn.exemplo.com/produtos/fotografia.png',
   *   value: 297.5, // R$ 297,50 in reais (decimal BRL), NOT centavos. Minimum R$ 5,00.
   *   description: 'Acesso completo às aulas',
   *   pix: true,
   *   creditCard: true
   * });
   *
   * @example
   * // Subscription product: its price lives on the subscription prices.
   * const plan = await garu.products.create({
   *   name: 'Plano Mensal',
   *   image: 'https://cdn.exemplo.com/produtos/plano.png',
   *   value: 49.9, // reais
   *   pix: true,
   *   creditCard: true,
   *   isSubscription: true,
   *   subscriptionType: 'monthly',
   *   pixAutomatic: true // expose Pix Automático on the subscription checkout
   * });
   */
  async create(params: CreateProductParams): Promise<Product> {
    const { idempotencyKey, ...body } = params;

    return this.http.call<Product>((signal) =>
      (this.http.client.POST as Function)('/api/v1/products', {
        body,
        headers: idempotencyHeaders(idempotencyKey),
        signal
      }).then((r: { data?: Product; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Update a product (partial PATCH — only the fields you pass are changed).
   * Returns the updated product.
   *
   * `id` accepts the product UUID (recommended) or the legacy numeric id —
   * both resolve on the `/api/v1/products/:id` path (see
   * {@link ProductPortalConfigResource}).
   *
   * The price rule of {@link Products.create} applies only when the request
   * sets a price: `value` must be `0` (no price) or at least R$ 5,00, else
   * 400. Omit `value` to keep the current price — a product priced below
   * R$ 5,00 before the minimum existed keeps selling, and an update that only
   * renames it or toggles a payment method passes. Turning a subscription
   * product into a one-time product (`isSubscription: false`) counts as
   * setting its price, so its stored `value` is checked.
   *
   * @example
   * const updated = await garu.products.update('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f', {
   *   value: 59.9, // R$ 59,90 in reais (decimal BRL), NOT centavos. 0 or at least R$ 5,00.
   *   pixAutomatic: true // turn on Pix Automático for this product
   * });
   */
  async update(id: string | number, params: UpdateProductParams): Promise<Product> {
    return this.http.call<Product>((signal) =>
      (this.http.client.PATCH as Function)(`/api/v1/products/${encodeURIComponent(String(id))}`, {
        body: params,
        signal
      }).then((r: { data?: Product; error?: unknown; response: Response }) => r)
    );
  }
}
