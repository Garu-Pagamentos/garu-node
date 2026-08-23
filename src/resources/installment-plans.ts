import type { HttpClient } from '../http.js';
import { generateIdempotencyKey } from '../idempotency.js';
import type {
  CancelInstallmentPlanParams,
  CreateInstallmentPlanParams,
  Installment,
  InstallmentPlan,
  InstallmentPlanList,
  ListInstallmentPlansParams,
  PostponeInstallmentParams,
  RefundRequest,
  ReissueInstallmentResult,
  RequestPlanRefundParams
} from '../types.js';

/**
 * Boleto parcelado (carnê) — one product sold as N monthly bank slips.
 *
 * This is seller-financed consumer credit, not a card instalment. Nobody
 * guarantees a boleto: if the buyer stops paying at parcela 4, the seller
 * keeps four parcelas and loses the rest. Garu emits the slips, chases them
 * and reports, but carries none of the default risk.
 *
 * Only the FIRST boleto exists at creation. The rest are emitted month by
 * month, and the sale activates when parcela 1 compensates — a plan is not a
 * sale until the buyer has paid something.
 */
export class InstallmentPlans {
  constructor(private readonly http: HttpClient) {}

  /**
   * Sell a product as a carnê. Auto-attaches `X-Idempotency-Key` (UUIDv4 if
   * you don't pass `idempotencyKey`), which matters more here than anywhere
   * else in the API: this call registers a REAL boleto at the bank, so a
   * blind retry can put two payable barcodes in one buyer's hands.
   *
   * @example
   * const carne = await garu.installmentPlans.create({
   *   productId: '40381e8e-6ee7-4b8e-9393-766a6e2109d2',
   *   customerId: 4821,
   *   installments: 12
   * });
   * // A R$1.200 product at fator 1,30 bills R$130,00 a month:
   * carne.totalScheduled;            // 1560
   * carne.installmentAmount;         // 130
   * carne.installmentsDetail?.[0];   // parcela 1, with its barcode
   *
   * @example
   * // Attribute the sale to an affiliate. Fixed at sale time: every later
   * // parcela inherits it, so omitting it pays them nothing for the whole
   * // carnê. The affiliate must already be active on this product.
   * await garu.installmentPlans.create({
   *   productId: '40381e8e-6ee7-4b8e-9393-766a6e2109d2',
   *   customerId: 4821,
   *   installments: 6,
   *   firstDueDate: '2026-10-05',
   *   affiliateId: 5
   * });
   */
  async create(params: CreateInstallmentPlanParams): Promise<InstallmentPlan> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const { idempotencyKey: _omit, ...body } = params;
    return this.http.call<InstallmentPlan>((signal) =>
      (this.http.client.POST as Function)('/api/v1/installment-plans', {
        body,
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: InstallmentPlan; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * List carnês, newest first. `dueFrom`/`dueTo` filter on the FIRST
   * parcela's due date, which is what identifies the plan; filtering on every
   * parcela would return one carnê twelve times.
   *
   * @example
   * const atRisk = await garu.installmentPlans.list({ status: 'defaulted' });
   *
   * @example
   * const live = await garu.installmentPlans.list({
   *   status: ['active', 'pending_activation'],
   *   customerId: 4821,
   *   limit: 50
   * });
   */
  async list(params: ListInstallmentPlansParams = {}): Promise<InstallmentPlanList> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.customerId !== undefined) qs.set('customerId', String(params.customerId));
    if (params.productId) qs.set('productId', params.productId);
    if (params.dueFrom) qs.set('dueFrom', params.dueFrom);
    if (params.dueTo) qs.set('dueTo', params.dueTo);
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      for (const s of statuses) qs.append('status', s);
    }
    const query = qs.toString();
    const url = `/api/v1/installment-plans${query ? `?${query}` : ''}`;

    return this.http.call<InstallmentPlanList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: InstallmentPlanList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Retrieve one carnê with every parcela: due date, status, barcode line and
   * boleto PDF.
   *
   * @example
   * const carne = await garu.installmentPlans.get(uuid);
   * const unpaid = carne.installmentsDetail?.filter((i) => i.status !== 'paid');
   * carne.totalCollected;  // what has actually cleared, not what was billed
   */
  async get(uuid: string): Promise<InstallmentPlan> {
    return this.http.call<InstallmentPlan>((signal) =>
      (this.http.client.GET as Function)(`/api/v1/installment-plans/${uuid}`, { signal }).then(
        (r: { data?: InstallmentPlan; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Issue a segunda via for one parcela, once the current slip has expired.
   *
   * A boleto stays payable at any bank until its due date plus five days, so
   * Garu refuses while the old barcode is still live — two live barcodes for
   * one parcela is how a buyer pays it twice. Once per parcela per day.
   *
   * @example
   * const result = await garu.installmentPlans.reissueInstallment(uuid, 4);
   * if (result.status === 'emitted') {
   *   send(result.installment!.boleto!.barcodeLine);
   * }
   */
  async reissueInstallment(uuid: string, number: number): Promise<ReissueInstallmentResult> {
    return this.http.call<ReissueInstallmentResult>((signal) =>
      (this.http.client.POST as Function)(
        `/api/v1/installment-plans/${uuid}/installments/${number}/reissue`,
        { signal }
      ).then((r: { data?: ReissueInstallmentResult; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Move one parcela to a later date. Its siblings keep theirs — this
   * postpones a payment, it does not restructure the carnê. A slip already
   * emitted stays payable on its original date until it expires.
   *
   * @example
   * await garu.installmentPlans.postponeInstallment(uuid, 4, {
   *   newDueDate: '2026-12-20'
   * });
   */
  async postponeInstallment(
    uuid: string,
    number: number,
    params: PostponeInstallmentParams
  ): Promise<Installment> {
    return this.http.call<Installment>((signal) =>
      (this.http.client.POST as Function)(
        `/api/v1/installment-plans/${uuid}/installments/${number}/postpone`,
        { body: params, signal }
      ).then((r: { data?: Installment; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Record a parcela as paid, for when the buyer paid the slip but the
   * webhook never arrived.
   *
   * Garu asks the provider to confirm the charge really compensated before
   * recording it, because this settles the transaction and pays affiliate and
   * co-producer commissions. A provider outage refuses the action rather than
   * trusting the assertion.
   *
   * @example
   * const parcela = await garu.installmentPlans.markInstallmentPaid(uuid, 3);
   * parcela.status;  // 'paid'
   */
  async markInstallmentPaid(uuid: string, number: number): Promise<Installment> {
    return this.http.call<Installment>((signal) =>
      (this.http.client.POST as Function)(
        `/api/v1/installment-plans/${uuid}/installments/${number}/mark-paid`,
        { signal }
      ).then((r: { data?: Installment; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Cancel the carnê. Emission and reminders stop and open slips are
   * cancelled at the provider.
   *
   * Money already collected is NOT returned — open a refund request for that.
   * A cancelled carnê is never revived by a late payment; that money opens a
   * refund request instead.
   *
   * @example
   * await garu.installmentPlans.cancel(uuid, { note: 'Comprador desistiu' });
   */
  async cancel(uuid: string, params: CancelInstallmentPlanParams = {}): Promise<InstallmentPlan> {
    return this.http.call<InstallmentPlan>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/installment-plans/${uuid}/cancel`, {
        body: params,
        signal
      }).then((r: { data?: InstallmentPlan; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Ask for this carnê to be refunded.
   *
   * Garu does NOT move the money. A boleto cannot be reversed and the funds
   * already settled to you, so this records the request and notifies your
   * team. Transfer the money to the buyer yourself, then close it with
   * `garu.refundRequests.confirm`.
   *
   * Attaches an `X-Idempotency-Key` header automatically — if you don't pass
   * `idempotencyKey`, the SDK generates a UUIDv4. The backend already dedupes
   * a second pending request for the same carnê, so this is mainly
   * defense-in-depth for the request-in-flight window.
   *
   * @example
   * const request = await garu.installmentPlans.requestRefund(uuid, {
   *   reason: 'Produto não entregue'
   * });
   * request.status;  // 'pending' — nothing has moved yet
   * request.amount;  // defaults to everything the carnê collected
   */
  async requestRefund(uuid: string, params: RequestPlanRefundParams = {}): Promise<RefundRequest> {
    const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();
    const { idempotencyKey: _omit, ...body } = params;
    return this.http.call<RefundRequest>((signal) =>
      (this.http.client.POST as Function)(`/api/v1/installment-plans/${uuid}/refund-requests`, {
        body,
        headers: { 'X-Idempotency-Key': idempotencyKey },
        signal
      }).then((r: { data?: RefundRequest; error?: unknown; response: Response }) => r)
    );
  }
}
