/**
 * Public types for the Garu SDK.
 *
 * The wire-level types (`WireCreateTransactionRequest`, `WireMetaResponse`, ...)
 * are generated from the backend's OpenAPI spec and live in
 * `src/generated/schema.d.ts`. The friendly types in this file
 * (`CreateChargeParams`, `Customer`, `Charge`, ...) are hand-curated for
 * ergonomics — they rename `transactions` to `charges`, collapse wire enums
 * into readable unions, and mark only truly required fields as required.
 * The resource layer maps friendly → wire at the edge.
 */

import type { components } from './generated/schema.js';

export type WireCreateTransactionRequest = components['schemas']['CreateTransactionRequest'];
export type WireCustomerDto = components['schemas']['CustomerDto'];
export type WireCardInfoDto = components['schemas']['CardInfoDto'];
export type WireMetaResponse = components['schemas']['MetaResponse'];

/**
 * Stable, friendly charge status. Mirrors what /api/v1/charges returns — the
 * raw processor statuses (payedPix, pendingBoleto, …) are normalized server-side
 * and never surface here. Act on `paid`; `authorized` is card money held but not
 * captured, `refund_pending` is a Pix devolução requested but not yet settled.
 */
export type ChargeStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'canceled'
  | 'refund_pending'
  | 'refunded'
  | 'chargeback';

export interface Customer {
  /** Full legal name. 3–255 chars. */
  name: string;
  email: string;
  /** CPF (11 digits) or CNPJ (14 digits), digits only. */
  document: string;
  /** 10 or 11 digits with area code, no formatting. */
  phone: string;
  /** 8 digits, no hyphen. Optional. */
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  /** 2-letter uppercase state code, e.g. `SP`. */
  state?: string;
}

export interface CardInput {
  /** PAN, 13-19 digits, no spaces. Server-to-server only (PCI scope). */
  number: string;
  /** Holder name exactly as printed. */
  holderName: string;
  /** Expiry as `YYYY-MM`. */
  expirationDate: string;
  /** 3 or 4 digits. Never stored by Garu. */
  cvv: string;
  /** 1-12. */
  installments: number;
}

export interface CreateChargeParams {
  /** UUID of the product being charged. */
  productId: string;
  /** Payment method. */
  paymentMethod: ChargePaymentMethod;
  /** Customer buying the product. */
  customer: Customer;
  /**
   * Required when `paymentMethod` is `creditCard`. This is a raw PAN + CVV, so
   * call the SDK only from your server, never a browser or app — it puts you in
   * PCI DSS scope.
   */
  card?: CardInput;
  /** Optional pre-created checkout session token, for attribution. */
  checkoutSessionToken?: string;
  /** Free-form metadata attached to the charge. */
  additionalInfo?: string;
  /** Idempotency key. If omitted, the SDK generates a UUIDv4. Valid 24h. */
  idempotencyKey?: string;
}

export type ChargePaymentMethod = 'pix' | 'boleto' | 'creditCard';

export interface Charge {
  /** Public identifier. Use this everywhere; there is no numeric id. */
  uuid: string;
  status: ChargeStatus;
  paymentMethod: ChargePaymentMethod;
  /** Product base price, in decimal BRL / reais. */
  amount: number;
  /**
   * What the customer is actually charged, in reais. Equals `amount` for PIX,
   * boleto and 1x card; higher for installment card sales (fator markup). Use
   * this to reconcile, not `amount`.
   */
  chargedTotal: number;
  installments: number;
  product: { uuid: string; name: string } | null;
  /** `document` is partially masked. */
  customer: { name: string; email: string; document: string } | null;
  /** Present for PIX: the copy-paste EMV code to render as a QR. */
  pix: { code: string } | null;
  /** Present for boleto: the barcode line and a Garu-hosted PDF URL. */
  boleto: { barcodeLine: string; pdfUrl: string } | null;
  /** Present for card: only brand, last4 and the authorization code. */
  card: { brand: string | null; last4: string | null; authorizationCode: string | null } | null;
  /** Set once refunded. `refundedAt` is null while a Pix devolução is unsettled. */
  refund: { amount: number; reason: string | null; refundedAt: string | null } | null;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. Only set for boleto (due date); null for PIX and card. */
  expiresAt: string | null;
}

export interface RefundChargeParams {
  /**
   * Partial refund in **decimal BRL / reais** (e.g. `10.00`) — NOT centavos.
   * Omit for a full refund. Passing `1000` for "R$ 10,00" refunds a thousand
   * reais.
   *
   * For a Pix Automático charge this starts an asynchronous devolução: the
   * charge moves to `refund_pending` and only reaches `refunded` once the
   * transfer settles.
   */
  amount?: number;
  /** Free-form reason stored on the refund. */
  reason?: string;
}

export interface ListChargesParams {
  /** Page number (1-based). Default: 1. */
  page?: number;
  /** Items per page (1-100). Default: 20. */
  limit?: number;
  /** Filter by friendly status (e.g. `paid`, `pending`). */
  status?: ChargeStatus;
  /** Filter by payment method. */
  paymentMethod?: ChargePaymentMethod;
  /** Filter by product UUID. */
  productId?: string;
  /** Charges created at or after this ISO-8601 instant. */
  createdAfter?: string;
  /** Charges created at or before this ISO-8601 instant. */
  createdBefore?: string;
  /** Search by customer name, email, or document. */
  search?: string;
  /** Sort order. Default `-createdAt` (newest first). */
  sort?: 'createdAt' | '-createdAt' | 'amount' | '-amount';
}

export interface PaginatedList<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ChargeList {
  data: Charge[];
  /** Items on this page. */
  count: number;
  /** Total matches across all pages. */
  totalCount: number;
  totalPages: number;
}

/** Result of cancelling a charge. */
export interface CancelChargeResult {
  canceled: boolean;
}

export interface CustomerRecord {
  id: number;
  name: string;
  email: string;
  document: string;
  phone: string;
  personType: string;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Resolved billing email used for outbound seller→customer emails:
   * `billingEmailOverride ?? per-seller email ?? customer.email`.
   */
  billingEmail?: string;
  /** True when a sticky `billingEmailOverride` is set for this seller. */
  hasBillingEmailOverride?: boolean;
  [key: string]: unknown;
}

export interface SetBillingEmailOverrideParams {
  /**
   * Customer-controlled billing email. Pass `null` to clear and fall back to
   * the per-seller last-used email or the global `customer.email`.
   */
  billingEmailOverride: string | null;
}

export type CustomerList = PaginatedList<CustomerRecord>;

export interface CreateCustomerParams {
  name: string;
  email: string;
  /** CPF (11 digits) or CNPJ (14 digits), digits only. */
  document: string;
  /** 10 or 11 digits with area code. */
  phone: string;
  /** `fisica` or `juridica`. */
  personType: 'fisica' | 'juridica';
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  /** 2-letter uppercase state code, e.g. `SP`. */
  state?: string;
}

export interface UpdateCustomerParams {
  name?: string;
  email?: string;
  document?: string;
  phone?: string;
  personType?: 'fisica' | 'juridica';
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface ListCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  /** Filter by aggregated status. `overdue` returns customers with at least one overdue scheduled charge. */
  status?: 'overdue';
}

export type ScheduledChargeStatus =
  | 'scheduled'
  | 'due_today'
  | 'overdue'
  | 'paid'
  | 'paused'
  | 'canceled'
  | 'trial'
  | 'pending_tokenization'
  | 'recurrence_canceled';

export type ScheduledChargeType = 'one_time' | 'recurring';

/**
 * Payment method for a scheduled charge.
 *
 * `pix_automatic` is Pix Automático — Brazil's BACEN auto-debit recurring
 * Pix. The customer authorizes **once** via a consent link/QR in their bank
 * app; every cycle from the second onward debits silently with no further
 * action. It is only valid when `type='recurring'` **and** `productId` is
 * set; the product must also have Pix Automático enabled (`pixAutomatic`).
 */
export type ScheduledPaymentMethod = 'pix' | 'boleto' | 'card' | 'pix_automatic';

export type RecurrenceInterval =
  'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'biannual' | 'yearly';

export interface RecurrenceConfig {
  interval: RecurrenceInterval;
  /** Multiplier for the interval (default 1). */
  intervalCount?: number;
  /** Stop after N successful cycles. Mutually exclusive with `endsOn`. */
  endsAfter?: number;
  /** Stop after this calendar date (YYYY-MM-DD). Mutually exclusive with `endsAfter`. */
  endsOn?: string;
}

export type ScheduledChargeEventType =
  | 'created'
  | 'postponed'
  | 'paused'
  | 'resumed'
  | 'recurrence_canceled'
  | 'manually_marked_paid'
  | 'paid'
  | 'overdue_reminder_sent'
  | 'd_day_reminder_sent';

export type ScheduledChargeActor =
  { type: 'user'; id: number } | { type: 'api_key'; id: number } | { type: 'system' };

export interface ScheduledChargeRecord {
  id: string;
  sellerId: number;
  customerId: number;
  productId: number | null;
  /** Decimal BRL (e.g. `297.50`), never centavos. */
  amount: number;
  description: string | null;
  type: ScheduledChargeType;
  /** YYYY-MM-DD in São Paulo time. */
  dueDate: string;
  methods: ScheduledPaymentMethod[];
  status: ScheduledChargeStatus;
  externalReference: string | null;
  /**
   * Max days past `dueDate` the daily recovery sweep will still auto-bill a
   * missed charge. `null` means the system default (14) applies.
   */
  maxRecoveryDays: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  /** Eager-loaded customer (id/name/email/document only). */
  customer?: { id: number; name: string; email: string; document: string } | null;
  /** Eager-loaded product (id/uuid/name only). */
  product?: { id: number; uuid: string; name: string } | null;
  [key: string]: unknown;
}

export interface ScheduledChargeEvent {
  id: number;
  scheduledChargeId: string;
  eventType: ScheduledChargeEventType;
  actor: ScheduledChargeActor;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ScheduledChargeLinkedTransaction {
  id: number;
  /** Centavos (BRL × 100), matching `garu.charges.*` value semantics. */
  value: number;
  paymentMethod: string;
  status: string;
  date: string;
  refundedAt: string | null;
  [key: string]: unknown;
}

export interface ScheduledChargeDetail {
  charge: ScheduledChargeRecord;
  events: ScheduledChargeEvent[];
  transactions: ScheduledChargeLinkedTransaction[];
}

export type ScheduledChargeList = PaginatedList<ScheduledChargeRecord>;

/** Source of a billing attempt — see SPEC §3.1. */
export type ScheduledChargeAttemptSource =
  'cycle1_interactive' | 'silent_charge' | 'card_retry' | 'manual_mark_paid' | 'fallback_pix';

export type ScheduledChargeAttemptStatus =
  'pending' | 'succeeded' | 'declined' | 'canceled' | 'errored';

export interface ScheduledChargeAttempt {
  id: number;
  cycleId: string;
  cycleNumber: number;
  attemptNumber: number;
  attemptedAt: string;
  source: ScheduledChargeAttemptSource;
  paymentMethod: 'card' | 'pix' | 'boleto' | 'pix_automatic' | 'manual';
  paymentMethodId: number | null;
  cardLast4: string | null;
  cardBrand: string | null;
  status: ScheduledChargeAttemptStatus;
  failureCode: GaruFailureCode | null;
  failureReason: string | null;
  gatewayFailureCode: string | null;
  gatewayChargeId: number | null;
  transactionId: number | null;
}

export type ScheduledChargeAttemptList = PaginatedList<ScheduledChargeAttempt>;

export interface ListScheduledChargeAttemptsParams {
  page?: number;
  limit?: number;
  cycleNumber?: number;
}

export interface CreateScheduledChargeParams {
  customerId: number;
  /**
   * Required when `methods` includes `card` — Celcoin transactions are
   * scoped per product. Optional otherwise.
   */
  productId?: number;
  /** Decimal BRL (e.g. `297.50`). */
  amount: number;
  description?: string;
  /** Schedule type. `recurring` requires a `recurrence` block. */
  type: ScheduledChargeType;
  /** YYYY-MM-DD in São Paulo time. Must be today or future. */
  dueDate: string;
  /**
   * `card` is recurring-only and requires `productId`. `pix_automatic`
   * (Pix Automático auto-debit) likewise requires `type='recurring'` **and**
   * `productId`, and the product must have Pix Automático enabled.
   */
  methods: ScheduledPaymentMethod[];
  /** Cadence for `type='recurring'`. Must be omitted when `type='one_time'`. */
  recurrence?: RecurrenceConfig;
  /**
   * Free-trial duration in days (1..365). Recurring-only. When set, cycle 1
   * is rebased to `today + trialDays` and `customer.trial_started` fires
   * immediately.
   */
  trialDays?: number;
  externalReference?: string;
  metadata?: Record<string, unknown>;
  /**
   * Max days past `dueDate` the daily recovery sweep will still auto-bill a
   * missed charge (integer 1..365). Omit for the system default (14).
   */
  maxRecoveryDays?: number;
  /**
   * Optional idempotency key for safe retries. The SDK auto-generates a
   * UUIDv4 when omitted and forwards it as `X-Idempotency-Key`.
   */
  idempotencyKey?: string;
}

export interface ListScheduledChargesParams {
  page?: number;
  limit?: number;
  customerId?: number;
  status?: ScheduledChargeStatus | ScheduledChargeStatus[];
  type?: ScheduledChargeType;
  /** YYYY-MM-DD lower bound for `dueDate`. */
  dueFrom?: string;
  /** YYYY-MM-DD upper bound for `dueDate`. */
  dueTo?: string;
  /** Free-text match against customer name / email / document. */
  search?: string;
}

export interface PostponeScheduledChargeParams {
  /** YYYY-MM-DD in São Paulo time. Must be today or future. */
  newDueDate: string;
  reason?: string;
}

export interface PauseScheduledChargeParams {
  reason?: string;
}

export interface MarkPaidScheduledChargeParams {
  /** YYYY-MM-DD in São Paulo time. Must be today or past. */
  paymentDate: string;
  /** Bank reference, internal ID, or any stable string for reconciliation. */
  externalReference?: string;
  /**
   * Cycle number to mark paid. REQUIRED for recurring schedules. Omitted
   * for one-time charges.
   */
  cycleNumber?: number;
}

export interface CancelRecurrenceScheduledChargeParams {
  reason?: string;
}

export interface CancelAtPeriodEndScheduledChargeParams {
  /** `true` enables Stripe-style soft cancel; `false` clears the flag. */
  enabled: boolean;
}

export interface ChangePaymentMethodScheduledChargeParams {
  /** PaymentMethod id to bind. Must belong to the same customerId. */
  paymentMethodId: number;
}

/**
 * Result of `scheduledCharges.chargeNow(id)` — what the immediate dispatch did:
 *
 * - `dispatched`   — sent now (customer email/notification + outbound webhook + timeline event).
 * - `already_sent` — this cycle's d-day was already dispatched; no-op (the action is idempotent).
 * - `not_sent`     — couldn't send; see `reason` (e.g. `no_email`, `lock_lost`, `no_saved_payment_method`).
 * - `failed`       — card charge failed; see `reason` (e.g. `card_expired`, or a gateway decline code).
 */
export type ChargeNowOutcome = 'dispatched' | 'already_sent' | 'not_sent' | 'failed';

/**
 * Why a `not_sent` / `failed` charge-now didn't go through. The documented
 * literals are stable; `failed` may also surface a raw gateway decline code,
 * so the type stays open (`string & {}`) without losing autocomplete.
 */
export type ChargeNowReason =
  | 'no_email'
  | 'lock_lost'
  | 'no_saved_payment_method'
  | 'card_expired'
  | 'payment_method_missing'
  | 'customer_missing'
  | (string & {});

export interface ChargeNowResult {
  outcome: ChargeNowOutcome;
  /** Cycle that was dispatched/attempted, or `null` for one-time charges. */
  cycleNumber: number | null;
  /** Present on `not_sent` / `failed`. See {@link ChargeNowReason}. */
  reason?: ChargeNowReason;
  /** Ready-to-show pt-BR message describing the outcome. */
  message: string;
}

export interface Product {
  /**
   * @deprecated The v1 API no longer returns a numeric id — use `uuid` to
   * address a product. Present only on legacy `/api/products/*` responses;
   * `undefined` on v1.
   */
  id?: number;
  uuid: string;
  name: string;
  description: string;
  image: string;
  /** Price in decimal BRL / reais (e.g. `297.50`) — NOT centavos. */
  value: number;
  sellerId: number;
  sellerName?: string;
  pix: boolean;
  boleto: boolean;
  creditCard: boolean;
  /**
   * When `true`, the public subscription checkout exposes Pix Automático
   * (BACEN auto-debit recurring Pix) as a payment option. Enabled by
   * default; sellers can disable it per product. Only the subscription
   * checkout mode reads this flag. See {@link ScheduledPaymentMethod}.
   */
  pixAutomatic: boolean;
  /** Per-parcela credit-card breakdown (the amount charged per installment). */
  installments: Installment[];
  tags?: string[];
  isSubscription?: boolean;
  subscriptionType?: string;
  unitLabel?: string;
  comission?: string;
  valueWithComission?: number;
  returnUrl?: string;
  returnUrlButtonText?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** One entry in a product's credit-card installment breakdown. */
export interface Installment {
  /** Number of parcelas. */
  quantity: number;
  /** Amount charged per installment, in reais (BRL), with the fator markup applied. */
  value: number;
}

/**
 * List envelope returned by `products.list()`. Flat (not `{ data, meta }`) —
 * matches the `/api/v1/products` response.
 */
export interface ProductList {
  data: Product[];
  /** Items returned on this page. */
  count: number;
  /** Total products matching the filter across all pages. */
  totalCount: number;
  totalPages: number;
}

export interface ListProductsParams {
  page?: number;
  limit?: number;
  /** Search by product name. */
  search?: string;
  /** @deprecated Not supported by the v1 API (ignored). `list()` returns the seller's own products. */
  tab?: string;
}

export interface CreateProductParams {
  name: string;
  /** Price in decimal BRL / reais (e.g. `297.50`) — NOT centavos. */
  value?: number;
  description?: string;
  /** HTTPS URL of the product cover image. */
  image?: string;
  tags?: string[];
  pix?: boolean;
  boleto?: boolean;
  creditCard?: boolean;
  /**
   * Enable Pix Automático (BACEN auto-debit recurring Pix) on the
   * subscription checkout. Defaults to enabled server-side. Only the
   * subscription checkout mode reads this flag. See {@link Product.pixAutomatic}.
   */
  pixAutomatic?: boolean;
  /** Max number of installments offered on credit card. */
  installments?: number;
  isSubscription?: boolean;
  subscriptionType?: string;
  unitLabel?: string;
  returnUrl?: string;
  returnUrlButtonText?: string;
  /** Text shown on the buyer's card/bank statement. */
  statementDescriptor?: string;
  /**
   * Idempotency key for the create request. Defaults to a generated UUIDv4.
   * Pass your own to make a retry across process restarts safe — the backend
   * returns the original product instead of creating a duplicate.
   */
  idempotencyKey?: string;
}

export interface UpdateProductParams {
  name?: string;
  /** Price in decimal BRL / reais (e.g. `297.50`) — NOT centavos. */
  value?: number;
  description?: string;
  image?: string;
  tags?: string[];
  pix?: boolean;
  boleto?: boolean;
  creditCard?: boolean;
  pixAutomatic?: boolean;
  installments?: number;
  isSubscription?: boolean;
  subscriptionType?: string;
  unitLabel?: string;
  returnUrl?: string;
  returnUrlButtonText?: string;
  statementDescriptor?: string;
}

export interface MetaFeatures {
  subscriptions: boolean;
  checkout_sessions: boolean;
  idempotency_keys: boolean;
  test_mode: boolean;
  webhooks: boolean;
}

export interface MetaResponse {
  name: string;
  version: string;
  environment: string;
  api_version: string;
  payment_methods: string[];
  currencies: string[];
  billing_intervals: string[];
  webhook_events: string[];
  features: MetaFeatures;
  docs_url: string;
  dashboard_url: string;
  support_email: string;
}

// ============================================================
// v0.8.0 — failure codes + per-product portal config + new webhook events
// ============================================================

/**
 * Canonical Garu failure code on `transaction.payment.failed` and
 * `scheduled_charge.cycle_failed` events. Stable across acquirer changes —
 * branch on this rather than the raw Celcoin code.
 */
export type GaruFailureCode =
  | 'insufficient_funds'
  | 'card_declined'
  | 'card_expired'
  | 'card_canceled'
  | 'processing_error'
  | 'issuer_unavailable'
  | 'fraud_suspected'
  | 'invalid_cvv'
  | 'do_not_honor_repeated'
  | 'unknown';

/**
 * Shape of the failure trio added to `transaction.payment.failed` and
 * `scheduled_charge.cycle_failed` payloads. Sellers should always receive
 * a non-null `failureCode` — `unknown` is the sentinel when the gateway
 * didn't surface enough detail to map.
 */
export interface FailurePayload {
  failureCode: GaruFailureCode;
  failureReason: string | null;
  /** Raw acquirer code (Celcoin's ABECS code today). For forensics only. */
  gatewayFailureCode: string | null;
}

/**
 * `payment_method.expiring_soon` — fires at 30/14/7 days before card
 * expiry, idempotent per stage. Use to nudge the customer to update
 * their card before silent-charge starts failing.
 */
export interface PaymentMethodExpiringPayload {
  paymentMethodId: number;
  customerId: number;
  cardLast4: string;
  cardBrand: string;
  expiresAt: string;
  daysUntilExpiry: 30 | 14 | 7;
}

/**
 * `payment_method.expired` — fires once on the day-of-expiry when the cron
 * flips `status='expired'`. Future silent charges short-circuit
 * with `failureCode='card_expired'` instead of hitting the acquirer.
 */
export interface PaymentMethodExpiredPayload {
  paymentMethodId: number;
  customerId: number;
  cardLast4: string;
  cardBrand: string;
  expiresAt: string;
}

// ============================================================
// Webhook events — outgoing event log for a seller's endpoints
// ============================================================

/**
 * Delivery state of an outbound webhook event.
 *
 * - `pending` — queued or scheduled for a future retry (e.g. exponential backoff).
 * - `success` — endpoint returned 2xx.
 * - `failed`  — endpoint exhausted retries or returned a non-2xx the gateway
 *   refuses to retry. Trigger a manual retry with `webhookEvents.retry(id)`.
 */
export type WebhookEventStatus = 'pending' | 'success' | 'failed';

/**
 * Minimal endpoint info embedded on every event row, so dashboards can
 * render destination URL + description without a second lookup.
 */
export interface WebhookEventEndpoint {
  id: number;
  url: string;
  description: string | null;
  enabled: boolean;
  events: string[];
  [key: string]: unknown;
}

export interface WebhookEvent {
  id: number;
  endpointId: number;
  /** Eager-loaded endpoint snapshot. */
  webhookEndpoint: WebhookEventEndpoint;
  /** Garu event type, e.g. `transaction.payment.paid`. */
  eventType: string;
  /** Full JSON payload the gateway POSTed (or will POST) to `webhookEndpoint.url`. */
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  /** Number of delivery attempts so far. */
  attempts: number;
  /** ISO-8601. Null if no attempt has fired yet. */
  lastAttemptAt: string | null;
  /** ISO-8601. Null when terminal (`success`/`failed`) or not scheduled yet. */
  nextRetryAt: string | null;
  /** HTTP status returned by the endpoint on the most recent attempt. */
  responseStatus: number | null;
  /** Response body from the most recent attempt, truncated by the gateway. */
  responseBody: string | null;
  /**
   * When this row is a clone produced by `webhookEvents.resend(id)`, this is
   * the numeric id of the original event the clone was forked from. `null`
   * on every originally-fired event (and on events resurrected via the
   * legacy `webhookEvents.retry(id)` mutation, which mutates in place
   * instead of cloning).
   */
  manualResendOf: number | null;
  createdAt: string;
  [key: string]: unknown;
}

export type WebhookEventList = PaginatedList<WebhookEvent>;

export interface ListWebhookEventsParams {
  page?: number;
  limit?: number;
  /** Filter by delivery state. */
  status?: WebhookEventStatus;
  /** Filter by Garu event type, e.g. `transaction.payment.paid`. */
  eventType?: string;
  /** Filter by the destination endpoint that should receive (or received) the event. */
  endpointId?: number;
}

export interface ResendWebhookEventParams {
  /**
   * SDK→gateway idempotency key. If omitted, the SDK generates a UUIDv4
   * and forwards it as `X-Idempotency-Key`. Within 24h the backend
   * returns the original clone instead of creating a new one — pass a
   * stable key from your own retry layer to dedupe across SDK
   * invocations.
   */
  idempotencyKey?: string;
}

/**
 * Per-product portal customization (Atletia coach-as-product modeling and
 * any other B2B2C platform). `null` fields inherit from the seller-level
 * portal config.
 */
export interface ProductPortalConfig {
  id: number;
  productId: number;
  businessName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  allowCancelSubscription: boolean | null;
  allowUpdatePaymentMethod: boolean | null;
  allowUpdateBillingInfo: boolean | null;
  allowViewInvoices: boolean | null;
  allowApplyCoupons: boolean | null;
  requireCancelReason: boolean | null;
  cancelAtPeriodEndOnly: boolean | null;
  sendCancellationEmail: boolean | null;
  sendPaymentMethodUpdatedEmail: boolean | null;
  customSuccessMessage: string | null;
  customCancellationMessage: string | null;
  customWelcomeText: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for `POST` / `PATCH /api/products/:id/portal-config`. Both verbs
 * are upsert with merge semantics — only fields present are written;
 * unspecified fields keep their persisted value. Use the `clear`
 * method (DELETE) to reset everything.
 */
export interface SetProductPortalConfigParams {
  businessName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  allowCancelSubscription?: boolean | null;
  allowUpdatePaymentMethod?: boolean | null;
  allowUpdateBillingInfo?: boolean | null;
  allowViewInvoices?: boolean | null;
  allowApplyCoupons?: boolean | null;
  requireCancelReason?: boolean | null;
  cancelAtPeriodEndOnly?: boolean | null;
  sendCancellationEmail?: boolean | null;
  sendPaymentMethodUpdatedEmail?: boolean | null;
  customSuccessMessage?: string | null;
  customCancellationMessage?: string | null;
  customWelcomeText?: string | null;
}

// ---------------------------------------------------------------------------
// Boleto parcelado (carnê) — one product sold as N monthly bank slips
// ---------------------------------------------------------------------------

export type InstallmentPlanStatus =
  | 'pending_activation'
  | 'active'
  | 'completed'
  | 'defaulted'
  | 'canceled'
  | 'refunded';

export type InstallmentStatus =
  | 'scheduled'
  | 'due_today'
  | 'processing'
  | 'paid'
  | 'overdue'
  | 'failed'
  | 'canceled';

/** One monthly slip of a carnê. */
export interface Installment {
  /** 1-based position in the plan. */
  number: number;
  amount: number;
  /** YYYY-MM-DD in São Paulo time. */
  dueDate: string;
  status: InstallmentStatus;
  paidAt: string | null;
  /**
   * Null until the slip is registered. Parcelas 2..N are emitted month by
   * month, so most of a fresh plan has no barcode yet.
   */
  boleto: { barcodeLine: string; pdfUrl: string } | null;
  reissueCount: number;
}

export interface InstallmentPlan {
  uuid: string;
  status: InstallmentPlanStatus;
  installments: number;
  installmentsPaid: number;
  /** The cash price the buyer would have paid in one go. */
  baseValue: number;
  /** Interest multiplier snapshotted at sale time; never recomputed. */
  fator: number;
  installmentAmount: number;
  /** `installmentAmount × installments` — what the carnê bills in total. */
  totalScheduled: number;
  /**
   * What has actually cleared. May exceed `totalScheduled` once a bank adds
   * multa or mora, which is why the two are separate fields.
   */
  totalCollected: number;
  firstDueDate: string;
  graceDays: number | null;
  cancelReason: string | null;
  product: { uuid: string; name: string } | null;
  customer: { name: string; email: string; document: string } | null;
  activatedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  /** Present on retrieve and create; omitted from list responses. */
  installmentsDetail?: Installment[];
}

export interface InstallmentPlanList {
  data: InstallmentPlan[];
  count: number;
  totalCount: number;
  totalPages: number;
}

export interface CreateInstallmentPlanParams {
  /** Public uuid of a product with carnê enabled. */
  productId: string;
  /** Numeric customer id, as returned by `garu.customers.create`. */
  customerId: number;
  /** 2..12. One parcela is not a carnê. */
  installments: number;
  /** YYYY-MM-DD. Defaults to today; must be within 90 days. */
  firstDueDate?: string;
  /**
   * The affiliate who made this sale. Fixed at sale time: every later parcela
   * inherits it, so omitting it pays that affiliate nothing for the whole
   * carnê.
   */
  affiliateId?: number;
  /** Auto-generated when omitted. */
  idempotencyKey?: string;
}

export interface ListInstallmentPlansParams {
  page?: number;
  limit?: number;
  status?: InstallmentPlanStatus | InstallmentPlanStatus[];
  customerId?: number;
  productId?: string;
  /** Filters on the FIRST parcela's due date, which identifies the plan. */
  dueFrom?: string;
  dueTo?: string;
}

export interface PostponeInstallmentParams {
  /** YYYY-MM-DD. Moves this parcela only; its siblings keep their dates. */
  newDueDate: string;
}

export interface ReissueInstallmentResult {
  status: string;
  reason: string | null;
  installment: Installment | null;
}

export interface CancelInstallmentPlanParams {
  note?: string;
}

// --- Refund requests -------------------------------------------------------

export type RefundRequestStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * A refund Garu has been ASKED to make and has not made. Garu never moves this
 * money: a boleto cannot be reversed and Celcoin exposes no Pix devolução, so
 * the funds already settled to the seller and the return is a bank transfer
 * only they can make.
 */
export interface RefundRequest {
  uuid: string;
  status: RefundRequestStatus;
  /** Amount the seller is being asked to return, in reais. */
  amount: number;
  reason: string | null;
  /** Exactly one of these is set. */
  installmentPlanId: string | null;
  chargeId: string | null;
  requestedBy: { type: string; id?: number | string | null };
  resolvedBy: { type: string; id?: number | string | null } | null;
  sellerNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RefundRequestList {
  data: RefundRequest[];
  count: number;
  totalCount: number;
  totalPages: number;
}

export interface RequestPlanRefundParams {
  /** Defaults to everything the carnê has collected. */
  amount?: number;
  reason?: string;
}

export interface ListRefundRequestsParams {
  page?: number;
  limit?: number;
  status?: RefundRequestStatus | RefundRequestStatus[];
  /** Filter by carnê uuid. */
  planId?: string;
  /** Filter by charge uuid (Pix and boleto requests). */
  chargeId?: string;
}

export interface ResolveRefundRequestParams {
  note?: string;
}
