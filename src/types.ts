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

export type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

/**
 * Payment-method identifier as it appears on the wire. `pix_automatic`
 * (Pix Automático auto-debit) surfaces here on transactions/charges read
 * back from Pix Automático recurring cycles. It is never produced by
 * `toWirePaymentMethod`, since one-off charges can't use it.
 */
export type WirePaymentMethodId = 'pix' | 'creditcard' | 'boleto' | 'pix_automatic';

export type ChargeStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled'
  | 'expired';

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

export interface CardInfo {
  /** 13–19 digits, no spaces or hyphens. */
  cardNumber: string;
  /** 3 or 4 digits. */
  cvv: string;
  /** `YYYY-MM`. */
  expirationDate: string;
  /** As printed on the card. */
  holderName: string;
  /** 1–12. */
  installments: number;
}

export interface CreateChargeParams {
  /** Customer buying the product. */
  customer: Customer;
  /** UUID of the product being charged. */
  productId: string;
  /** Payment method. */
  paymentMethod: PaymentMethod;
  /** Required when `paymentMethod` is `credit_card`. */
  cardInfo?: CardInfo;
  /** Free-form metadata attached to the charge. */
  additionalInfo?: string;
  /** Original checkout link, if any. */
  link?: string | null;
  /** Associated affiliate ID, if any. */
  affiliateId?: number | null;
  /** Subscription price ID (`price_*`), for subscription charges only. */
  priceId?: string | null;
  /** Optional pre-created checkout session token. */
  checkoutSessionToken?: string;
  /**
   * Idempotency key. If omitted, the SDK generates a UUIDv4.
   * Keys are valid for 24h on the backend.
   */
  idempotencyKey?: string;
}

export interface Charge {
  id: number;
  status: ChargeStatus;
  amount: number;
  paymentMethodId: WirePaymentMethodId;
  /** ISO-8601. */
  date: string;
  /** ISO-8601. */
  deadline?: string;
  /** Product this charge belongs to. */
  product?: { id: number; uuid?: string; name?: string };
  [key: string]: unknown;
}

export interface RefundChargeParams {
  /** Partial refund in centavos. Omit for full refund. */
  amount?: number;
  /** Free-form reason stored on the refund. */
  reason?: string;
  idempotencyKey?: string;
}

export interface ListChargesParams {
  /** Page number (1-based). Default: 1. */
  page?: number;
  /** Items per page (1–100). Default: 20. */
  limit?: number;
  /** Filter by status (e.g. `paid`, `pending`). */
  status?: string;
  /** Search by customer name, email, or document. */
  search?: string;
  /** Filter by payment method (`pix`, `creditcard`, `boleto`). */
  paymentMethod?: string;
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

export type ChargeList = PaginatedList<Charge>;

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
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'biannual'
  | 'yearly';

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
  | { type: 'user'; id: number }
  | { type: 'api_key'; id: number }
  | { type: 'system' };

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
  | 'cycle1_interactive'
  | 'silent_charge'
  | 'card_retry'
  | 'manual_mark_paid'
  | 'fallback_pix';

export type ScheduledChargeAttemptStatus =
  | 'pending'
  | 'succeeded'
  | 'declined'
  | 'canceled'
  | 'errored';

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
  id: number;
  uuid: string;
  name: string;
  description: string;
  image: string;
  /** Price in centavos (BRL × 100). */
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
  installments: number[];
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

export type ProductList = PaginatedList<Product>;

export interface ListProductsParams {
  page?: number;
  limit?: number;
  /** Search by product name. */
  search?: string;
  /** Backend tab filter (e.g. `active`, `archived`). Backend default is used when omitted. */
  tab?: string;
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

/** Map the SDK's friendly `PaymentMethod` to the backend's wire value. */
export function toWirePaymentMethod(pm: PaymentMethod): WirePaymentMethodId {
  return pm === 'credit_card' ? 'creditcard' : pm;
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
