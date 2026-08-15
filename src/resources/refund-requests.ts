import type { HttpClient } from '../http.js';
import type {
  ListRefundRequestsParams,
  RefundRequest,
  RefundRequestList,
  ResolveRefundRequestParams
} from '../types.js';

/**
 * Refunds Garu has been asked to make and cannot make for you.
 *
 * A boleto cannot be reversed at all, and Celcoin exposes no Pix devolução.
 * Either way the funds already settled to you, so the return is a bank
 * transfer only you can make. This resource records the request, notifies
 * your team, and waits for you to assert the money went back. Garu records
 * the assertion; it never observes the transfer.
 *
 * Card and Woovi Pix never appear here — they have real automated reversals
 * (`garu.charges.refund`).
 */
export class RefundRequests {
  constructor(private readonly http: HttpClient) {}

  /**
   * List refund requests, newest first. Covers carnê and Pix/boleto alike.
   *
   * @example
   * // Everything you still owe a buyer.
   * const owed = await garu.refundRequests.list({ status: 'pending' });
   * const total = owed.data.reduce((sum, r) => sum + r.amount, 0);
   *
   * @example
   * const forThisCarne = await garu.refundRequests.list({ planId: carne.uuid });
   */
  async list(params: ListRefundRequestsParams = {}): Promise<RefundRequestList> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.planId) qs.set('planId', params.planId);
    if (params.chargeId) qs.set('chargeId', params.chargeId);
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      for (const s of statuses) qs.append('status', s);
    }
    const query = qs.toString();
    const url = `/api/v1/refund-requests${query ? `?${query}` : ''}`;

    return this.http.call<RefundRequestList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: RefundRequestList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Retrieve one refund request.
   *
   * @example
   * const request = await garu.refundRequests.get(uuid);
   * request.installmentPlanId ?? request.chargeId;  // exactly one is set
   */
  async get(uuid: string): Promise<RefundRequest> {
    return this.http.call<RefundRequest>((signal) =>
      (this.http.client.GET as Function)(`/api/v1/refund-requests/${uuid}`, { signal }).then(
        (r: { data?: RefundRequest; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Record that you returned the money. Call this AFTER transferring it.
   *
   * Confirming closes a carnê as refunded, stops remaining parcelas, cancels
   * open slips at the provider and claws back the affiliate and co-producer
   * commissions on the parcelas that cleared. For a Pix or boleto charge it
   * marks the charge reversed and fires `transaction.refunded`. Idempotent:
   * confirming twice does not claw back twice.
   *
   * @example
   * // 1. You send the money to the buyer, out of band.
   * // 2. Then tell Garu it happened.
   * await garu.refundRequests.confirm(uuid, {
   *   note: 'Pix devolvido em 14/08, e2e E12345678'
   * });
   */
  async confirm(uuid: string, params: ResolveRefundRequestParams = {}): Promise<RefundRequest> {
    return this.http.call<RefundRequest>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/refund-requests/${uuid}/confirm`, {
        body: params,
        signal
      }).then((r: { data?: RefundRequest; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Decline the request. The carnê is untouched and keeps running.
   * Idempotent.
   *
   * @example
   * await garu.refundRequests.reject(uuid, {
   *   note: 'Produto entregue e retirado na loja em 02/08'
   * });
   */
  async reject(uuid: string, params: ResolveRefundRequestParams = {}): Promise<RefundRequest> {
    return this.http.call<RefundRequest>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/refund-requests/${uuid}/reject`, {
        body: params,
        signal
      }).then((r: { data?: RefundRequest; error?: unknown; response: Response }) => r)
    );
  }
}
