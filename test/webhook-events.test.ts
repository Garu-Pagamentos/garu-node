import { describe, expect, it } from 'vitest';

import {
  Garu,
  GaruNotFoundError,
  GaruPermissionError,
  type WebhookEvent
} from '../src/index.js';
import { mockFetch } from './helpers.js';

const fakeEndpoint = {
  id: 7,
  url: 'https://example.com/hooks/garu',
  description: 'Prod hook',
  enabled: true,
  events: ['transaction.payment.paid']
};

const fakeEvent: WebhookEvent = {
  id: 42,
  endpointId: 7,
  webhookEndpoint: fakeEndpoint,
  eventType: 'transaction.payment.paid',
  payload: { transactionId: 1234, amount: 9900 },
  status: 'failed',
  attempts: 5,
  lastAttemptAt: '2026-05-19T12:00:00Z',
  nextRetryAt: null,
  responseStatus: 500,
  responseBody: 'Internal Server Error',
  manualResendOf: null,
  createdAt: '2026-05-19T11:00:00Z'
};

const newClient = (fetchImpl: typeof fetch): Garu =>
  new Garu({ apiKey: 'sk_test_abc', fetch: fetchImpl, maxRetries: 0 });

describe('webhookEvents.list', () => {
  // The legacy `/api/webhook-events` endpoint returns a flat `{ events, total, page, limit, pages }`
  // shape — the SDK normalizes it to the standard `{ data, meta }` pagination shape used by
  // every other resource. These tests mock the real backend shape, then assert on the
  // SDK-facing normalized shape.
  it('lists with no filters and default pagination, normalizing the legacy shape', async () => {
    const backendBody = {
      events: [fakeEvent],
      total: 1,
      page: 1,
      limit: 50,
      pages: 1
    };
    const { fetch, calls } = mockFetch([{ status: 200, body: backendBody }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.list();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe(42);
    expect(result.meta).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
    expect(calls[0]!.url).toBe('https://garu.com.br/api/webhook-events');
    expect(calls[0]!.method).toBe('GET');
  });

  it('forwards status + pagination filters', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { events: [], total: 0, page: 2, limit: 25, pages: 0 } }
    ]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.list({ status: 'failed', page: 2, limit: 25 });

    expect(calls[0]!.url).toBe(
      'https://garu.com.br/api/webhook-events?page=2&limit=25&status=failed'
    );
    expect(result.meta).toEqual({ page: 2, limit: 25, total: 0, totalPages: 0 });
  });

  it('renames eventType → event_type and endpointId → endpoint_id on the wire', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { events: [], total: 0, page: 1, limit: 50, pages: 0 } }
    ]);
    const garu = newClient(fetch);

    await garu.webhookEvents.list({
      eventType: 'transaction.payment.paid',
      endpointId: 7
    });

    expect(calls[0]!.url).toContain('event_type=transaction.payment.paid');
    expect(calls[0]!.url).toContain('endpoint_id=7');
    expect(calls[0]!.url).not.toContain('eventType');
    expect(calls[0]!.url).not.toContain('endpointId');
  });

  it('maps 403 to GaruPermissionError', async () => {
    const { fetch } = mockFetch([{ status: 403, body: { message: 'Forbidden' } }]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.list()).rejects.toBeInstanceOf(GaruPermissionError);
  });
});

describe('webhookEvents.get', () => {
  it('fetches a single event by id', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: fakeEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.get(42);

    expect(result.id).toBe(42);
    expect(result.status).toBe('failed');
    expect(result.webhookEndpoint.url).toBe(fakeEndpoint.url);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/webhook-events/42');
    expect(calls[0]!.method).toBe('GET');
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { message: 'Webhook event not found.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.get(999)).rejects.toBeInstanceOf(GaruNotFoundError);
  });
});

describe('webhookEvents.retry', () => {
  it('POSTs an empty `{}` body so the backend body-parser accepts it', async () => {
    const resetEvent: WebhookEvent = {
      ...fakeEvent,
      status: 'pending',
      attempts: 0,
      responseStatus: null
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: resetEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.retry(42);

    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(0);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/webhook-events/42/retry');
    expect(calls[0]!.method).toBe('POST');
    // openapi-fetch unconditionally sets `Content-Type: application/json`, so the
    // backend body-parser rejects `Content-Type: json` + empty body. Send `{}`.
    expect(calls[0]!.body).toEqual({});
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { message: 'Webhook event not found.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.retry(999)).rejects.toBeInstanceOf(GaruNotFoundError);
  });
});

describe('webhookEvents.resend', () => {
  // Clone-on-resend: the backend returns a *new* event (new numeric id) that
  // points back at the source via `manualResendOf`. The original event is
  // untouched server-side, so the historical record of the prior failure
  // (status, response status/body, attempts) survives. These tests assert
  // the SDK returns the clone shape, not the source row.
  const cloneEvent: WebhookEvent = {
    ...fakeEvent,
    id: 99,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    responseStatus: null,
    responseBody: null,
    manualResendOf: 42,
    createdAt: '2026-05-19T13:00:00Z'
  };

  it('POSTs to /resend with an empty `{}` body and returns the clone event', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(42);

    expect(result.id).toBe(99);
    expect(result.manualResendOf).toBe(42);
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(0);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/webhook-events/42/resend');
    expect(calls[0]!.method).toBe('POST');
    // Same empty-body-mutation contract as retry: openapi-fetch sets
    // `Content-Type: application/json` unconditionally, so the body-parser
    // rejects empty bodies. Send `{}`.
    expect(calls[0]!.body).toEqual({});
  });

  it('works on any source status — `success` source returns a fresh pending clone', async () => {
    const successSourceClone: WebhookEvent = {
      ...cloneEvent,
      id: 100,
      manualResendOf: 7
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: successSourceClone }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(7);

    expect(result.id).toBe(100);
    expect(result.manualResendOf).toBe(7);
    expect(result.status).toBe('pending');
    expect(calls[0]!.url).toBe('https://garu.com.br/api/webhook-events/7/resend');
  });

  it('does not mutate the original event server-side — returned id differs from input id', async () => {
    const { fetch } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(42);

    expect(result.id).not.toBe(42);
    expect(result.manualResendOf).toBe(42);
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([
      { status: 404, body: { message: 'Webhook event not found.' } }
    ]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.resend(999)).rejects.toBeInstanceOf(GaruNotFoundError);
  });

  it('maps 403 to GaruPermissionError when the event belongs to another seller', async () => {
    const { fetch } = mockFetch([{ status: 403, body: { message: 'Forbidden' } }]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.resend(42)).rejects.toBeInstanceOf(GaruPermissionError);
  });
});
