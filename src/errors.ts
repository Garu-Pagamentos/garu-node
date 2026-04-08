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
