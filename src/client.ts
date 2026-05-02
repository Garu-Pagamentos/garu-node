import { HttpClient } from './http.js';
import { Charges } from './resources/charges.js';
import { Customers } from './resources/customers.js';
import { Meta } from './resources/meta.js';
import { Products } from './resources/products.js';
import { ScheduledCharges } from './resources/scheduled-charges.js';
import { webhooks } from './webhooks.js';

export interface GaruOptions {
  /**
   * Your Garu API key. `sk_live_…` for production, `sk_test_…` for test mode.
   * Optional — public endpoints (`meta.get`, public charge creation) work without one.
   */
  apiKey?: string;
  /** Override the API base URL. Default: `https://garu.com.br/api`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** Max retries on retryable errors (connection, 408, 429, 5xx). Default: 2. */
  maxRetries?: number;
  /** Injectable for tests. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://garu.com.br';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const SDK_VERSION = '0.3.0';

/**
 * The Garu SDK client.
 *
 * @example
 * import { Garu } from '@garuhq/node';
 *
 * const garu = new Garu({ apiKey: process.env.GARU_API_KEY });
 *
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
 */
export class Garu {
  public readonly charges: Charges;
  public readonly customers: Customers;
  public readonly meta: Meta;
  public readonly products: Products;
  public readonly scheduledCharges: ScheduledCharges;

  /**
   * Webhook helpers. Available both as an instance member and as a static —
   * `Garu.webhooks.verify(...)` works without constructing a client.
   */
  public static readonly webhooks = webhooks;
  public readonly webhooks = webhooks;

  constructor(options: GaruOptions = {}) {
    const http = new HttpClient({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      userAgent: `garu-node/${SDK_VERSION}`,
      fetch: options.fetch
    });
    this.charges = new Charges(http);
    this.customers = new Customers(http);
    this.meta = new Meta(http);
    this.products = new Products(http);
    this.scheduledCharges = new ScheduledCharges(http);
  }
}
