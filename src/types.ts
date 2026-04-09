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

/** Payment-method identifier as sent to the backend over the wire. */
export type WirePaymentMethodId = 'pix' | 'creditcard' | 'boleto';

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
  [key: string]: unknown;
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
  environment: 'production' | 'staging' | 'development' | string;
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
