import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WASM_ABI, WASM_LIMITS, WasmRuntimeError, canonicalWasmJSON, runWasmModule} from './wasm-runtime.mjs';

const VERSION = '1.0.0';
const entries = [
  {id: 'integer-stats', name: 'Integer statistics', description: 'Count, sum, minimum and maximum for up to 1,000 bounded integers.',
    sha256: 'a2fcc0d46e7cadcf8bb543a64aaa2d7d1e77a198e8ba96a5db27f75177d93c59',
    inputSchema: {type: 'object', additionalProperties: false, required: ['values'], properties: {values: {type: 'array', maxItems: 1000, items: {type: 'integer', minimum: -1000000, maximum: 1000000}}}},
    outputSchema: {type: 'object', additionalProperties: false, required: ['count', 'sum', 'min', 'max'], properties: {count: {type: 'integer'}, sum: {type: 'integer'}, min: {type: ['integer', 'null']}, max: {type: ['integer', 'null']}}}},
  {id: 'bounded-echo', name: 'Bounded JSON echo', description: 'Return a text value unchanged through a capability-free Wasm guest.',
    sha256: 'd080b3e29fa40c6169f86d0c6c20f666d9e298129734c4c43f5e03c0d4a2c45a',
    inputSchema: {type: 'object', additionalProperties: false, required: ['text'], properties: {text: {type: 'string', maxLength: 1024}}},
    outputSchema: {type: 'object', additionalProperties: false, required: ['text'], properties: {text: {type: 'string', maxLength: 1024}}}},
].map(entry => ({...entry, version: VERSION, abi: WASM_ABI, limits: {...WASM_LIMITS}}));
const registry = new Map(entries.map(entry => [entry.id, entry]));
const reject = (code, message) => { throw new WasmRuntimeError(code, message); };

export function listBundledWasm() { return structuredClone(entries); }
export function getBundledWasm(id, version = VERSION) {
  const entry = typeof id === 'string' ? registry.get(id) : undefined;
  if (!entry) reject('UNKNOWN_SCRIPT', 'The script is not in the fixed bundled registry');
  if (version !== entry.version) reject('VERSION_MISMATCH', 'The exact bundled script version is required');
  return structuredClone(entry);
}
export function validateBundledWasmInput(id, input, version = VERSION) {
  getBundledWasm(id, version);
  // Validate plain JSON before reading fields, including getters, Unicode and depth.
  const plain = JSON.parse(canonicalWasmJSON(input));
  if (!plain || Array.isArray(plain) || typeof plain !== 'object') reject('INVALID_INPUT', 'Script input must be an object');
  if (id === 'integer-stats') {
    if (Object.keys(plain).length !== 1 || !Object.hasOwn(plain, 'values') || !Array.isArray(plain.values) || plain.values.length > 1000 || plain.values.some(value => !Number.isInteger(value) || Math.abs(value) > 1000000)) {
      reject('INVALID_INPUT', 'Expected only values: up to 1,000 integers between -1,000,000 and 1,000,000');
    }
  } else if (Object.keys(plain).length !== 1 || !Object.hasOwn(plain, 'text') || typeof plain.text !== 'string' || plain.text.length > 1024) {
    reject('INVALID_INPUT', 'Expected only text: a string of at most 1,024 UTF-16 code units');
  }
  return plain;
}
function artifact(entry) {
  // Path comes only from the fixed registry, never an API argument or input field.
  let binary;
  try {
    const encoded = readFileSync(new URL(`../scripts/wasm/${entry.id}.wasm.b64`, import.meta.url), 'utf8').trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > WASM_LIMITS.moduleBytes * 2) throw new Error();
    binary = Buffer.from(encoded, 'base64');
  } catch { reject('ARTIFACT_UNAVAILABLE', 'Bundled Wasm artifact is unavailable'); }
  if (createHash('sha256').update(binary).digest('hex') !== entry.sha256) reject('ARTIFACT_INTEGRITY', 'Bundled Wasm artifact hash does not match its fixed version');
  return binary;
}
export async function runBundledWasm(id, input, options = {}) {
  const entry = getBundledWasm(id, options.version ?? VERSION);
  const validated = validateBundledWasmInput(id, input, entry.version);
  const result = await runWasmModule(artifact(entry), validated, options);
  if (result.sha256 !== entry.sha256) reject('ARTIFACT_INTEGRITY', 'Runner artifact identity did not match');
  // Bind outputs to each deliberately small fixture's contract as defense in depth.
  const output = result.output;
  if (id === 'bounded-echo') {
    if (!output || Object.keys(output).length !== 1 || output.text !== validated.text) reject('INVALID_OUTPUT', 'Echo output violated its schema');
  } else {
    const values = validated.values;
    const expected = {count: values.length, sum: values.reduce((sum, value) => sum + value, 0), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null};
    if (canonicalWasmJSON(output) !== canonicalWasmJSON(expected)) reject('INVALID_OUTPUT', 'Statistics output violated its schema');
  }
  return result;
}
