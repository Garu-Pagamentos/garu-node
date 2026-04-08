import { randomUUID } from 'node:crypto';

/**
 * Generate a UUIDv4 suitable for use as an `X-Idempotency-Key` header value.
 *
 * @example
 * const key = generateIdempotencyKey();
 * // '3b241101-e2bb-4255-8caf-4136c566a962'
 */
export function generateIdempotencyKey(): string {
  return randomUUID();
}
