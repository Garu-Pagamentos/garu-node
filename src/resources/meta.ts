import type { HttpClient } from '../http.js';
import type { MetaResponse } from '../types.js';

/**
 * Meta — capability introspection.
 *
 * Unauthenticated. Used by `garu doctor`, MCP tool `doctor`, and by SDK
 * consumers that want to know which payment methods and webhook events are
 * currently supported.
 */
export class Meta {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch the API's current capability payload.
   *
   * @example
   * const meta = await garu.meta.get();
   * console.log(meta.version, meta.payment_methods);
   * if (meta.features.subscriptions) { ... }
   */
  async get(): Promise<MetaResponse> {
    return this.http.call<MetaResponse>(
      (signal) =>
        this.http.client.GET('/api/meta', { signal }) as Promise<{
          data?: MetaResponse;
          error?: unknown;
          response: Response;
        }>
    );
  }
}
