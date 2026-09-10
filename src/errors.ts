/**
 * Error hierarchy for the Garu SDK.
 *
 * Every error has a stable `code` string so agents and typed clients can switch on it
 * without parsing messages. Non-2xx API responses are mapped to the most specific
 * subclass of `GaruAPIError` by {@link mapApiError}.
 */

export type GaruErrorCode =
  | 'authentication_error'
  | 'permission_error'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'charge_in_progress'
  | 'charge_already_processed'
  | 'server_error'
  | 'api_error'
  | 'connection_error'
  | 'signature_verification_failed';

export class GaruError extends Error {
  public readonly code: GaruErrorCode;

  constructor(code: GaruErrorCode, message: string) {
    super(message);
    this.name = 'GaruError';
    this.code = code;
  }
}

export class GaruConnectionError extends GaruError {
  public readonly connectionCause: unknown;
  constructor(message: string, connectionCause?: unknown) {
    super('connection_error', message);
    this.name = 'GaruConnectionError';
    this.connectionCause = connectionCause;
  }
}

export class GaruSignatureVerificationError extends GaruError {
  constructor(message: string) {
    super('signature_verification_failed', message);
    this.name = 'GaruSignatureVerificationError';
  }
}

export class GaruAPIError extends GaruError {
  public readonly status: number;
  public readonly requestId: string | null;
  public readonly body: unknown;

  constructor(
    code: GaruErrorCode,
    message: string,
    status: number,
    requestId: string | null,
    body: unknown
  ) {
    super(code, message);
    this.name = 'GaruAPIError';
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }
}

export class GaruAuthenticationError extends GaruAPIError {
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super('authentication_error', message, status, requestId, body);
    this.name = 'GaruAuthenticationError';
  }
}

export class GaruPermissionError extends GaruAPIError {
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super('permission_error', message, status, requestId, body);
    this.name = 'GaruPermissionError';
  }
}

export class GaruNotFoundError extends GaruAPIError {
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super('not_found', message, status, requestId, body);
    this.name = 'GaruNotFoundError';
  }
}

export class GaruValidationError extends GaruAPIError {
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super('validation_error', message, status, requestId, body);
    this.name = 'GaruValidationError';
  }
}

export class GaruRateLimitError extends GaruAPIError {
  public readonly retryAfterSec: number | null;
  constructor(
    message: string,
    status: number,
    requestId: string | null,
    body: unknown,
    retryAfterSec: number | null
  ) {
    super('rate_limited', message, status, requestId, body);
    this.name = 'GaruRateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * A charge identical to this one — same buyer, product, rail, amount and
 * instalment count — is already being processed, or already went through inside
 * the gateway's duplicate window.
 *
 * **This is not a failure.** The buyer's money is either on its way or already
 * taken. Wait `retryAfterSec` and send the same request again: the retry is
 * answered with the ORIGINAL charge rather than creating a second one.
 *
 * The SDK does not retry this for you. Re-POSTing to a money endpoint on your
 * behalf is exactly the kind of hidden behaviour 5.0.0 removed, and if your own
 * client also retries, the two stack.
 *
 * The real fix is upstream: pass `idempotencyKey` derived from something stable
 * in your domain, so a retry reproduces it. This error is the backstop for when
 * that has not happened.
 *
 * @example
 * try {
 *   await garu.charges.create({ productId, paymentMethod: 'creditCard', customer });
 * } catch (err) {
 *   if (err instanceof GaruDuplicateChargeError) {
 *     await new Promise((r) => setTimeout(r, err.retryAfterSec * 1000));
 *     // Sending it again returns the original charge.
 *   }
 * }
 */
export class GaruDuplicateChargeError extends GaruAPIError {
  /** How long to wait before sending the same request again. */
  public readonly retryAfterSec: number;

  constructor(
    code: 'charge_in_progress' | 'charge_already_processed',
    message: string,
    status: number,
    requestId: string | null,
    body: unknown,
    retryAfterSec: number
  ) {
    super(code, message, status, requestId, body);
    this.name = 'GaruDuplicateChargeError';
    this.retryAfterSec = retryAfterSec;
  }
}

export class GaruServerError extends GaruAPIError {
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super('server_error', message, status, requestId, body);
    this.name = 'GaruServerError';
  }
}

/**
 * Map a non-2xx HTTP response to the most specific {@link GaruAPIError} subclass.
 */
export function mapApiError(
  status: number,
  body: unknown,
  requestId: string | null,
  retryAfterSec: number | null
): GaruAPIError {
  const message = extractMessage(body) ?? `Garu API returned HTTP ${status}`;

  if (status === 401) return new GaruAuthenticationError(message, status, requestId, body);
  if (status === 403) return new GaruPermissionError(message, status, requestId, body);
  if (status === 404) return new GaruNotFoundError(message, status, requestId, body);
  if (status === 400 || status === 422) {
    return new GaruValidationError(message, status, requestId, body);
  }
  if (status === 429) {
    return new GaruRateLimitError(message, status, requestId, body, retryAfterSec);
  }
  if (status === 409) {
    const code = readDuplicateChargeCode(body);
    if (code) {
      // `Retry-After` is authoritative when present; the body carries the same
      // number for clients that cannot read headers.
      const wait = retryAfterSec ?? readRetryAfterFromBody(body) ?? DEFAULT_DUPLICATE_RETRY_SEC;
      return new GaruDuplicateChargeError(code, message, status, requestId, body, wait);
    }
  }
  if (status >= 500) return new GaruServerError(message, status, requestId, body);
  return new GaruAPIError('api_error', message, status, requestId, body);
}

function extractMessage(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m) && m.every((x) => typeof x === 'string')) return m.join('; ');
  }
  return null;
}

const DEFAULT_DUPLICATE_RETRY_SEC = 5;

/**
 * Only a 409 the gateway raised for a duplicate charge maps to
 * {@link GaruDuplicateChargeError}. Any other conflict stays a generic
 * `GaruAPIError`, so a future 409 on some unrelated endpoint is not silently
 * described as a duplicate charge.
 */
function readDuplicateChargeCode(
  body: unknown
): 'charge_in_progress' | 'charge_already_processed' | null {
  const code = (body as { error?: unknown } | null)?.error;
  return code === 'charge_in_progress' || code === 'charge_already_processed' ? code : null;
}

function readRetryAfterFromBody(body: unknown): number | null {
  const value = (body as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
