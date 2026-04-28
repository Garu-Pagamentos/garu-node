# Changelog

All notable changes to `@garuhq/node` are documented in this file. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [0.3.0] — 2026-04-28

### Added

- `products` resource on the `Garu` client.
  - `products.list({ page, limit, search, tab })` — paginated listing of the
    authenticated seller's products (`GET /api/products/seller`).
  - `products.get(uuid)` — fetch a single product by UUID
    (`GET /api/products/uuid/{uuid}`). The UUID is the same identifier
    accepted by `charges.create({ productId })`, so `products.list` is
    the discovery path before creating a charge.
- `Product`, `ProductList`, `ListProductsParams` types exported from the
  package root.

## [0.1.1] — 2026-04-08

### Security

- Upgrade dev dependencies to clear `npm audit` findings:
  - `vitest` 1.5.0 → 4.1.3 (closes critical GHSA — vitest RCE in dev server)
  - `tsup` 8.0.2 → 8.5.1 (closes moderate DOM clobbering advisory)
- All upgrades are dev-only; no runtime-code changes in `@garuhq/node` itself.

## [0.1.0] — 2026-04-08

### Added

- Initial public beta. Reference Node.js / TypeScript SDK for the Garu payment gateway.
- `Garu` client class with `apiKey`, `baseUrl`, `timeoutMs`, `maxRetries` options.
- `charges.create` — PIX, credit card, and boleto charges. Auto-generates `X-Idempotency-Key`
  (UUIDv4) unless the caller supplies one; safe to retry against the Chunk 2 backend cache.
- `charges.get` / `charges.list` / `charges.refund`.
- `meta.get` — capability introspection via `GET /api/meta`.
- `webhooks.verify` — HMAC-SHA256 signature verification, constant-time comparison,
  configurable tolerance window (default 300s). Matches backend `X-Garu-Signature` format
  `t=<ts>,v1=<hex>`.
- Typed error hierarchy: `GaruAuthenticationError`, `GaruPermissionError`, `GaruNotFoundError`,
  `GaruValidationError`, `GaruRateLimitError`, `GaruServerError`, `GaruConnectionError`,
  `GaruSignatureVerificationError`. Every error has a stable `code` string.
- Automatic retries with exponential backoff + full jitter on 408/429/5xx and connection
  errors. Honors `Retry-After`. Never retries 4xx validation errors.
- One runtime dependency (`openapi-fetch`). Node.js ≥ 18 (native `fetch`, `crypto.randomUUID`).
- Dual ESM + CJS build via `tsup` with full `.d.ts`.
- Wire types generated from the live backend OpenAPI spec via `openapi-typescript` —
  `npm run generate` refreshes `src/generated/{openapi.json, schema.d.ts}`.
- Contract tests assert the generated snapshot still covers every endpoint the SDK uses.
- GitHub Actions CI runs typecheck, tests, and build on Node 18 / 20 / 22.

### Known limitations

- Only `charges` and `meta` namespaces. Customers, products, subscriptions, checkout
  sessions, and webhook-endpoint management land in a future release.
- `charges.list` is intentionally omitted — the backend does not yet expose
  `GET /api/transactions`. It will land when the backend grows a seller-scoped list endpoint.
