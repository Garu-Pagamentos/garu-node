import { describe, expect, it } from 'vitest';

import { GaruAPIError, GaruDuplicateChargeError, mapApiError } from '../src/errors.js';
import { Garu } from '../src/index.js';
import { mockFetch } from './helpers.js';

const conflict = (body: unknown, retryAfterSec: number | null = null) =>
  mapApiError(409, body, 'req_1', retryAfterSec);

describe('mapApiError on 409', () => {
  it.each(['charge_in_progress', 'charge_already_processed'] as const)(
    'maps %s to a duplicate-charge error carrying its code',
    (code) => {
      const err = conflict({ error: code, message: 'Aguarde', retryAfter: 5 });

      expect(err).toBeInstanceOf(GaruDuplicateChargeError);
      expect(err.code).toBe(code);
      expect((err as GaruDuplicateChargeError).retryAfterSec).toBe(5);
    }
  );

  it('prefers the Retry-After header over the body', () => {
    const err = conflict({ error: 'charge_in_progress', retryAfter: 5 }, 12);
    expect((err as GaruDuplicateChargeError).retryAfterSec).toBe(12);
  });

  it('falls back to a positive wait when neither is given', () => {
    const err = conflict({ error: 'charge_in_progress' });
    expect((err as GaruDuplicateChargeError).retryAfterSec).toBeGreaterThan(0);
  });

  it.each([
    ['an unrelated conflict', { error: 'seat_taken' }],
    ['a body with no code', { message: 'conflict' }],
    ['a null body', null]
  ])('leaves %s as a generic API error', (_label, body) => {
    // A future 409 elsewhere must not be described to the caller as a duplicate
    // charge.
    const err = conflict(body);
    expect(err).not.toBeInstanceOf(GaruDuplicateChargeError);
    expect(err).toBeInstanceOf(GaruAPIError);
  });

  it('keeps the request id and status for support', () => {
    const err = conflict({ error: 'charge_in_progress' });
    expect(err.status).toBe(409);
    expect(err.requestId).toBe('req_1');
  });
});

describe('the SDK never retries a duplicate charge for you', () => {
  it('sends the request once and raises, rather than re-POSTing to a money endpoint', async () => {
    // SPEC.md decision 16. Retrying a charge on the caller's behalf is the same
    // shape of hidden behaviour 5.0.0 removed, and it stacks with whatever retry
    // the integrator already has.
    const { fetch, calls } = mockFetch([
      {
        status: 409,
        body: { error: 'charge_in_progress', message: 'Aguarde', retryAfter: 5 },
        headers: { 'retry-after': '5' }
      },
      { status: 200, body: { name: 'Garu' } }
    ]);
    const garu = new Garu({ fetch, maxRetries: 3 });

    await expect(garu.meta.get()).rejects.toBeInstanceOf(GaruDuplicateChargeError);
    expect(calls).toHaveLength(1);
  });

  it('surfaces the wait the server asked for', async () => {
    const { fetch } = mockFetch([
      {
        status: 409,
        body: { error: 'charge_in_progress' },
        headers: { 'retry-after': '7' }
      }
    ]);
    const garu = new Garu({ fetch, maxRetries: 0 });

    await garu.meta.get().catch((err) => {
      expect((err as GaruDuplicateChargeError).retryAfterSec).toBe(7);
    });
    expect.assertions(1);
  });
});
