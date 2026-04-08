import createClient from 'openapi-fetch';

import { GaruConnectionError, mapApiError, type GaruAPIError } from './errors.js';
import type { paths } from './generated/schema.js';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
  /** Injectable for tests. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Typed openapi-fetch client keyed to the backend's OpenAPI paths. */
export type GaruOpenapiClient = ReturnType<typeof createClient<paths>>;

/** Arg type for `HttpClient.call` — a thunk that issues one openapi-fetch request. */
export type OpenapiCallResult<T> = Promise<{
  data?: T;
  error?: unknown;
  response: Response;
}>;

/**
 * HttpClient wraps the generated `openapi-fetch` client with:
 *   - retries (exponential backoff, full jitter, honors `Retry-After`)
 *   - typed error mapping (non-2xx → {@link GaruAPIError} subclass)
 *   - connection error wrapping
 *   - Authorization + User-Agent injection
 *
 * Resources call {@link call} with a thunk that returns an openapi-fetch
 * `{ data, error, response }` tuple; the wrapper either returns `data` or
 * throws the mapped error.
 */
export class HttpClient {
  public readonly client: GaruOpenapiClient;
  private readonly cfg: HttpClientConfig;

  constructor(cfg: HttpClientConfig) {
    this.cfg = cfg;
    const fetchImpl = cfg.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new GaruConnectionError(
        'No fetch implementation available. Node.js >= 18 is required.'
      );
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': cfg.userAgent
    };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

    this.client = createClient<paths>({
      baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
      fetch: fetchImpl,
      headers
    });
  }

  /**
   * Issue one HTTP call against the typed client, with retries + error mapping.
   *
   * `fn` is invoked up to `maxRetries + 1` times. The timeout in `cfg.timeoutMs`
   * is enforced via `AbortController`.
   */
  async call<T>(fn: (signal: AbortSignal) => OpenapiCallResult<T>): Promise<T> {
    let lastError: GaruAPIError | GaruConnectionError | null = null;

    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      try {
        const { data, error, response } = await fn(controller.signal);
        clearTimeout(timer);

        if (response.ok) {
          return data as T;
        }

        const requestId = response.headers.get('x-request-id');
        const retryAfterSec = parseRetryAfter(response.headers.get('retry-after'));
        const apiError = mapApiError(response.status, error ?? null, requestId, retryAfterSec);
        lastError = apiError;

        if (!RETRYABLE_STATUSES.has(response.status) || attempt === this.cfg.maxRetries) {
          throw apiError;
        }

        await sleep(backoffDelay(attempt, retryAfterSec));
        continue;
      } catch (err) {
        clearTimeout(timer);

        if (isGaruApiError(err)) throw err;

        const connErr =
          err instanceof Error && err.name === 'AbortError'
            ? new GaruConnectionError(`Request timed out after ${this.cfg.timeoutMs}ms`, err)
            : new GaruConnectionError(err instanceof Error ? err.message : 'Network error', err);
        lastError = connErr;

        if (attempt === this.cfg.maxRetries) throw connErr;
        await sleep(backoffDelay(attempt, null));
        continue;
      }
    }

    // Unreachable — the loop always throws or returns on the final attempt.
    throw lastError ?? new GaruConnectionError('Request failed with no error captured');
  }
}

function isGaruApiError(err: unknown): boolean {
  return err instanceof Error && err.name.startsWith('Garu') && err.name.endsWith('Error');
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Exponential backoff with full jitter. If the server returned `Retry-After`,
 * we honor it (with a small jitter).
 */
function backoffDelay(attempt: number, retryAfterSec: number | null): number {
  if (retryAfterSec !== null) {
    return retryAfterSec * 1000 + Math.random() * 250;
  }
  const base = 500 * 2 ** attempt;
  const cap = 8000;
  return Math.min(cap, base) * Math.random();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
