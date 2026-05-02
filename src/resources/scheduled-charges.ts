import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  CreateScheduledChargeParams,
  ListScheduledChargesParams,
  MarkPaidScheduledChargeParams,
  PauseScheduledChargeParams,
  PostponeScheduledChargeParams,
  ScheduledChargeDetail,
  ScheduledChargeList,
  ScheduledChargeRecord
} from '../types.js';

/**
 * Scheduled charges — bill a customer on a future date.
 *
 * The seller registers a customer (see `garu.customers.create`), then
 * schedules one or more charges (PIX or Boleto). Garu drives the rest:
 * pre-charge customer email on the due date, dunning to the seller team
 * after the due date, and a state machine for postpone/pause/resume/
 * mark-paid actions.
 *
 * Recurring schedules are reserved for a future API version; the current
 * `type` field accepts only `one_time`.
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
   * outside Garu (bank transfer, cash). Allowed from `due_today` / `overdue`.
   *
   * @example
   * await garu.scheduledCharges.markPaid('sch_abc123', {
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
}
