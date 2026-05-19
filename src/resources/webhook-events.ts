import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  ListWebhookEventsParams,
  ResendWebhookEventParams,
  WebhookEvent,
  WebhookEventList
} from '../types.js';

/**
 * Legacy backend shape for `GET /api/webhook-events`. Predates the
 * `{ data, meta }` convention used by newer resources (customers,
 * scheduled-charges). Normalized to {@link WebhookEventList} at the
 * SDK boundary so callers see one consistent paginated shape.
 */
interface BackendWebhookEventList {
  events: WebhookEvent[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Webhook events — the seller-facing delivery log for outbound webhooks.
 *
 * Every time the gateway fires a webhook (e.g. `transaction.payment.paid`,
 * `scheduled_charge.cycle_failed`), it persists one row per destination
 * endpoint with the full payload, the HTTP outcome, and the retry schedule.
 * Use this resource to audit deliveries from the seller's API key — the
 * canonical "did my customer's endpoint actually receive event X?" workflow.
 *
 * Webhook endpoint *configuration* (URL, subscribed events, secret) is still
 * dashboard-only — this resource only covers the event log + manual retries.
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
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.status) qs.set('status', params.status);
    if (params.eventType) qs.set('event_type', params.eventType);
    if (params.endpointId !== undefined) qs.set('endpoint_id', String(params.endpointId));
    const query = qs.toString();
    const url = `/api/webhook-events${query ? `?${query}` : ''}`;

    const raw = await this.http.call<BackendWebhookEventList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: BackendWebhookEventList; error?: unknown; response: Response }) => r
      )
    );

    return {
      data: raw.events,
      meta: {
        page: raw.page,
        limit: raw.limit,
        total: raw.total,
        totalPages: raw.pages
      }
    };
  }

  /**
   * Fetch one webhook event by numeric ID — includes the full payload, the
   * embedded endpoint snapshot, and the most recent response status/body.
   *
   * @example
   * const event = await garu.webhookEvents.get(42);
   * if (event.status === 'failed') {
   *   console.log(event.responseStatus, event.responseBody);
   * }
   */
  async get(id: number): Promise<WebhookEvent> {
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.GET as Function)(`/api/webhook-events/${id}`, { signal }).then(
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
   * Re-deliver a webhook event by ID. Resets it to `pending`, clears the
   * retry schedule, and triggers an immediate delivery attempt. Works on
   * any status (`success`, `failed`, `pending`).
   *
   * @example
   * const failed = await garu.webhookEvents.list({ status: 'failed', limit: 5 });
   * for (const event of failed.data) {
   *   await garu.webhookEvents.retry(event.id);
   * }
   */
  async retry(id: number): Promise<WebhookEvent> {
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.POST as Function)(`/api/webhook-events/${id}/retry`, {
        body: {},
        signal
      }).then((r: { data?: WebhookEvent; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Re-deliver a webhook event by ID, audit-trail preserving. Unlike
   * {@link retry}, this does *not* mutate the original row — it inserts a
   * fresh event (new numeric id) that points back at the source via
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
   * `Idempotency-Key: resend_<originalId>` (where `<originalId>` is the id
   * of the source event, not the clone). Recipient handlers that key off
   * `Idempotency-Key` will see this as a distinct delivery from the
   * original — distinguishable both by the `resend_` prefix and by reading
   * the response payload's `manualResendOf` field.
   *
   * **SDK→gateway dedup**: the SDK auto-attaches `X-Idempotency-Key`
   * (UUIDv4 unless you pass `idempotencyKey`) so transient transport
   * retries (5xx → SDK backoff) cannot create duplicate clones — the
   * backend returns the original clone on the second call within 24h.
   *
   * Returns the *clone* event (new id), not the original. The original is
   * unchanged on the server.
   *
   * @example
   * const event = await garu.webhookEvents.get(42);
   * const clone = await garu.webhookEvents.resend(42);
   * clone.id !== event.id;            // true — clone has its own id
   * clone.manualResendOf === event.id; // true — points back at the source
   */
  async resend(id: number, params: ResendWebhookEventParams = {}): Promise<WebhookEvent> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    return this.http.call<WebhookEvent>((signal) =>
      (this.http.client.POST as Function)(`/api/webhook-events/${id}/resend`, {
        body: {},
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: WebhookEvent; error?: unknown; response: Response }) => r)
    );
  }
}
