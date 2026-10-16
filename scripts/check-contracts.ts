import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const read = (name: string) => JSON.parse(readFileSync(new URL('../contracts/design/' + name, import.meta.url), 'utf8'));
const spec = read('openapi.json');
const catalog = read('mcp-tools.json');
const fixtures = read('fixtures.json');
const validator = new Ajv2020({ strict: false });
addFormats(validator);
export const normalizeRefs = (value: unknown): any => Array.isArray(value) ? value.map(normalizeRefs) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === '$ref' ? String(entry).replace('#/components/schemas/', '#/$defs/') : normalizeRefs(entry)])) : value;
export function validateDesign(schemaName: string, value: unknown) {
  const schema = { $ref: '#/$defs/' + schemaName, $defs: normalizeRefs(spec.components.schemas) };
  const check = validator.compile(schema);
  assert.ok(check(value), JSON.stringify(check.errors));
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  if (process.argv[2] === 'sample') {
    const sample = fixtures.cases.find((entry: any) => entry.name === process.argv[3]);
    assert.ok(sample, 'unknown_sample');
    console.log(JSON.stringify(sample, null, 2));
  } else {
    const operations = new Map<string, any>();
    for (const [path, methods] of Object.entries<any>(spec.paths)) for (const [method, operation] of Object.entries<any>(methods)) {
      if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
      assert.ok(!operations.has(operation.operationId));
      operations.set(operation.operationId, { path, method, operation });
      if (method !== 'get') assert.ok(operation.parameters.some((parameter: any) => parameter.name === 'Idempotency-Key' && parameter.required));
    }
    assert.equal(catalog.tools.length, 7);
    for (const tool of catalog.tools) {
      const route = operations.get(tool['x-operationId']);
      assert.ok(route);
      assert.equal(tool['x-required-scope'], route.operation['x-required-scope']);
      validator.compile(tool.inputSchema);
      validator.compile(tool.outputSchema);
    }
    for (const sample of fixtures.cases) {
      const tool = catalog.tools.find((entry: any) => entry['x-operationId'] === sample.operationId);
      const check = validator.compile(tool.inputSchema);
      assert.ok(check(sample.arguments), JSON.stringify(check.errors));
      const responseCheck = validator.compile(sample.status < 300 ? tool.outputSchema : { $ref: '#/$defs/Error', $defs: normalizeRefs(spec.components.schemas) });
      assert.ok(responseCheck(sample.response), JSON.stringify(responseCheck.errors));
    }
    console.log(`PASS: ${operations.size} HTTP designs, 7 MCP mappings, ${fixtures.cases.length} synthetic responses`);
  }
}
