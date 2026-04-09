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
