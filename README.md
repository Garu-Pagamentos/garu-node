# @garuhq/node

Official Node.js / TypeScript SDK for the [Garu](https://garu.com.br) payment gateway.

- **Typed end-to-end** — wire types are generated from the backend's OpenAPI spec, so the
  SDK can never drift from the API. Run `npm run generate` to refresh.
- **LLM-optimized** — every public method has a JSDoc `@example` so agents can autocomplete a
  working call from partial input.
- **Tiny footprint** — one runtime dependency ([`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/),
  ~4 KB). Node.js ≥ 18, native `fetch`, native `crypto`.
- **Safe to retry** — automatic idempotency keys on every mutation, exponential backoff with
  full jitter, honors `Retry-After`.
- **ESM + CJS** dual build.

## Install

```bash
npm install @garuhq/node
# or
pnpm add @garuhq/node
# or
yarn add @garuhq/node
```

## 60-second quickstart

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
    phone: '11987654321'
  }
});

console.log(charge.id, charge.status);
```

## Authentication

Get your API key from the [Garu dashboard](https://garu.com.br/inicio) → **API Keys**. Use
`sk_test_…` for test mode and `sk_live_…` for production.

```ts
const garu = new Garu({ apiKey: process.env.GARU_API_KEY });
```

Public endpoints (`meta.get`, public checkout-style `charges.create`) also work without an
API key.

## Surface

### `garu.charges`

| Method                | What it does                                 |
| --------------------- | -------------------------------------------- |
| `create(params)`      | Create a PIX, credit-card, or boleto charge. |
| `list(params?)`       | List charges with pagination and filters.    |
| `get(id)`             | Fetch a single charge by ID.                 |
| `refund(id, params?)` | Refund a charge fully or partially.          |

Every mutation automatically attaches an `X-Idempotency-Key` header (UUIDv4) unless you pass
one via `params.idempotencyKey`. Safe to retry — the backend caches the first response for
24h.

### `garu.customers`

| Method                    | What it does                                  |
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
  personType: 'fisica'
});

const { data, meta } = await garu.customers.list({ search: 'maria', limit: 10 });
```

### `garu.meta`

```ts
const meta = await garu.meta.get();
console.log(meta.version, meta.payment_methods, meta.webhook_events);
```

Unauthenticated. Use this to discover which payment methods and webhook events are
currently supported.

### `Garu.webhooks.verify`

Verify an incoming webhook before trusting its body. Uses HMAC-SHA256 with constant-time
comparison.

```ts
import express from 'express';
import { Garu, GaruSignatureVerificationError } from '@garuhq/node';

const app = express();

app.post('/webhooks/garu', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const { event } = Garu.webhooks.verify({
      payload: req.body, // raw Buffer — do NOT re-serialize parsed JSON
      signature: req.header('x-garu-signature') ?? '',
      secret: process.env.GARU_WEBHOOK_SECRET!
    });

    // handle event
    console.log('Received', event);
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof GaruSignatureVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

## Errors

Every error extends `GaruError` and has a stable `code`:

```ts
import {
  GaruAPIError,
  GaruNotFoundError,
  GaruRateLimitError,
  GaruValidationError
} from '@garuhq/node';

try {
  await garu.charges.refund(4472, { amount: 1000 });
} catch (err) {
  if (err instanceof GaruNotFoundError) {
    /* 404 */
  }
  if (err instanceof GaruValidationError) {
    /* 400/422 */
  }
  if (err instanceof GaruRateLimitError) {
    console.log('Retry in', err.retryAfterSec, 'seconds');
  }
  if (err instanceof GaruAPIError) {
    console.log(err.status, err.requestId, err.body);
  }
}
```

## Retries

The SDK retries idempotent requests automatically on connection errors, `408`, `429`, and
`5xx` responses. Exponential backoff with full jitter. Honors `Retry-After`. Never retries
`4xx` validation errors.

```ts
const garu = new Garu({
  apiKey: process.env.GARU_API_KEY,
  timeoutMs: 30_000, // default
  maxRetries: 2 // default (so 3 total attempts)
});
```

## TypeScript

Ships with full `.d.ts` and strict types. All public types are exported from the root:

```ts
import type {
  Charge,
  ChargeStatus,
  CreateChargeParams,
  Customer,
  CardInfo,
  PaymentMethod,
  MetaResponse
} from '@garuhq/node';
```

## Security

To report a vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md) for
responsible disclosure instructions.

## License

MIT.
