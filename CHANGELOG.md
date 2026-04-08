# Changelog

All notable changes to `@garuhq/node` are documented in this file. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

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
