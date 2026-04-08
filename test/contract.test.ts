import { describe, expect, it } from 'vitest';

import spec from '../src/generated/openapi.json' with { type: 'json' };

/**
 * Contract tests.
 *
 * The generated `src/generated/schema.d.ts` is only as accurate as the
 * `src/generated/openapi.json` snapshot it was produced from. These tests
 * assert that every endpoint the SDK depends on is present in the snapshot,
 * and that its request/response schemas haven't drifted in a way that would
 * break the ergonomic wrappers.
 *
 * To refresh against live prod:
 *   npm run generate
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
});
