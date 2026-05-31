# Changelog

All notable changes to `@garuhq/node` are documented in this file. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [0.15.0] — 2026-05-31

### Added

- **Product writes** — the `Products` resource now wraps the create and update
  endpoints, not just reads:
  - `products.create(params)` — `POST /api/products`, returns the created
    `Product`. Only `name` is required; all other fields fall back to
    seller/server defaults. Auto-attaches an `X-Idempotency-Key` (override
    via `params.idempotencyKey`), so the built-in retry can't create a
    duplicate product.
  - `products.update(id, params)` — `PATCH /api/products/{id}`, partial update
    returning the updated `Product`. `id` accepts the numeric id or the
    product UUID, matching the `/api/products/:id` portal-config methods.
  - New exported param types `CreateProductParams` and `UpdateProductParams`,
    covering `name`, `value` (centavos), `description`, `image`, `tags`,
    `pix`, `boleto`, `creditCard`, `pixAutomatic`, `installments`,
    `isSubscription`, `subscriptionType`, `unitLabel`, `returnUrl`,
    `returnUrlButtonText`, and `statementDescriptor`.
  - Both param types include `pixAutomatic` so you can toggle Pix Automático
    on the subscription checkout at create/update time.

## [0.14.0] — 2026-05-31

### Added

- **Pix Automático support** — Brazil's BACEN auto-debit recurring Pix, where
  the customer authorizes once via a consent QR/link in their bank app and
  cycles 2+ debit silently. All changes are additive; existing
  Card / Pix / Boleto callers are unaffected.
  - `'pix_automatic'` added to the `ScheduledPaymentMethod` union, so
    `scheduledCharges.create({ methods: ['pix_automatic'], ... })` is now
    typed. Recurring-only and requires `productId` (whose product must have
    Pix Automático enabled).
  - `Product.pixAutomatic: boolean` — when `true`, the public subscription
    checkout exposes Pix Automático. Enabled by default; sellers can disable
    it per product.
  - `'pix_automatic'` added to the `ScheduledChargeAttempt.paymentMethod`
    union and to `WirePaymentMethodId`, so transactions/charges read back
    from Pix Automático cycles type-check.
- README: new **Pix Automático** section — what it is, when to use it, how to
  enable it on a product, creating a `pix_automatic` scheduled charge, and
  branching webhook handlers on `paymentMethod === 'pix_automatic'`.

### Notes

- No new webhook event names: Pix Automático fires the same
  `subscription.*` / `transaction.*` events as card recurrence. Branch on the
  payload's `paymentMethod` field. Refused debits are **not** retried at the
  network level — Garu fires `subscription.payment_failed` and moves the
  series to `past_due`.

## [0.13.0] — 2026-05-25

### Added

- `scheduledCharges.chargeNow(id)` — `POST /api/scheduled-charges/{id}/charge-now`.
  Force-bills the current cycle right now instead of waiting for its due
  date, running the same dispatch the daily billing cron would (customer
  email/notification + outbound webhook + timeline event). Allowed only
  from a billable status (`scheduled` / `due_today`); a recurring series
  must have an open cycle. **Idempotent** — a cycle whose d-day was
  already dispatched reports `already_sent` and does not re-charge.
  Returns `{ outcome, cycleNumber, reason?, message }`:
  - `outcome` is `'dispatched' | 'already_sent' | 'not_sent' | 'failed'`.
  - `reason` (on `not_sent` / `failed`) is one of the documented literals
    (`no_email`, `lock_lost`, `no_saved_payment_method`, `card_expired`,
    `payment_method_missing`, `customer_missing`) or a raw gateway decline
    code.
  - `message` is a ready-to-show pt-BR string.
- `ChargeNowOutcome`, `ChargeNowReason`, and `ChargeNowResult` types
  exported from the package root.
- `maxRecoveryDays?: number` (integer 1–365) on
  `CreateScheduledChargeParams` — caps how many days past `dueDate` the
  daily recovery sweep will still auto-bill a missed charge. Omit for the
  system default (14). Also surfaced on the scheduled charge object as
  `ScheduledChargeRecord.maxRecoveryDays: number | null`.

## [0.12.1] — 2026-05-19

### Fixed

- `webhookEvents.resend(id)` now auto-attaches `X-Idempotency-Key`
  (UUIDv4) so transient transport retries (5xx → SDK backoff) cannot
  create duplicate clones. Previously, a 503 mid-flight after the
  backend had already committed the clone could trigger an SDK retry
  and produce a second clone with a different id. With the
  idempotency key in place, the backend returns the original clone on
  the second call within 24h. Pass `{ idempotencyKey }` to dedupe
  across your own retry layer.

### Added

- `ResendWebhookEventParams` type exported from the package root —
  the optional `{ idempotencyKey?: string }` for `resend()`.
- README quickstart entry for `webhookEvents`
  (`list` / `get` / `resend` / `retry`), including the audit-trail
  contract and the SDK→gateway idempotency note.

## [0.12.0] — 2026-05-19

### Added

- `webhookEvents.resend(id)` — `POST /api/webhook-events/{id}/resend`,
  the audit-trail-preserving counterpart to `retry()`. The backend
  inserts a _clone_ event (new numeric id) that points back at the
  source via `manualResendOf`, then dispatches that clone. The
  original row is untouched, so the historical record of the prior
  failure (status, response status/body, attempts) survives. Works on
  any source status (`success` / `failed` / `pending`).
  - Outbound delivery uses `Idempotency-Key: resend_<originalId>`, so
    recipient handlers can distinguish a resend from a fresh delivery
    both by the header prefix and by reading the response payload's
    `manualResendOf` field.
- `WebhookEvent.manualResendOf: number | null` — populated with the
  source event's numeric id on rows produced by `resend()`, `null`
  everywhere else (originally-fired events and legacy `retry()`
  outputs).

### Deprecated

- `webhookEvents.retry(id)` is soft-deprecated. It still works and is
  not scheduled for removal — older CLI / MCP releases depend on it —
  but new integrations should prefer `resend()`, which preserves the
  original event's audit trail by cloning instead of mutating the row
  in place.

## [0.11.1] — 2026-05-19

### Fixed

- Empty-body mutations (`webhookEvents.retry`, `scheduledCharges.resume`,
  `customers.delete`, `products.portalConfig.clear`,
  `scheduledCharges.clearPaymentMethod`) now send an explicit `{}` body.
  `openapi-fetch` sets `Content-Type: application/json` as a default
  header on every request, and the backend body-parser rejects
  `Content-Type: json` + empty body with
  `Body cannot be empty when content-type is set to 'application/json'`.
  Previously these calls failed against production; the SDK's mock-fetch
  tests didn't surface the regression because the mock never hits the
  body-parser middleware.

## [0.11.0] — 2026-05-19

### Added

- `webhookEvents` resource on the `Garu` client — the seller-facing
  delivery log for outbound webhooks. Use it to audit deliveries from
  the seller's API key, the canonical "did my customer's endpoint
  actually receive event X?" workflow.
  - `webhookEvents.list({ status?, eventType?, endpointId?, page?, limit? })`
    — `GET /api/webhook-events`. Filter by delivery state
    (`pending` / `success` / `failed`), Garu event type, or destination
    endpoint id. Newest first.
  - `webhookEvents.get(id)` — `GET /api/webhook-events/{id}`. Returns
    the full payload, the embedded endpoint snapshot, and the most
    recent response status/body.
  - `webhookEvents.retry(id)` — `POST /api/webhook-events/{id}/retry`.
    Resets the event to `pending`, clears the retry schedule, and
    triggers an immediate delivery attempt. Works on any status
    (`success` / `failed` / `pending`) — use this when a customer
    reports a missed or unprocessed event.
- Types exported from the package root: `WebhookEvent`,
  `WebhookEventEndpoint`, `WebhookEventList`, `WebhookEventStatus`,
  `ListWebhookEventsParams`.

### Fixed

- `webhookEvents.list` now normalizes the legacy backend response
  (`{ events, total, page, limit, pages }`) into the standard
  `{ data, meta: { page, limit, total, totalPages } }` paginated shape
  used by every other SDK resource. Previously the cast-only
  implementation returned `result.data === undefined` against the real
  backend; tests had been mocking the post-normalization shape and
  hid the bug.

## [0.5.0] — 2026-05-01

### Added

- `scheduledCharges` resource on the `Garu` client. Schedule a charge to
  bill a customer on a future date; Garu drives the customer reminder
  on the due date and dunning to the seller team after.
  - `scheduledCharges.create({ customerId, amount, type, dueDate, methods, ... })`
    — `POST /api/scheduled-charges`. PIX and Boleto are supported now;
    `type` accepts only `one_time` in this version.
  - `scheduledCharges.list({ status?, customerId?, type?, dueFrom?, dueTo?, search?, ... })`
    — `GET /api/scheduled-charges`. `status` accepts a single value or
    an array; arrays are sent as repeated query params.
  - `scheduledCharges.get(id)` — `GET /api/scheduled-charges/{id}`.
    Returns a bundle: `{ charge, events, transactions }`.
  - `scheduledCharges.postpone(id, { newDueDate, reason? })` — allowed
    from `scheduled` / `due_today` / `overdue` / `paused`. Clears any
    pending dunning so the new dueDate triggers a fresh reminder.
  - `scheduledCharges.pause(id, { reason? })` — allowed from
    `scheduled` / `due_today` / `overdue`.
  - `scheduledCharges.resume(id)` — only valid from `paused`.
  - `scheduledCharges.markPaid(id, { paymentDate, externalReference? })`
    — record an off-Garu payment (transfer, cash). Allowed from
    `due_today` / `overdue`.
- `customers.list({ status: 'overdue' })` — new filter that returns
  customers with at least one overdue scheduled charge.
- Types exported from the package root: `CreateScheduledChargeParams`,
  `ListScheduledChargesParams`, `MarkPaidScheduledChargeParams`,
  `PauseScheduledChargeParams`, `PostponeScheduledChargeParams`,
  `ScheduledChargeActor`, `ScheduledChargeDetail`,
  `ScheduledChargeEvent`, `ScheduledChargeEventType`,
  `ScheduledChargeLinkedTransaction`, `ScheduledChargeList`,
  `ScheduledChargeRecord`, `ScheduledChargeStatus`,
  `ScheduledChargeType`, `ScheduledPaymentMethod`.

## [0.3.0] — 2026-04-28

### Added

- `products` resource on the `Garu` client.
  - `products.list({ page, limit, search, tab })` — paginated listing of the
    authenticated seller's products (`GET /api/products/seller`).
  - `products.get(uuid)` — fetch a single product by UUID
    (`GET /api/products/uuid/{uuid}`). The UUID is the same identifier
    accepted by `charges.create({ productId })`, so `products.list` is
    the discovery path before creating a charge.
- `Product`, `ProductList`, `ListProductsParams` types exported from the
  package root.

## [0.1.1] — 2026-04-08

### Security

- Upgrade dev dependencies to clear `npm audit` findings:
  - `vitest` 1.5.0 → 4.1.3 (closes critical GHSA — vitest RCE in dev server)
  - `tsup` 8.0.2 → 8.5.1 (closes moderate DOM clobbering advisory)
- All upgrades are dev-only; no runtime-code changes in `@garuhq/node` itself.

## [0.1.0] — 2026-04-08

### Added

- Initial public beta. Reference Node.js / TypeScript SDK for the Garu payment gateway.
- `Garu` client class with `apiKey`, `baseUrl`, `timeoutMs`, `maxRetries` options.
- `charges.create` — PIX, credit card, and boleto charges. Auto-generates `X-Idempotency-Key`
  (UUIDv4) unless the caller supplies one; safe to retry against the Chunk 2 backend cache.
- `charges.get` / `charges.list` / `charges.refund`.
- `meta.get` — capability introspection via `GET /api/meta`.
- `webhooks.verify` — HMAC-SHA256 signature verification, constant-time comparison,
  configurable tolerance window (default 300s). Matches backend `X-Garu-Signature` format
  `t=<ts>,v1=<hex>`.
- Typed error hierarchy: `GaruAuthenticationError`, `GaruPermissionError`, `GaruNotFoundError`,
  `GaruValidationError`, `GaruRateLimitError`, `GaruServerError`, `GaruConnectionError`,
  `GaruSignatureVerificationError`. Every error has a stable `code` string.
- Automatic retries with exponential backoff + full jitter on 408/429/5xx and connection
  errors. Honors `Retry-After`. Never retries 4xx validation errors.
- One runtime dependency (`openapi-fetch`). Node.js ≥ 18 (native `fetch`, `crypto.randomUUID`).
- Dual ESM + CJS build via `tsup` with full `.d.ts`.
- Wire types generated from the live backend OpenAPI spec via `openapi-typescript` —
  `npm run generate` refreshes `src/generated/{openapi.json, schema.d.ts}`.
- Contract tests assert the generated snapshot still covers every endpoint the SDK uses.
- GitHub Actions CI runs typecheck, tests, and build on Node 18 / 20 / 22.

### Known limitations

- Only `charges` and `meta` namespaces. Customers, products, subscriptions, checkout
  sessions, and webhook-endpoint management land in a future release.
- `charges.list` is intentionally omitted — the backend does not yet expose
  `GET /api/transactions`. It will land when the backend grows a seller-scoped list endpoint.
