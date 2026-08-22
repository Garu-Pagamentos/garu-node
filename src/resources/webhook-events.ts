import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  ListWebhookEventsParams,
  ResendWebhookEventParams,
  WebhookEvent,
  WebhookEventList
} from '../types.js';

/**
 * Webhook events — the seller-facing delivery log for outbound webhooks.
 *
 * Backed by `/api/v1/webhook-events`, keyed on `uuid`. Every time the
 * gateway fires a webhook (e.g. `transaction.payment.paid`,
 * `scheduled_charge.cycle_failed`), it persists one row per destination
 * endpoint with the full payload, the HTTP outcome, and the retry schedule.
 * Use this resource to audit deliveries from the seller's API key — the
 * canonical "did my customer's endpoint actually receive event X?" workflow.
 *
 * Webhook endpoint *configuration* (URL, subscribed events, secret) is still
 * dashboard-only — this resource only covers the event log + manual retries.
 * `webhookEndpoint.id` on every event stays a numeric id for that reason.
 */
export class WebhookEvents {
  constructor(private readonly http: HttpClient) {}

  /**
   * List webhook events for the authenticated seller, newest first.
   * Filter by delivery `status`, by Garu `eventType`, and/or by the
   * destination `endpointId`.
   *
   * @example
   * // Surface anything that didn't make it through
   * const failed = await garu.webhookEvents.list({ status: 'failed', limit: 50 });
   *
   * @example
   * // Inspect every paid-charge delivery for a specific endpoint
   * const paidDeliveries = await garu.webhookEvents.list({
   *   endpointId: 17,
   *   eventType: 'transaction.payment.paid'
   * });
   */
  async list(params: ListWebhookEventsParams = {}): Promise<WebhookEventList> {
    const query: Record<string, string> = {};
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.status) query.status = params.status;
    if (params.eventType) query.eventType = params.eventType;
    if (params.endpointId !== undefined) query.endpointId = String(params.endpointId);

    const qs = new URLSearchParams(query).toString();
    const url = `/api/v1/webhook-events${qs ? `?${qs}` : ''}`;

    return this.http.call<WebhookEventList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: WebhookEventList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch one webhook event by uuid — includes the full payload, the
   * embedded endpoint snapshot, and the most recent response status/body.
   *
   * @example
   * const event = await garu.webhookEvents.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
   * event.status === 'failed' && event.responseStatus;
   */
  async get(uuid: string): Promise<WebhookEvent> {
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.GET as Function)(`/api/v1/webhook-events/${uuid}`, { signal }).then(
        (r: { data?: WebhookEvent; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * @deprecated For most cases prefer {@link resend}, which preserves the
   * original event's audit trail by cloning rather than mutating. `retry()`
   * resets the original row in place — once it succeeds, the historical
   * record of the prior failure is gone. Kept here for callers that
   * explicitly want the legacy in-place semantics (and for backwards
   * compatibility with older CLI / MCP releases).
   *
   * Re-deliver a webhook event by uuid. Resets it to `pending`, clears the
   * retry schedule, and triggers an immediate delivery attempt. Works on
   * any status (`success`, `failed`, `pending`).
   *
   * @example
   * const failed = await garu.webhookEvents.list({ status: 'failed', limit: 5 });
   * for (const event of failed.data) {
   *   await garu.webhookEvents.retry(event.uuid);
   * }
   */
  async retry(uuid: string): Promise<WebhookEvent> {
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/webhook-events/${uuid}/retry`, {
        body: {},
        signal
      }).then((r: { data?: WebhookEvent; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Re-deliver a webhook event by uuid, audit-trail preserving. Unlike
   * {@link retry}, this does *not* mutate the original row — it inserts a
   * fresh event (new uuid) that points back at the source via
   * `manualResendOf`, then dispatches that clone. The original row is
   * untouched, so the historical record of the prior failure (and its
   * response status / body) is preserved.
   *
   * Works on any source status (`success`, `failed`, `pending`). Use this
   * when a customer reports a missed or unprocessed event, or to replay an
   * event during a backfill — both reasons where you want the original
   * delivery's outcome to remain on the record.
   *
   * **Outbound delivery semantics**: the gateway POSTs the clone with
   * `Idempotency-Key: resend_<cloneUuid>`. Recipient handlers that key off
   * `Idempotency-Key` will see this as a distinct delivery from the
   * original — distinguishable both by the `resend_` prefix and by reading
   * the response payload's `manualResendOf` field.
   *
   * The SDK also attaches an `X-Idempotency-Key` header (UUIDv4 unless you
   * pass `idempotencyKey`); the gateway does not currently deduplicate
   * `/resend` calls against it, so retrying this call from your own code
   * after a network failure can create more than one clone — pair it with
   * your own retry-suppression if that matters for your integration.
   *
   * Returns the *clone* event (new uuid), not the original. The original is
   * unchanged on the server.
   *
   * @example
   * const event = await garu.webhookEvents.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
   * const clone = await garu.webhookEvents.resend(event.uuid);
   * clone.uuid !== event.uuid;            // true — clone has its own uuid
   * clone.manualResendOf === event.uuid; // true — points back at the source
   */
  async resend(uuid: string, params: ResendWebhookEventParams = {}): Promise<WebhookEvent> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/webhook-events/${uuid}/resend`, {
        body: {},
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: WebhookEvent; error?: unknown; response: Response }) => r)
    );
  }
}
