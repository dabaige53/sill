import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNNER = join(ROOT, 'server', 'wasm-runner.py');
export const WASM_ABI = 'qg-json-v1';
export const WASM_VERSION = '49.0.0';
// Deployment-independent hard ceilings. Callers may only lower these values.
export const WASM_LIMITS = Object.freeze({fuel: 1_000_000, memoryBytes: 16 * 1024 * 1024,
  inputBytes: 16 * 1024, outputBytes: 32 * 1024, moduleBytes: 256 * 1024,
  jsonDepth: 32, wallMs: 2000, processMemoryBytes: 512 * 1024 * 1024});
const PROCESS_OUTPUT_LIMIT = 64 * 1024;

export class WasmRuntimeError extends Error {
  constructor(code, message) { super(message); this.name = 'WasmRuntimeError'; this.code = code; }
}
const fail = (code, message) => { throw new WasmRuntimeError(code, message); };

function validateLimits(supplied = {}) {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) fail('INVALID_LIMIT', 'Invalid runtime limits');
  const limits = {...WASM_LIMITS};
  for (const [key, value] of Object.entries(supplied)) {
    if (!Object.hasOwn(WASM_LIMITS, key) || !Number.isSafeInteger(value) || value <= 0 || value > WASM_LIMITS[key]) {
      fail('INVALID_LIMIT', 'Limits can only be lowered within hard ceilings');
    }
    limits[key] = value;
  }
  return limits;
}

export function canonicalWasmJSON(value, {maxBytes = WASM_LIMITS.inputBytes, maxDepth = WASM_LIMITS.jsonDepth} = {}) {
  const seen = new Set();
  function visit(item, depth) {
    if (depth > maxDepth) fail('INVALID_JSON', 'JSON nesting limit exceeded');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item))) fail('INVALID_JSON', 'JSON numbers must be finite and integers exactly representable');
      return Object.is(item, -0) ? 0 : item;
    }
    if (typeof item === 'string') {
      if (!item.isWellFormed()) fail('INVALID_JSON', 'JSON strings must contain valid Unicode');
      return item;
    }
    if (!item || typeof item !== 'object' || (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null && !Array.isArray(item))) fail('INVALID_JSON', 'Expected plain JSON values');
    if (seen.has(item)) fail('INVALID_JSON', 'Cyclic input is not JSON');
    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || Object.keys(item).length !== item.length) fail('INVALID_JSON', 'Sparse, decorated or subclassed arrays are not JSON');
      result = [];
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !('value' in descriptor)) fail('INVALID_JSON', 'JSON accessors are not supported');
        result.push(visit(descriptor.value, depth + 1));
      }
    } else {
      result = Object.create(null);
      for (const key of Object.keys(item).sort()) {
        visit(key, depth + 1);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor)) fail('INVALID_JSON', 'JSON accessors are not supported');
        result[key] = visit(descriptor.value, depth + 1);
      }
    }
    seen.delete(item);
    return result;
  }
  const text = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(text, 'utf8') > maxBytes) fail('INPUT_LIMIT', 'JSON byte limit exceeded');
  return text;
}

function moduleEncoding(moduleBytes, limits) {
  if (!(moduleBytes instanceof Uint8Array)) fail('INVALID_MODULE', 'A bounded Wasm binary is required');
  if (moduleBytes.byteLength > limits.moduleBytes) fail('INVALID_MODULE', 'Wasm module byte limit exceeded');
  return Buffer.from(moduleBytes).toString('base64');
}

async function invoke(operation, payload, options = {}) {
  const limits = validateLimits(options.limits);
  const signal = options.signal ?? options.abortSignal;
  if (options.onSpawn !== undefined && typeof options.onSpawn !== 'function') fail('INVALID_REQUEST', 'The trusted spawn observer must be synchronous');
  if (signal?.aborted) fail('CANCELLED', 'Wasm execution cancelled');
  if (process.platform !== 'linux' || process.arch !== 'x64') fail('RUNTIME_UNAVAILABLE', 'Wasm runtime requires Linux x86_64 hard resource limits');
  const python = options.pythonPath ?? join(ROOT, '.sandbox-venv', 'bin', 'python');
  if (typeof python !== 'string' || !isAbsolute(python)) fail('RUNTIME_UNAVAILABLE', 'A trusted absolute Python interpreter path is required');
  const cwd = await mkdtemp(join(tmpdir(), 'quiet-glass-wasm-'));
  try {
    return await new Promise((resolve, reject) => {
      let child, timer, terminalError, outputSize = 0;
      const stdout = [];
      const started = performance.now();
      function kill(code, message) {
        if (!terminalError) terminalError = new WasmRuntimeError(code, message);
        if (child?.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
        }
      }
      const aborted = () => kill('CANCELLED', 'Wasm execution cancelled');
      try {
        child = spawn(python, ['-I', '-B', '-u', RUNNER, '--parent-pid', String(process.pid)], {cwd, env: {PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', HOME: cwd, TMPDIR: cwd},
          stdio: ['pipe', 'pipe', 'pipe'], detached: true, windowsHide: true});
      } catch {
        reject(new WasmRuntimeError('RUNTIME_UNAVAILABLE', 'Wasm interpreter could not be started'));
        return;
      }
      timer = setTimeout(() => kill('TIMEOUT', 'Wasm wall-time limit exceeded'), limits.wallMs);
      signal?.addEventListener('abort', aborted, {once: true});
      if (signal?.aborted) aborted();
      child.on('error', () => { terminalError ??= new WasmRuntimeError('RUNTIME_UNAVAILABLE', 'Install the pinned Wasmtime runtime in .sandbox-venv or configure a trusted Python path'); });
      child.stdin.on('error', () => {}); // Early process death is handled at close.
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        outputSize += chunk.length;
        if (outputSize > PROCESS_OUTPUT_LIMIT) kill('OUTPUT_LIMIT', 'Runner process output limit exceeded');
        else if (stream === child.stdout) stdout.push(chunk);
      });
      child.on('close', (code, exitSignal) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', aborted);
        if (terminalError) { reject(terminalError); return; }
        if (exitSignal || code !== 0) { reject(new WasmRuntimeError('PROCESS_LIMIT', 'Wasm runner terminated or exceeded a process limit')); return; }
        let envelope;
        try { envelope = JSON.parse(Buffer.concat(stdout).toString('utf8')); }
        catch { reject(new WasmRuntimeError('INVALID_PROTOCOL', 'Wasm runner returned an invalid bounded response')); return; }
        if (!envelope || envelope.ok !== true) {
          reject(new WasmRuntimeError(typeof envelope?.error?.code === 'string' ? envelope.error.code : 'INVALID_PROTOCOL', typeof envelope?.error?.message === 'string' ? envelope.error.message : 'Wasm runner failed closed'));
          return;
        }
        const result = envelope.result;
        if (result?.runtime !== 'wasmtime-py' || result.version !== WASM_VERSION || result.abi !== WASM_ABI) { reject(new WasmRuntimeError('INVALID_PROTOCOL', 'Unexpected Wasm runtime identity')); return; }
        if (operation === 'run') result.metrics = {...result.metrics, durationMs: Math.round(performance.now() - started)};
        resolve(result);
      });
      // Internal supervisor hook only, never accepted from public script input.
      // Record the real PID synchronously before dispatching any guest request.
      if (child.pid && options.onSpawn) {
        try {
          const observed = options.onSpawn({pid: child.pid});
          if (observed && typeof observed.then === 'function') {
            observed.catch?.(() => {});
            kill('SPAWN_OBSERVER_FAILED', 'Wasm process identity could not be recorded synchronously');
          }
        } catch { kill('SPAWN_OBSERVER_FAILED', 'Wasm process identity could not be recorded'); }
      }
      if (!terminalError) child.stdin.end(JSON.stringify({operation, ...payload, limits}));
      else child.stdin.destroy();
    });
  } finally {
    // Only after the process close event: all pipes and its process group are gone.
    await rm(cwd, {recursive: true, force: true});
  }
}

export async function probeWasmRuntime(options = {}) {
  try { return {available: true, ...(await invoke('probe', {}, options))}; }
  catch (error) { return {available: false, runtime: 'wasmtime-py', version: WASM_VERSION, abi: WASM_ABI, limits: WASM_LIMITS,
    reason: error.code ?? 'RUNTIME_UNAVAILABLE', message: error.message}; }
}
export async function inspectWasmModule(moduleBytes, options = {}) {
  const limits = validateLimits(options.limits);
  return invoke('inspect', {module: moduleEncoding(moduleBytes, limits)}, options);
}
export async function runWasmModule(moduleBytes, input, options = {}) {
  const limits = validateLimits(options.limits);
  const text = canonicalWasmJSON(input, {maxBytes: limits.inputBytes, maxDepth: limits.jsonDepth});
  return invoke('run', {module: moduleEncoding(moduleBytes, limits), input: text}, options);
}
