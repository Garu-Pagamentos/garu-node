<div align="center">

# @garuhq/node

The official Node.js / TypeScript SDK for the [Garu](https://garu.com.br) payment gateway.

[![npm version](https://img.shields.io/npm/v/@garuhq/node.svg)](https://www.npmjs.com/package/@garuhq/node)
[![CI](https://img.shields.io/github/actions/workflow/status/Garu-Pagamentos/garu-node/release.yml?label=CI)](https://github.com/Garu-Pagamentos/garu-node/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

<p>
  <a href="#quickstart">Quickstart</a> · 
  <a href="#charges">Charges</a> · 
  <a href="#customers">Customers</a> · 
  <a href="#webhooks">Webhooks</a> · 
  <a href="#error-handling">Errors</a>
</p>

</div>

---

Brazilian payments (PIX, credit card, boleto) in a few lines of code.

- **Typed end-to-end** — wire types generated from the backend's OpenAPI spec; the SDK can never drift from the API.
- **Tiny footprint** — one runtime dependency ([`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/), ~4 KB). Native `fetch`, native `crypto`.
- **Safe to retry** — automatic idempotency keys on every mutation, exponential backoff with full jitter, honors `Retry-After`.
- **LLM-friendly** — every public method has JSDoc `@example` blocks for agent autocomplete.
- **ESM + CJS** dual build.

## Install

```bash
npm install @garuhq/node
# or
pnpm add @garuhq/node
# or
yarn add @garuhq/node
```

## Quickstart

```ts
import { Garu } from '@garuhq/node';

const garu = new Garu({ apiKey: process.env.GARU_API_KEY });

// Create a PIX charge
const charge = await garu.charges.create({
  productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
  paymentMethod: 'pix',
  customer: {
    name: 'Maria Silva',
    email: 'maria@exemplo.com.br',
    document: '12345678909', // CPF, digits only
    phone: '11987654321',
  },
});

console.log(charge.id, charge.status);
```

## Setup

Get your API key from the [Garu dashboard](https://garu.com.br/inicio) → **API Keys**.

```ts
const garu = new Garu({ apiKey: process.env.GARU_API_KEY });
```

> [!NOTE]
> Use `sk_test_…` for test mode and `sk_live_…` for production. Public endpoints like `meta.get` work without a key.

## Configuration

```ts
const garu = new Garu({
  apiKey: process.env.GARU_API_KEY,
  timeoutMs: 30_000, // default
  maxRetries: 2,     // default (3 total attempts)
});
```

## Charges

| Method                | Description                                  |
| --------------------- | -------------------------------------------- |
| `create(params)`      | Create a PIX, credit-card, or boleto charge. |
| `list(params?)`       | List charges with pagination and filters.    |
| `get(id)`             | Fetch a single charge by ID.                 |
| `refund(id, params?)` | Refund a charge fully or partially.          |

### Create a PIX charge

```ts
const charge = await garu.charges.create({
  productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
  paymentMethod: 'pix',
  customer: {
    name: 'Maria Silva',
    email: 'maria@exemplo.com.br',
    document: '12345678909',
    phone: '11987654321',
  },
});
```

### Create a credit card charge

```ts
const charge = await garu.charges.create({
  productId: 'b3f2c1e8-6e4a-4b9f-9d1c-2a1f6c3d4e5f',
  paymentMethod: 'credit_card',
  card: {
    number: '4111111111111111',
    holderName: 'MARIA SILVA',
    expirationMonth: '12',
    expirationYear: '2028',
    cvv: '123',
  },
  customer: {
    name: 'Maria Silva',
    email: 'maria@exemplo.com.br',
    document: '12345678909',
    phone: '11987654321',
  },
});
```

### List charges

```ts
const { data, meta } = await garu.charges.list({ limit: 10 });
```

### Refund a charge

```ts
await garu.charges.refund(4472, { amount: 1000 }); // partial refund (R$10.00)
```

> [!TIP]
> Every mutation automatically attaches an `X-Idempotency-Key` header (UUIDv4) unless you provide one via `params.idempotencyKey`. Safe to retry — the backend caches the first response for 24h.

## Customers

| Method                    | Description                                   |
| ------------------------- | --------------------------------------------- |
| `create(params)`          | Create a new customer.                        |
| `list(params?)`           | List customers with pagination and search.    |
| `get(id)`                 | Fetch a single customer by ID.                |
| `update(id, params)`      | Update a customer's profile.                  |
| `delete(id)`              | Delete a customer.                            |

```ts
const customer = await garu.customers.create({
  name: 'Maria Silva',
  email: 'maria@exemplo.com.br',
  document: '12345678909',
  phone: '11987654321',
  personType: 'fisica',
});

const { data, meta } = await garu.customers.list({ search: 'maria', limit: 10 });
```

## Products

Discover products and customize the per-product portal experience (B2B2C, v0.8.0).

| Method                              | Description                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| `list(params?)`                     | Paginated list of products for the seller.                        |
| `get(uuid)`                         | Fetch a single product by UUID — same id used by charges.         |
| `portalConfig.get(productId)`       | Read per-product portal customization. Returns `null` if unset.   |
| `portalConfig.set(productId, p)`    | Upsert with merge — only fields present are written.              |
| `portalConfig.patch(productId, p)`  | Same merge semantics as `set` — alias for HTTP-PATCH callers.     |
| `portalConfig.clear(productId)`     | Remove the customization; product falls back to seller config.    |

```ts
// SaaS de coaching: per-coach branding under one Seller account
await garu.products.portalConfig.set(57, {
  businessName: 'Coach Maria — Corrida & Trilha',
  primaryColor: '#257264',
  logoUrl: 'https://cdn.exemplo.com/coaches/maria.png',
});

// Pass `null` on a field to inherit from the seller-level config
await garu.products.portalConfig.patch(57, { primaryColor: null });
```

## Scheduled charges

Bill an existing customer on a future date — one-time or recurring with card tokenization. The Garu drives email reminders, dunning, retries, and the lifecycle state machine.

| Method                                        | Description                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `create(params)`                              | Create one-time or recurring schedule. Auto-attaches `X-Idempotency-Key`.  |
| `list(params?)`                               | Paginated list with status / type / dueFrom / dueTo / customerId filters.  |
| `get(id)`                                     | Detail bundle: charge + event timeline + linked transactions.              |
| `markPaid(id, params)`                        | Mark cycle paid (off-Garu reconciliation).                                 |
| `postpone(id, params)`                        | Move the next cycle's due date forward.                                    |
| `pause(id, params?)` / `resume(id)`           | Suspend / re-enable a series.                                              |
| `cancelRecurrence(id, params?)`               | Hard-stop future cycles (recurring only).                                  |
| `cancelAtPeriodEnd(id, { enabled })`          | Stripe-style soft-cancel; reversible.                                      |
| `changePaymentMethod(id, params)`             | Swap the saved card.                                                       |
| `clearPaymentMethod(id)`                      | Remove the saved card; future cycles email-with-link.                      |
| `listAttempts(id, params?)`                   | Per-attempt billing log — every silent-charge / retry / mark-paid (v0.8.2).|

```ts
// Recurring with 7-day trial
const series = await garu.scheduledCharges.create({
  customerId: 42,
  productId: 17,
  amount: 49.9,
  type: 'recurring',
  dueDate: '2026-06-01',
  methods: ['card', 'pix'],
  recurrence: { interval: 'monthly' },
  trialDays: 7,
});

// Audit why cycle 3 failed (v0.8.2)
const { data } = await garu.scheduledCharges.listAttempts(series.id, {
  cycleNumber: 3,
});
const declines = data.filter((a) => a.status === 'declined');
// → each declines[i].failureCode is one of GaruFailureCode (insufficient_funds,
//   card_expired, card_declined, ...)
```

## Failure codes (v0.8.0)

Every `transaction.payment.failed`, `scheduled_charge.cycle_failed`, and `listAttempts()` row carries:

- `failureCode` — canonical `GaruFailureCode` enum (10 values, gateway-independent)
- `failureReason` — human-readable PT-BR
- `gatewayFailureCode` — raw code from Celcoin (ABECS for forensics)

```ts
import type { GaruFailureCode } from '@garuhq/node';

const PERMANENT: GaruFailureCode[] = ['card_expired', 'card_canceled', 'fraud_suspected'];
function shouldAskForNewCard(code: GaruFailureCode): boolean {
  return PERMANENT.includes(code);
}
```

Full table at [docs.garu.com.br/api-reference/webhooks/codigos-de-falha](https://docs.garu.com.br/api-reference/webhooks/codigos-de-falha).

## Meta

Discover available payment methods and webhook events. No authentication required.

```ts
const meta = await garu.meta.get();
console.log(meta.version, meta.payment_methods, meta.webhook_events);
```

## Webhooks

Verify incoming webhooks with HMAC-SHA256 and constant-time comparison.

```ts
import express from 'express';
import { Garu, GaruSignatureVerificationError } from '@garuhq/node';

const app = express();

app.post('/webhooks/garu', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const { event } = Garu.webhooks.verify({
      payload: req.body, // raw Buffer — do NOT re-serialize parsed JSON
      signature: req.header('x-garu-signature') ?? '',
      secret: process.env.GARU_WEBHOOK_SECRET!,
    });

    console.log('Received', event);
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof GaruSignatureVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

> [!IMPORTANT]
> Always pass the raw request body to `verify()`. Parsing and re-serializing JSON will break the signature check.

## Error handling

Every error extends `GaruError`. API errors include `status`, `requestId`, and `body`.

```ts
import {
  GaruAPIError,
  GaruNotFoundError,
  GaruRateLimitError,
  GaruValidationError,
} from '@garuhq/node';

try {
  await garu.charges.refund(4472, { amount: 1000 });
} catch (err) {
  if (err instanceof GaruNotFoundError) {
    /* 404 */
  }
  if (err instanceof GaruValidationError) {
    /* 400 / 422 */
  }
  if (err instanceof GaruRateLimitError) {
    console.log('Retry in', err.retryAfterSec, 'seconds');
  }
  if (err instanceof GaruAPIError) {
    console.log(err.status, err.requestId, err.body);
  }
}
```

| Error class                         | HTTP status        |
| ----------------------------------- | ------------------ |
| `GaruAuthenticationError`           | `401`              |
| `GaruPermissionError`               | `403`              |
| `GaruNotFoundError`                 | `404`              |
| `GaruValidationError`               | `400` / `422`      |
| `GaruRateLimitError`                | `429`              |
| `GaruServerError`                   | `5xx`              |
| `GaruConnectionError`               | Network failure    |
| `GaruSignatureVerificationError`    | Webhook mismatch   |

## Retries

The SDK retries automatically on connection errors, `408`, `429`, and `5xx` responses. Exponential backoff with full jitter. Honors `Retry-After`. Never retries `4xx` validation errors.

## TypeScript

Ships with full `.d.ts` and strict types. All public types are re-exported from the root:

```ts
import type {
  Charge,
  ChargeStatus,
  CreateChargeParams,
  Customer,
  CardInfo,
  PaymentMethod,
  MetaResponse,
} from '@garuhq/node';
```

## Security

To report a vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

MIT — see [LICENSE](LICENSE) for details.
