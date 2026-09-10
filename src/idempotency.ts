import { randomUUID } from 'node:crypto';

/**
 * Generate a UUIDv4 suitable for use as an `X-Idempotency-Key` header value.
 *
 * Only useful when you can STORE the result and reuse it across retries of the
 * same logical operation. If the key is generated fresh on every attempt it
 * protects nothing — see {@link idempotencyHeaders}.
 *
 * @example
 * const key = generateIdempotencyKey();
 * // '3b241101-e2bb-4255-8caf-4136c566a962'
 */
export function generateIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Build the `X-Idempotency-Key` header block for a write, **only** when the
 * caller supplied a key.
 *
 * Until v5.0.0 the SDK fabricated a UUIDv4 here whenever the caller passed
 * nothing. That is worse than sending no key at all: an idempotency key only
 * means something if the SAME key comes back on a retry, and a key invented per
 * call is different every time. It bought no protection while making the
 * request look protected — the docstrings even promised "safe to retry".
 *
 * What it actually cost: on 2026-09-08 an integrator's HTTP client timed out at
 * 30s on a card charge that was still being created, retried, drew a fresh
 * UUIDv4, and charged a real buyer a second time. See the gateway repo,
 * docs/incidents/2026-09-08-payday-utc-triple-charge.md.
 *
 * Sending no header is the honest signal: the API treats the write as
 * unprotected, and the gateway's own duplicate guard — same buyer, product, rail
 * and instalment count inside 60s — is what catches the retry.
 *
 * To get real protection, pass `idempotencyKey` derived from something stable in
 * YOUR domain (an order id, a booking id), so a retry reproduces it:
 *
 * @example
 * await garu.charges.create({
 *   productId,
 *   paymentMethod: 'creditCard',
 *   customer,
 *   idempotencyKey: `booking:${booking.id}:charge`
 * });
 */
export function idempotencyHeaders(key: string | undefined): Record<string, string> {
  return key ? { 'X-Idempotency-Key': key } : {};
}
