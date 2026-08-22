import { describe, expect, it } from 'vitest';

import { Garu, GaruNotFoundError, GaruPermissionError, type WebhookEvent } from '../src/index.js';
import { mockFetch } from './helpers.js';

const EVENT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CLONE_UUID = 'f9e8d7c6-b5a4-3210-9876-543210fedcba';

const fakeEndpoint = {
  id: 7,
  url: 'https://example.com/hooks/garu',
  description: 'Prod hook',
  enabled: true,
  events: ['transaction.payment.paid']
};

const fakeEvent: WebhookEvent = {
  uuid: EVENT_UUID,
  webhookEndpoint: fakeEndpoint,
  eventType: 'transaction.payment.paid',
  payload: { id: 'evt_1a2b3c', transactionId: 1234, amount: 9900 },
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
  it('lists with no filters and default pagination', async () => {
    const listBody = { data: [fakeEvent], count: 1, totalCount: 1, totalPages: 1 };
    const { fetch, calls } = mockFetch([{ status: 200, body: listBody }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.list();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.uuid).toBe(EVENT_UUID);
    expect(result.totalCount).toBe(1);
    expect(calls[0]!.url).toBe('https://garu.com.br/api/v1/webhook-events');
    expect(calls[0]!.method).toBe('GET');
  });

  it('forwards status + pagination filters', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } }
    ]);
    const garu = newClient(fetch);

    await garu.webhookEvents.list({ status: 'failed', page: 2, limit: 25 });

    expect(calls[0]!.url).toBe(
      'https://garu.com.br/api/v1/webhook-events?page=2&limit=25&status=failed'
    );
  });

  it('forwards eventType and endpointId as camelCase query params', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { data: [], count: 0, totalCount: 0, totalPages: 0 } }
    ]);
    const garu = newClient(fetch);

    await garu.webhookEvents.list({
      eventType: 'transaction.payment.paid',
      endpointId: 7
    });

    expect(calls[0]!.url).toContain('eventType=transaction.payment.paid');
    expect(calls[0]!.url).toContain('endpointId=7');
  });

  it('maps 403 to GaruPermissionError', async () => {
    const { fetch } = mockFetch([{ status: 403, body: { message: 'Forbidden' } }]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.list()).rejects.toBeInstanceOf(GaruPermissionError);
  });
});

describe('webhookEvents.get', () => {
  it('fetches a single event by uuid', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: fakeEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.get(EVENT_UUID);

    expect(result.uuid).toBe(EVENT_UUID);
    expect(result.status).toBe('failed');
    expect(result.webhookEndpoint.url).toBe(fakeEndpoint.url);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/webhook-events/${EVENT_UUID}`);
    expect(calls[0]!.method).toBe('GET');
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Webhook event not found.' } }]);
    const garu = newClient(fetch);

    await expect(
      garu.webhookEvents.get('00000000-0000-0000-0000-000000000000')
    ).rejects.toBeInstanceOf(GaruNotFoundError);
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

    const result = await garu.webhookEvents.retry(EVENT_UUID);

    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(0);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/webhook-events/${EVENT_UUID}/retry`);
    expect(calls[0]!.method).toBe('POST');
    // openapi-fetch unconditionally sets `Content-Type: application/json`, so the
    // backend body-parser rejects `Content-Type: json` + empty body. Send `{}`.
    expect(calls[0]!.body).toEqual({});
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Webhook event not found.' } }]);
    const garu = newClient(fetch);

    await expect(
      garu.webhookEvents.retry('00000000-0000-0000-0000-000000000000')
    ).rejects.toBeInstanceOf(GaruNotFoundError);
  });
});

describe('webhookEvents.resend', () => {
  // Clone-on-resend: the backend returns a *new* event (new uuid) that
  // points back at the source via `manualResendOf`. The original event is
  // untouched server-side, so the historical record of the prior failure
  // (status, response status/body, attempts) survives. These tests assert
  // the SDK returns the clone shape, not the source row.
  const cloneEvent: WebhookEvent = {
    ...fakeEvent,
    uuid: CLONE_UUID,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    responseStatus: null,
    responseBody: null,
    manualResendOf: EVENT_UUID,
    createdAt: '2026-05-19T13:00:00Z'
  };

  it('POSTs to /resend with an empty `{}` body and returns the clone event', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(EVENT_UUID);

    expect(result.uuid).toBe(CLONE_UUID);
    expect(result.manualResendOf).toBe(EVENT_UUID);
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(0);
    expect(calls[0]!.url).toBe(`https://garu.com.br/api/v1/webhook-events/${EVENT_UUID}/resend`);
    expect(calls[0]!.method).toBe('POST');
    // Same empty-body-mutation contract as retry: openapi-fetch sets
    // `Content-Type: application/json` unconditionally, so the body-parser
    // rejects empty bodies. Send `{}`.
    expect(calls[0]!.body).toEqual({});
  });

  it("auto-attaches an X-Idempotency-Key (UUIDv4) so transient SDK retries can't duplicate clones", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    await garu.webhookEvents.resend(EVENT_UUID);

    expect(calls[0]!.headers['x-idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('forwards a caller-supplied idempotencyKey verbatim and does not leak it into the body', async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    await garu.webhookEvents.resend(EVENT_UUID, { idempotencyKey: 'my-stable-key' });

    expect(calls[0]!.headers['x-idempotency-key']).toBe('my-stable-key');
    expect(calls[0]!.body).toEqual({});
  });

  it('works on any source status — `success` source returns a fresh pending clone', async () => {
    const otherEventUuid = '11111111-1111-1111-1111-111111111111';
    const successSourceClone: WebhookEvent = {
      ...cloneEvent,
      uuid: '22222222-2222-2222-2222-222222222222',
      manualResendOf: otherEventUuid
    };
    const { fetch, calls } = mockFetch([{ status: 201, body: successSourceClone }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(otherEventUuid);

    expect(result.uuid).toBe('22222222-2222-2222-2222-222222222222');
    expect(result.manualResendOf).toBe(otherEventUuid);
    expect(result.status).toBe('pending');
    expect(calls[0]!.url).toBe(
      `https://garu.com.br/api/v1/webhook-events/${otherEventUuid}/resend`
    );
  });

  it('does not mutate the original event server-side — returned uuid differs from input uuid', async () => {
    const { fetch } = mockFetch([{ status: 201, body: cloneEvent }]);
    const garu = newClient(fetch);

    const result = await garu.webhookEvents.resend(EVENT_UUID);

    expect(result.uuid).not.toBe(EVENT_UUID);
    expect(result.manualResendOf).toBe(EVENT_UUID);
  });

  it('maps 404 to GaruNotFoundError', async () => {
    const { fetch } = mockFetch([{ status: 404, body: { message: 'Webhook event not found.' } }]);
    const garu = newClient(fetch);

    await expect(
      garu.webhookEvents.resend('00000000-0000-0000-0000-000000000000')
    ).rejects.toBeInstanceOf(GaruNotFoundError);
  });

  it('maps 403 to GaruPermissionError when the event belongs to another seller', async () => {
    const { fetch } = mockFetch([{ status: 403, body: { message: 'Forbidden' } }]);
    const garu = newClient(fetch);

    await expect(garu.webhookEvents.resend(EVENT_UUID)).rejects.toBeInstanceOf(GaruPermissionError);
  });
});
