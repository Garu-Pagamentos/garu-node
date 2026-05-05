import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  CancelAtPeriodEndScheduledChargeParams,
  CancelRecurrenceScheduledChargeParams,
  ChangePaymentMethodScheduledChargeParams,
  CreateScheduledChargeParams,
  ListScheduledChargeAttemptsParams,
  ListScheduledChargesParams,
  MarkPaidScheduledChargeParams,
  PauseScheduledChargeParams,
  PostponeScheduledChargeParams,
  ScheduledChargeAttemptList,
  ScheduledChargeDetail,
  ScheduledChargeList,
  ScheduledChargeRecord
} from '../types.js';

/**
 * Scheduled charges — bill a customer on a future date.
 *
 * The seller registers a customer (see `garu.customers.create`), then
 * schedules one or more charges (PIX, Boleto, or Card). Garu drives the
 * rest: pre-charge customer email on the due date, dunning to the seller
 * team after the due date, and a state machine for
 * postpone/pause/resume/mark-paid actions.
 *
 * Recurring schedules (`type: 'recurring'`) silent-charge the saved card
 * on every cycle past the first. Optional trial periods, cancel-recurrence,
 * cancel-at-period-end, and payment-method swap actions cover the SaaS
 * lifecycle.
 */
export class ScheduledCharges {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a new scheduled charge. Auto-attaches `X-Idempotency-Key`
   * (UUIDv4 if you don't pass `idempotencyKey`) so retries on transient
   * network failures don't silently double-create.
   *
   * @example
   * const charge = await garu.scheduledCharges.create({
   *   customerId: 42,
   *   amount: 297.50,
   *   type: 'one_time',
   *   dueDate: '2026-06-15',
   *   methods: ['pix', 'boleto'],
   *   description: 'Mensalidade Junho'
   * });
   */
  async create(params: CreateScheduledChargeParams): Promise<ScheduledChargeRecord> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const { idempotencyKey: _omit, ...body } = params;
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)('/api/scheduled-charges', {
        body,
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * List scheduled charges for the authenticated seller, with pagination
   * and filters. Repeat the `status` array to filter on multiple values.
   *
   * @example
   * const overdue = await garu.scheduledCharges.list({ status: 'overdue', limit: 50 });
   *
   * @example
   * const upcoming = await garu.scheduledCharges.list({
   *   status: ['scheduled', 'due_today'],
   *   dueFrom: '2026-06-01',
   *   dueTo: '2026-06-30'
   * });
   */
  async list(params: ListScheduledChargesParams = {}): Promise<ScheduledChargeList> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.customerId !== undefined) qs.set('customerId', String(params.customerId));
    if (params.type) qs.set('type', params.type);
    if (params.dueFrom) qs.set('dueFrom', params.dueFrom);
    if (params.dueTo) qs.set('dueTo', params.dueTo);
    if (params.search) qs.set('search', params.search);
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      for (const s of statuses) qs.append('status', s);
    }
    const query = qs.toString();
    const url = `/api/scheduled-charges${query ? `?${query}` : ''}`;

    return this.http.call<ScheduledChargeList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: ScheduledChargeList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch a single scheduled charge by ID, bundled with its event timeline
   * and any linked Garu transactions.
   *
   * @example
   * const { charge, events, transactions } = await garu.scheduledCharges.get('sch_abc123');
   * // charge.status, events[].eventType, transactions[].status
   */
  async get(id: string): Promise<ScheduledChargeDetail> {
    return this.http.call<ScheduledChargeDetail>((signal) =>
      (this.http.client.GET as Function)(`/api/scheduled-charges/${id}`, { signal }).then(
        (r: { data?: ScheduledChargeDetail; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Postpone a scheduled charge to a new due date. Allowed from
   * `scheduled` / `due_today` / `overdue` / `paused`. Clears any pending
   * dunning so the new dueDate triggers a fresh customer reminder.
   *
   * @example
   * await garu.scheduledCharges.postpone('sch_abc123', {
   *   newDueDate: '2026-07-01',
   *   reason: 'cliente pediu mais prazo'
   * });
   */
  async postpone(
    id: string,
    params: PostponeScheduledChargeParams
  ): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/postpone`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Pause a scheduled charge. No reminders fire while paused. Resume
   * returns it to `scheduled`. Allowed from
   * `scheduled` / `due_today` / `overdue`.
   *
   * @example
   * await garu.scheduledCharges.pause('sch_abc123', { reason: 'em negociação' });
   */
  async pause(id: string, params: PauseScheduledChargeParams = {}): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/pause`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Resume a paused scheduled charge. Only valid from `paused`.
   *
   * @example
   * await garu.scheduledCharges.resume('sch_abc123');
   */
  async resume(id: string): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/resume`, {
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Manually mark a scheduled charge as paid, e.g. when the customer paid
   * outside Garu (bank transfer, cash).
   *
   * - **One-time:** omit `cycleNumber`. Allowed from `due_today` / `overdue`.
   * - **Recurring:** pass `cycleNumber`. Allowed from cycle status
   *   `due_today` / `overdue` / `failed`. Future cycles continue.
   *
   * @example
   * // One-time
   * await garu.scheduledCharges.markPaid('sch_abc123', {
   *   paymentDate: '2026-06-20',
   *   externalReference: 'TED 4472881'
   * });
   *
   * @example
   * // Recurring — mark cycle 3 paid; future cycles keep billing
   * await garu.scheduledCharges.markPaid('sch_abc123', {
   *   cycleNumber: 3,
   *   paymentDate: '2026-06-20',
   *   externalReference: 'TED 4472881'
   * });
   */
  async markPaid(
    id: string,
    params: MarkPaidScheduledChargeParams
  ): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/mark-paid`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Stop future cycles for a recurring series. The currently in-flight
   * cycle (if any) remains active until paid, postponed, or marked-paid;
   * only after that resolves does the series flip to `recurrence_canceled`.
   * Recurring-only.
   *
   * @example
   * await garu.scheduledCharges.cancelRecurrence('sch_abc123', {
   *   reason: 'cliente cancelou plano'
   * });
   */
  async cancelRecurrence(
    id: string,
    params: CancelRecurrenceScheduledChargeParams = {}
  ): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/cancel-recurrence`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Toggle Stripe-style soft cancel on a recurring series. With
   * `enabled: true`, the cycle generator stops emitting new cycles after
   * the next paid cycle; the in-flight cycle still bills + can be paid.
   * Reversible by passing `enabled: false`. Recurring-only.
   *
   * @example
   * await garu.scheduledCharges.setCancelAtPeriodEnd('sch_abc123', { enabled: true });
   */
  async setCancelAtPeriodEnd(
    id: string,
    params: CancelAtPeriodEndScheduledChargeParams
  ): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/cancel-at-period-end`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Swap the saved card on a recurring series. The new PaymentMethod must
   * belong to the same customerId. Future cycles silent-charge the new
   * card; the in-flight cycle is not retroactively rebound.
   *
   * @example
   * await garu.scheduledCharges.changePaymentMethod('sch_abc123', { paymentMethodId: 42 });
   */
  async changePaymentMethod(
    id: string,
    params: ChangePaymentMethodScheduledChargeParams
  ): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.POST as Function)(`/api/scheduled-charges/${id}/payment-method`, {
        body: params,
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Clear the saved card on a recurring series. Future cycles fall back
   * to the email-with-link flow so the customer can re-enter card details
   * or pay via PIX/Boleto.
   *
   * @example
   * await garu.scheduledCharges.clearPaymentMethod('sch_abc123');
   */
  async clearPaymentMethod(id: string): Promise<ScheduledChargeRecord> {
    return this.http.call<ScheduledChargeRecord>((signal) =>
      (this.http.client.DELETE as Function)(`/api/scheduled-charges/${id}/payment-method`, {
        signal
      }).then((r: { data?: ScheduledChargeRecord; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Per-attempt billing log for the series (SPEC §4.2). One row per
   * logical billing event — cycle 1 interactive charge, every silent
   * charge attempt, every retry, every manual mark-paid. Carries the
   * canonical `failureCode` for declines so you can audit billing
   * outcomes without cross-referencing Transactions.
   *
   * @example
   * const { data } = await garu.scheduledCharges.listAttempts('sch_abc', {
   *   cycleNumber: 3
   * });
   * const declines = data.filter((a) => a.status === 'declined');
   */
  async listAttempts(
    id: string,
    params: ListScheduledChargeAttemptsParams = {}
  ): Promise<ScheduledChargeAttemptList> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cycleNumber !== undefined) qs.set('cycleNumber', String(params.cycleNumber));
    const query = qs.toString();
    const url = `/api/scheduled-charges/${id}/attempts${query ? `?${query}` : ''}`;

    return this.http.call<ScheduledChargeAttemptList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: ScheduledChargeAttemptList; error?: unknown; response: Response }) => r
      )
    );
  }
}
