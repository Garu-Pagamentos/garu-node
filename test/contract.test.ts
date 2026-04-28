import { describe, expect, it } from 'vitest';

import spec from '../src/generated/openapi-sdk.json' with { type: 'json' };

/**
 * Contract tests.
 *
 * Runs against `src/generated/openapi-sdk.json` — the filtered, committed
 * snapshot that powers both these tests and `schema.d.ts`. The raw
 * `openapi.json` from the backend is gitignored (and may include internal
 * endpoints we don't want in the repo); the filtered file is the
 * SDK-and-tests source of truth.
 *
 * To refresh against live prod:
 *   npm run generate         (fetch + filter + regenerate types)
 *
 * Then commit any diffs to `openapi-sdk.json` and `schema.d.ts`.
 *
 * If these tests fail after a `npm run generate`, the backend OpenAPI spec
 * has moved. Update the wrappers in `src/resources/` accordingly.
 */

type OpenApiSpec = {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

const typedSpec = spec as OpenApiSpec;

describe('OpenAPI contract', () => {
  it('has POST /api/transactions', () => {
    expect(typedSpec.paths['/api/transactions']).toBeDefined();
    expect(typedSpec.paths['/api/transactions']?.post).toBeDefined();
  });

  it('has GET /api/transactions/{id}', () => {
    expect(typedSpec.paths['/api/transactions/{id}']).toBeDefined();
    expect(typedSpec.paths['/api/transactions/{id}']?.get).toBeDefined();
  });

  it('has POST /api/transactions/{id}/refund', () => {
    expect(typedSpec.paths['/api/transactions/{id}/refund']).toBeDefined();
    expect(typedSpec.paths['/api/transactions/{id}/refund']?.post).toBeDefined();
  });

  it('has GET /api/meta', () => {
    expect(typedSpec.paths['/api/meta']).toBeDefined();
    expect(typedSpec.paths['/api/meta']?.get).toBeDefined();
  });

  it('CreateTransactionRequest keeps the SDK-relied-on fields', () => {
    const schema = typedSpec.components.schemas.CreateTransactionRequest;
    expect(schema?.properties).toBeDefined();
    const props = schema!.properties!;
    expect(props.customer).toBeDefined();
    expect(props.productId).toBeDefined();
    expect(props.paymentMethodId).toBeDefined();
    // The capital-C is a historical quirk the SDK maps internally.
    expect(props.CardInfo).toBeDefined();
  });

  it('MetaResponse keeps the agent-facing fields', () => {
    const schema = typedSpec.components.schemas.MetaResponse;
    expect(schema?.properties).toBeDefined();
    const props = schema!.properties!;
    for (const key of [
      'name',
      'version',
      'environment',
      'api_version',
      'payment_methods',
      'currencies',
      'billing_intervals',
      'webhook_events',
      'features',
      'docs_url',
      'dashboard_url',
      'support_email'
    ]) {
      expect(props[key], `MetaResponse.${key}`).toBeDefined();
    }
  });

  it('CustomerDto keeps the required customer fields', () => {
    const schema = typedSpec.components.schemas.CustomerDto;
    expect(schema?.properties).toBeDefined();
    const props = schema!.properties!;
    for (const key of ['name', 'email', 'document', 'phone']) {
      expect(props[key], `CustomerDto.${key}`).toBeDefined();
    }
  });

  it('has GET /api/products/seller (used by products.list)', () => {
    expect(typedSpec.paths['/api/products/seller']).toBeDefined();
    expect(typedSpec.paths['/api/products/seller']?.get).toBeDefined();
  });

  it('has GET /api/products/uuid/{uuid} (used by products.get)', () => {
    expect(typedSpec.paths['/api/products/uuid/{uuid}']).toBeDefined();
    expect(typedSpec.paths['/api/products/uuid/{uuid}']?.get).toBeDefined();
  });

  it('ProductResponse keeps the agent-facing fields', () => {
    const schema = typedSpec.components.schemas.ProductResponse;
    expect(schema?.properties).toBeDefined();
    const props = schema!.properties!;
    for (const key of ['id', 'uuid', 'name', 'value', 'pix', 'boleto', 'creditCard']) {
      expect(props[key], `ProductResponse.${key}`).toBeDefined();
    }
  });
});
