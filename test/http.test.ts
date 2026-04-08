import { describe, expect, it } from 'vitest';

import {
  Garu,
  GaruConnectionError,
  GaruRateLimitError,
  GaruServerError,
  GaruValidationError
} from '../src/index.js';
import { mockFetch } from './helpers.js';

describe('http retries', () => {
  it('retries 503 and eventually succeeds', async () => {
    const { fetch, calls } = mockFetch([
      { status: 503, body: { message: 'unavailable' } },
      { status: 503, body: { message: 'unavailable' } },
      { status: 200, body: { name: 'Garu', version: '1.3.2' } }
    ]);
    const garu = new Garu({ fetch, maxRetries: 2 });

    const meta = await garu.meta.get();

    expect(meta.version).toBe('1.3.2');
    expect(calls).toHaveLength(3);
  });

  it('gives up after maxRetries and throws the last API error', async () => {
    const { fetch, calls } = mockFetch([
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } }
    ]);
    const garu = new Garu({ fetch, maxRetries: 2 });

    await expect(garu.meta.get()).rejects.toBeInstanceOf(GaruServerError);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 400 validation error', async () => {
    const { fetch, calls } = mockFetch([
      { status: 400, body: { message: 'bad' } },
      { status: 200, body: { name: 'Garu' } }
    ]);
    const garu = new Garu({ fetch, maxRetries: 2 });

    await expect(garu.meta.get()).rejects.toBeInstanceOf(GaruValidationError);
    expect(calls).toHaveLength(1);
  });

  it('extracts retryAfter from 429 headers', async () => {
    const { fetch } = mockFetch([
      { status: 429, body: { message: 'slow down' }, headers: { 'retry-after': '1' } }
    ]);
    const garu = new Garu({ fetch, maxRetries: 0 });

    try {
      await garu.meta.get();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GaruRateLimitError);
      expect((err as GaruRateLimitError).retryAfterSec).toBe(1);
    }
  });

  it('wraps fetch network errors as GaruConnectionError', async () => {
    const { fetch } = mockFetch([{ throws: new TypeError('fetch failed') }]);
    const garu = new Garu({ fetch, maxRetries: 0 });

    await expect(garu.meta.get()).rejects.toBeInstanceOf(GaruConnectionError);
  });
});
