import type { HttpClient } from '../http.js';
import type {
  CreateOfferParams,
  ListOffersParams,
  Offer,
  OfferList,
  UpdateOfferParams
} from '../types.js';

/**
 * Offers — sell the same product at more than one price, each behind its own
 * link (Garu v0.23.0).
 *
 * An offer overrides the PRICE and nothing else: payment methods, the
 * installment ceiling, carnê, name, description and image all stay on the
 * product. A bare product link keeps charging `product.value`, so nothing you
 * already published changes when you add one.
 *
 * Two ways to sell through an offer:
 *
 * 1. Hand out the hosted link — `/pay/{productUuid}?offer={slug or id}`
 * 2. Charge it directly — `charges.create({ productId, offer })`
 *
 * Either way the SERVER resolves the price from the offer. The amount is never
 * taken from the caller.
 *
 * Offers are refused on subscription products, which select their price with
 * `priceId` instead.
 */
export class Offers {
  constructor(private readonly http: HttpClient) {}

  /**
   * List a product's offers.
   *
   * Defaults to active offers only. Pass `active: 'all'` to include
   * deactivated ones, or `'false'` for only those.
   *
   * @example
   * const { data } = await garu.offers.list('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f');
   * for (const offer of data) {
   *   console.log(offer.name, offer.value, `?offer=${offer.slug ?? offer.id}`);
   * }
   */
  async list(productUuid: string, params: ListOffersParams = {}): Promise<OfferList> {
    const query: Record<string, string> = {};
    if (params.active !== undefined) query.active = String(params.active);
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);

    const qs = new URLSearchParams(query).toString();
    const url = `/api/v1/products/${encodeURIComponent(productUuid)}/offers${qs ? `?${qs}` : ''}`;

    return this.http.call<OfferList>((signal) =>
      (this.http.client.GET as Function)(url, { signal }).then(
        (r: { data?: OfferList; error?: unknown; response: Response }) => r
      )
    );
  }

  /**
   * Fetch one offer by id.
   *
   * @example
   * const offer = await garu.offers.get('offer_1Hv7j4EGexuTiOU5BlLNGGuL');
   */
  async get(offerId: string): Promise<Offer> {
    return this.http.call<Offer>((signal) =>
      (this.http.client.GET as Function)(`/api/v1/offers/${encodeURIComponent(offerId)}`, {
        signal
      }).then((r: { data?: Offer; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Create an offer on a product. Returns the created offer (HTTP 201).
   *
   * `value` is in REAIS (decimal BRL), the same unit as `product.value` — not
   * centavos. It must be at least R$ 5,00, the platform minimum price; a lower
   * value, `0` included, answers 400 (`GaruValidationError`). Unlike a
   * product, an offer cannot be left without a price. It may be higher than
   * the product's price: an offer works as a premium link just as well as a
   * discount.
   *
   * `slug` is optional and PUBLIC. Anyone holding the product link can guess
   * `?offer=promo` or `?offer=black-friday`. For pricing that should not
   * circulate, omit it — the link then carries the unguessable id instead.
   *
   * Answers 409 when the product has fixed-share co-producers the offer price
   * could not cover, and 400 on a subscription product.
   *
   * @example
   * const offer = await garu.offers.create('b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f', {
   *   name: 'Black Friday',
   *   value: 97.0, // R$ 97,00 in reais, NOT centavos. Minimum R$ 5,00.
   *   slug: 'black-friday'
   * });
   * // → https://garu.com.br/pay/b3f2c1e8-…?offer=black-friday
   */
  async create(productUuid: string, params: CreateOfferParams): Promise<Offer> {
    return this.http.call<Offer>((signal) =>
      (this.http.client.POST as Function)(
        `/api/v1/products/${encodeURIComponent(productUuid)}/offers`,
        { body: params, signal }
      ).then((r: { data?: Offer; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Update an offer (partial PATCH — only the fields you pass change).
   *
   * Repricing takes effect on the next sale. It does not rewrite history:
   * past transactions froze the amount they actually collected.
   *
   * A new `value` must be at least R$ 5,00, else 400. Omit `value` to keep the
   * current price: an offer priced below R$ 5,00 before the minimum existed
   * keeps selling, and deactivating or renaming it passes.
   *
   * @example
   * // End a promo without burning the slug
   * await garu.offers.update('offer_1Hv7j4EGexuTiOU5BlLNGGuL', { isActive: false });
   */
  async update(offerId: string, params: UpdateOfferParams): Promise<Offer> {
    return this.http.call<Offer>((signal) =>
      (this.http.client.PATCH as Function)(`/api/v1/offers/${encodeURIComponent(offerId)}`, {
        body: params,
        signal
      }).then((r: { data?: Offer; error?: unknown; response: Response }) => r)
    );
  }

  /**
   * Delete an offer. Works only while it has never sold — once a transaction
   * points at it the answer is 409, so past sales keep their attribution.
   * Deactivate it instead (`update(id, { isActive: false })`).
   *
   * @example
   * await garu.offers.del('offer_1Hv7j4EGexuTiOU5BlLNGGuL');
   */
  async del(offerId: string): Promise<void> {
    return this.http.call<void>((signal) =>
      (this.http.client.DELETE as Function)(`/api/v1/offers/${encodeURIComponent(offerId)}`, {
        signal
      }).then((r: { data?: void; error?: unknown; response: Response }) => r)
    );
  }
}
