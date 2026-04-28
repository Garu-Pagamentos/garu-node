#!/usr/bin/env node

/**
 * Strips internal/admin endpoints and unreferenced schemas from the
 * full OpenAPI spec so only SDK-relevant types are generated.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = resolve(__dirname, '../src/generated/openapi.json');
const OUTPUT = resolve(__dirname, '../src/generated/openapi-sdk.json');

/** Path prefixes the SDK actually uses. */
const SDK_PATHS = [
  '/api/transactions',
  '/api/customers',
  '/api/products',
  '/api/meta',
  '/api/webhook-endpoints',
];

function pathMatchesSDK(path) {
  return SDK_PATHS.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '/{'));
}

/** Recursively collect all $ref schema names from an object. */
function collectRefs(obj, refs = new Set()) {
  if (!obj || typeof obj !== 'object') return refs;
  if (obj.$ref && typeof obj.$ref === 'string') {
    const match = obj.$ref.match(/#\/components\/schemas\/(.+)/);
    if (match) refs.add(match[1]);
  }
  for (const val of Object.values(obj)) {
    collectRefs(val, refs);
  }
  return refs;
}

/** Expand refs transitively — schemas can reference other schemas. */
function expandRefs(schemas, directRefs) {
  const all = new Set(directRefs);
  const queue = [...directRefs];
  while (queue.length) {
    const name = queue.pop();
    const schema = schemas[name];
    if (!schema) continue;
    const nested = collectRefs(schema);
    for (const ref of nested) {
      if (!all.has(ref)) {
        all.add(ref);
        queue.push(ref);
      }
    }
  }
  return all;
}

const spec = JSON.parse(readFileSync(INPUT, 'utf8'));

// 1. Keep only SDK-relevant paths
const filteredPaths = {};
for (const [path, methods] of Object.entries(spec.paths)) {
  if (!pathMatchesSDK(path)) continue;
  const cleaned = {};
  for (const [method, operation] of Object.entries(methods)) {
    if (typeof operation !== 'object' || operation === null) {
      cleaned[method] = operation;
      continue;
    }
    // Strip operationId (leaks controller names)
    const { operationId, ...rest } = operation;
    cleaned[method] = rest;
  }
  filteredPaths[path] = cleaned;
}

// 2. Find all schemas referenced by kept paths
const directRefs = collectRefs(filteredPaths);
const allRefs = expandRefs(spec.components?.schemas || {}, directRefs);

// 3. Keep only referenced schemas
const filteredSchemas = {};
for (const name of allRefs) {
  if (spec.components?.schemas?.[name]) {
    filteredSchemas[name] = spec.components.schemas[name];
  }
}

// 4. Build sanitized spec
const output = {
  openapi: spec.openapi,
  info: {
    title: spec.info?.title || 'Garu API',
    version: spec.info?.version || '1.0.0',
  },
  paths: filteredPaths,
  components: {
    securitySchemes: spec.components?.securitySchemes,
    schemas: filteredSchemas,
  },
};

writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

const originalPaths = Object.keys(spec.paths).length;
const originalSchemas = Object.keys(spec.components?.schemas || {}).length;
const keptPaths = Object.keys(filteredPaths).length;
const keptSchemas = Object.keys(filteredSchemas).length;

console.log(
  `Filtered spec: ${keptPaths}/${originalPaths} paths, ${keptSchemas}/${originalSchemas} schemas → ${OUTPUT}`,
);
