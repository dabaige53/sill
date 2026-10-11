import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readlinkSync} from 'node:fs';
import {readFile, readdir, readlink, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WASM_LIMITS, WASM_ABI, canonicalWasmJSON, inspectWasmModule, runWasmModule, probeWasmRuntime} from '../server/wasm-runtime.mjs';
import {listBundledWasm, getBundledWasm, validateBundledWasmInput, runBundledWasm} from '../server/wasm-registry.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PYTHON = join(ROOT, '.sandbox-venv/bin/python');
const availability = await probeWasmRuntime({pythonPath: PYTHON});
const real = {skip: !availability.available ? `Pinned Linux runtime unavailable: ${availability.reason}` : false};
function wat(source) {
  const result = spawnSync(PYTHON, ['-I', '-B', '-c', 'import sys,wasmtime; sys.stdout.buffer.write(wasmtime.wat2wasm(sys.stdin.read()))'], {input: source, maxBuffer: 1024 * 1024, timeout: 5000});
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
function moduleWith(body = 'i64.const 4', {data = 'null', memory = '1 1', alloc = 'i32.const 4096', extra = ''} = {}) {
  const escaped = Buffer.from(data).toString('hex').match(/../g)?.map(v => `\\${v}`).join('') ?? '';
  return wat(`(module ${extra} (memory (export "memory") ${memory}) (data (i32.const 0) "${escaped}")
    (func (export "qg_alloc") (param i32) (result i32) ${alloc})
    (func (export "qg_run") (param i32 i32) (result i64) ${body}))`);
}
const codeIs = code => error => { assert.equal(error.code, code); return true; };

test('supported Linux x86_64 deployment has the exact real sandbox dependency', {skip: process.platform !== 'linux' || process.arch !== 'x64'}, () => {
  assert.equal(availability.available, true, `Install requirements-sandbox.txt into .sandbox-venv: ${availability.reason ?? ''} ${availability.message ?? ''}`);
});

// Non-runtime tests continue on systems without the optional pinned dependency.
test('registry is finite, exact-versioned and detached from callers', () => {
  const entries = listBundledWasm();
  assert.deepEqual(entries.map(e => e.id), ['integer-stats', 'bounded-echo']);
  assert(entries.every(e => /^[a-f0-9]{64}$/.test(e.sha256) && e.version === '1.0.0' && e.abi === WASM_ABI));
  entries[0].sha256 = 'mutated';
  assert.notEqual(getBundledWasm('integer-stats').sha256, 'mutated');
  assert.throws(() => getBundledWasm('../private'), codeIs('UNKNOWN_SCRIPT'));
  assert.throws(() => getBundledWasm('integer-stats', '2.0.0'), codeIs('VERSION_MISMATCH'));
});

test('strict JSON and fixture inputs reject unsupported/large/deep values', () => {
  assert.equal(canonicalWasmJSON({z: 1, a: -0}), '{"a":0,"z":1}');
  for (const invalid of [undefined, NaN, Infinity, 9007199254740992, '\ud800', new Date(), new Uint8Array([1]), {a: undefined}, Array(3)]) {
    assert.throws(() => canonicalWasmJSON(invalid));
  }
  let getterCalled = false;
  const accessor = [];
  Object.defineProperty(accessor, '0', {enumerable:true, get() { getterCalled = true; return 1; }});
  assert.throws(() => canonicalWasmJSON(accessor), codeIs('INVALID_JSON'));
  assert.equal(getterCalled, false);
  class ForeignArray extends Array {}
  assert.throws(() => canonicalWasmJSON(new ForeignArray(1,2)), codeIs('INVALID_JSON'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalWasmJSON(cyclic), codeIs('INVALID_JSON'));
  let nested = 0; for (let i = 0; i < 34; i++) nested = {nested};
  assert.throws(() => canonicalWasmJSON(nested), codeIs('INVALID_JSON'));
  assert.throws(() => canonicalWasmJSON('x'.repeat(WASM_LIMITS.inputBytes)), codeIs('INPUT_LIMIT'));
  for (const invalid of [{values: [1.2]}, {values: [1000001]}, {values: Array(1001).fill(0)}, {values: [1], other: 1}, {values: [true]}]) {
    assert.throws(() => validateBundledWasmInput('integer-stats', invalid));
  }
  assert.throws(() => validateBundledWasmInput('bounded-echo', {text: 'x'.repeat(1025)}));
  assert.throws(() => validateBundledWasmInput('bounded-echo', {text: '😀'.repeat(513)}));
  assert.throws(() => validateBundledWasmInput('bounded-echo', {text: 'ok', path: '/etc/passwd'}));
});

test('missing runtime fails closed without alternate host execution', async () => {
  const result = await probeWasmRuntime({pythonPath: '/nonexistent/quiet-glass-python'});
  assert.equal(result.available, false);
  assert.equal(result.reason, 'RUNTIME_UNAVAILABLE');
});

test('real Linux child proves pinned engine and finite hard process limits', real, async () => {
  assert.equal(availability.version, '49.0.0');
  assert.deepEqual(availability.resourceLimits['9'], [536870912, 536870912]);
  assert.deepEqual(availability.resourceLimits['0'], [2, 2]);
  assert.deepEqual(availability.resourceLimits['1'], [0, 0]);
  assert.deepEqual(availability.resourceLimits['7'], [32, 32]);
  assert.deepEqual(availability.resourceLimits['4'], [0, 0]);
});

test('reviewed WAT reproduces fixed text-safe artifact hashes', real, async () => {
  for (const entry of listBundledWasm()) {
    const source = await readFile(join(ROOT, 'scripts/wasm', `${entry.id}.wat`), 'utf8');
    const artifact = Buffer.from(await readFile(join(ROOT, 'scripts/wasm', `${entry.id}.wasm.b64`), 'utf8'), 'base64');
    assert.deepEqual(wat(source), artifact);
    assert.equal(createHash('sha256').update(artifact).digest('hex'), entry.sha256);
    const inspected = await inspectWasmModule(artifact);
    assert.equal(inspected.sha256, entry.sha256);
    assert.deepEqual(inspected.exports, ['memory', 'qg_alloc', 'qg_run']);
  }
});

test('real fixture executions are correct at empty, signed and maximum boundaries', real, async () => {
  for (const values of [[], [1, 2, -3, 0], [-1000000, 1000000], Array(1000).fill(1000000), Array(1000).fill(-1000000)]) {
    const result = await runBundledWasm('integer-stats', {values});
    assert.deepEqual(result.output, {count: values.length, sum: values.reduce((a,b) => a+b, 0), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null});
    assert(result.metrics.fuelConsumed > 0 && result.metrics.fuelConsumed <= WASM_LIMITS.fuel);
    assert.equal(result.metrics.memoryBytes, 65536);
  }
  for (const text of ['', '你好 👋 "quoted"\nline', '😀'.repeat(512)]) assert.deepEqual((await runBundledWasm('bounded-echo', {text})).output, {text});
});

test('real infinite guest loop exhausts fuel; low operator fuel also traps', real, async () => {
  await assert.rejects(runWasmModule(moduleWith('(loop $again br $again) i64.const 4'), {}), codeIs('FUEL_EXHAUSTED'));
  await assert.rejects(runBundledWasm('bounded-echo', {text: 'x'}, {limits: {fuel: 1}}), codeIs('FUEL_EXHAUSTED'));
});

test('real guest memory.grow fails at the declared bound, oversize and unsafe memories reject', real, async () => {
  const deniedGrow = moduleWith('i32.const 1 memory.grow i32.const -1 i32.ne if unreachable end i64.const 4');
  assert.equal((await runWasmModule(deniedGrow, {})).output, null);
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {memory: '1 257'})), codeIs('MEMORY_LIMIT'));
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {memory: '1'})), codeIs('INVALID_ABI'));
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {memory: '1 1 shared'})), codeIs('INVALID_ABI'));
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {memory: 'i64 1 1'})), codeIs('INVALID_ABI'));
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {extra: '(table 1 funcref)'})), codeIs('FORBIDDEN_TABLE'));
});

test('all host/WASI imports and binary start sections reject before instantiation', real, async () => {
  for (const extra of ['(import "host" "callback" (func))', '(import "wasi_snapshot_preview1" "fd_write" (func (param i32 i32 i32 i32) (result i32)))', '(import "wasi:filesystem/types" "read" (func))']) {
    await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {extra})), codeIs('FORBIDDEN_IMPORT'));
  }
  const start = moduleWith('i64.const 4', {extra: '(func $start (loop $hang br $hang)) (start $start)'});
  await assert.rejects(runWasmModule(start, {}), codeIs('FORBIDDEN_START'));
});

test('wrong exports, signatures, huge binaries and malformed Wasm fail closed', real, async () => {
  await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {extra: '(func (export "ambient") )'})), codeIs('INVALID_ABI'));
  const wrong = wat('(module (memory (export "memory") 1 1) (func (export "qg_alloc") (result i32) i32.const 1) (func (export "qg_run") (param i32 i32) (result i64) i64.const 0))');
  await assert.rejects(inspectWasmModule(wrong), codeIs('INVALID_ABI'));
  await assert.rejects(inspectWasmModule(Buffer.alloc(WASM_LIMITS.moduleBytes + 1)), codeIs('INVALID_MODULE'));
  await assert.rejects(inspectWasmModule(Buffer.from([0,97,115,109,1,0,0,0,1,255])), codeIs('INVALID_MODULE'));
  await assert.rejects(inspectWasmModule(Buffer.from('not wasm')), codeIs('INVALID_MODULE'));
});

test('invalid alloc/output pointers, output flood and invalid UTF-8 are bounded', real, async () => {
  await assert.rejects(runWasmModule(moduleWith('i64.const 4', {alloc: 'i32.const -1'}), {}), codeIs('INVALID_POINTER'));
  await assert.rejects(runWasmModule(moduleWith('i64.const -4294967292'), {}), codeIs('INVALID_POINTER'));
  await assert.rejects(runWasmModule(moduleWith('i64.const 32769'), {}), codeIs('OUTPUT_LIMIT'));
  const badUTF8 = wat('(module (memory (export "memory") 1 1) (data (i32.const 0) "\\ff") (func (export "qg_alloc") (param i32) (result i32) i32.const 4096) (func (export "qg_run") (param i32 i32) (result i64) i64.const 1))');
  await assert.rejects(runWasmModule(badUTF8, {}), codeIs('INVALID_UTF8'));
});

test('guest JSON rejects duplicate keys, nonfinite/unsafe numbers, depth and invalid strings', real, async () => {
  for (const output of ['not-json', '{"x":1,"x":2}', 'NaN', '1e999', '9007199254740992', '9007199254740992.0', '1e100', '"\\ud800"', '['.repeat(34)+'0'+']'.repeat(34)]) {
    await assert.rejects(runWasmModule(moduleWith(`i64.const ${Buffer.byteLength(output)}`, {data: output}), {}), codeIs('INVALID_JSON'));
  }
});

test('hard ceilings cannot be raised; tighter process memory applies before native import', real, async () => {
  await assert.rejects(runBundledWasm('bounded-echo', {text:'x'}, {limits: {fuel: 1000001}}), codeIs('INVALID_LIMIT'));
  await assert.rejects(runBundledWasm('bounded-echo', {text:'x'}, {limits: {wallMs: 2001}}), codeIs('INVALID_LIMIT'));
  const lowMemory = await probeWasmRuntime({limits: {processMemoryBytes: 24 * 1024 * 1024}});
  assert.equal(lowMemory.available, false);
  assert(['RUNTIME_UNAVAILABLE','PROCESS_MEMORY_LIMIT','PROCESS_LIMIT'].includes(lowMemory.reason));
});

async function runnerProcesses() {
  const found = [];
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmd = await readFile(`/proc/${entry}/cmdline`, 'utf8');
      if (cmd.includes(join(ROOT, 'server/wasm-runner.py'))) found.push({pid: Number(entry), cwd: await readlink(`/proc/${entry}/cwd`)});
    } catch {}
  }
  return found;
}

test('outer wall watchdog covers cold import/compile and cleans its own temporary cwd', real, async () => {
  let child;
  await assert.rejects(runBundledWasm('bounded-echo', {text:'x'}, {limits: {wallMs: 1}, onSpawn({pid}) {
    child = {pid, cwd: readlinkSync(`/proc/${pid}/cwd`)};
  }}), codeIs('TIMEOUT'));
  assert(child);
  assert.throws(() => process.kill(child.pid, 0), {code:'ESRCH'});
  await assert.rejects(readdir(child.cwd), {code:'ENOENT'});
});

test('abort kills its real cold Wasmtime process and waits for process and cwd cleanup', real, async () => {
  const controller = new AbortController();
  let child;
  const task = runBundledWasm('bounded-echo', {text:'cancel'}, {signal: controller.signal, onSpawn({pid}) {
    child = {pid, cwd: readlinkSync(`/proc/${pid}/cwd`)};
    setTimeout(() => controller.abort(), 10);
  }});
  await assert.rejects(task, codeIs('CANCELLED'));
  assert(child, 'A real Python Wasmtime child was observed before cancellation');
  assert.throws(() => process.kill(child.pid, 0), {code: 'ESRCH'});
  await assert.rejects(readdir(child.cwd), {code:'ENOENT'});
});

test('already-cancelled operation does not spawn a runner', real, async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runBundledWasm('bounded-echo', {text:'x'}, {signal: controller.signal}), codeIs('CANCELLED'));
});

test('cross-run memory is fresh and synthetic parent secrets do not enter guest memory', real, async () => {
  const secret = 'SYNTHETIC_TEST_SECRET_7debe25a';
  process.env.QG_TEST_SECRET = secret;
  try {
    const first = await runBundledWasm('bounded-echo', {text: secret});
    assert.equal(first.output.text, secret);
    const second = await runBundledWasm('bounded-echo', {text: 'public'});
    assert.equal(JSON.stringify(second).includes(secret), false);
    // Input from the preceding process occupied 4096. New memory must be zeroed.
    const fresh = moduleWith('i32.const 4096 i32.load8_u i32.eqz if else unreachable end i64.const 4', {alloc:'i32.const 8192'});
    assert.equal((await runWasmModule(fresh, {})).output, null);
    // There is no environment/file/network capability to resolve at all.
    await assert.rejects(inspectWasmModule(moduleWith('i64.const 4', {extra:'(import "wasi_snapshot_preview1" "environ_get" (func (param i32 i32) (result i32)))'})), codeIs('FORBIDDEN_IMPORT'));
  } finally { delete process.env.QG_TEST_SECRET; }
});

test('supervisor caps hostile process output independently of guest output bounds', real, async () => {
  // A trusted test-only interpreter substitute exercises the pipe supervisor.
  // It is never registered or reachable through the product API.
  const directory = await mkdtemp(join(tmpdir(), 'qg-supervisor-test-'));
  try {
    const pythonPath = join(directory, 'output-flood');
    await writeFile(pythonPath, '#!/bin/sh\nexec /usr/bin/python3 -I -c \'import os; b=b"x"*65536\nwhile True: os.write(1,b)\'\n', {mode:0o700});
    await assert.rejects(runWasmModule(Buffer.from([0,97,115,109,1,0,0,0]), {}, {pythonPath}), codeIs('OUTPUT_LIMIT'));
  } finally { await rm(directory, {recursive:true,force:true}); }
});


test('parent SIGKILL terminates its real runner, including the registration race', real, async () => {
  const module = moduleWith('(loop $again br $again) i64.const 4');
  const source = `import {runWasmModule} from ${JSON.stringify(new URL('../server/wasm-runtime.mjs', import.meta.url).href)};
    await runWasmModule(Buffer.from(${JSON.stringify(module.toString('base64'))}, 'base64'), {});`;
  const owner = spawn(process.execPath, ['--input-type=module', '-e', source], {stdio: ['ignore','ignore','ignore']});
  let runner;
  try {
    for (let i = 0; i < 100 && !runner; i++) {
      const candidates = await runnerProcesses();
      for (const candidate of candidates) {
        try {
          const status = await readFile(`/proc/${candidate.pid}/status`, 'utf8');
          if (new RegExp(`PPid:\\s+${owner.pid}\\s`).test(status)) runner = candidate;
        } catch {}
      }
      if (!runner) await new Promise(resolve => setTimeout(resolve, 2));
    }
    assert(runner, 'Observed the real child belonging to the soon-to-die parent');
    const closed = new Promise(resolve => owner.once('close', resolve));
    owner.kill('SIGKILL');
    await closed;
    let stillExecuting = true;
    for (let i = 0; i < 100 && stillExecuting; i++) {
      try {
        const status = await readFile(`/proc/${runner.pid}/status`, 'utf8');
        stillExecuting = !/^State:\s+Z/m.test(status);
      } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') stillExecuting = false; else throw error; }
      if (stillExecuting) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(stillExecuting, false, 'Orphaned Wasmtime child cannot continue executing');
  } finally {
    owner.kill('SIGKILL');
    // A SIGKILLed parent cannot execute finally; this empty private temp directory
    // contains no guest/secret files and is safely removed by test cleanup.
    if (runner) await rm(runner.cwd, {recursive:true,force:true});
  }
});


test('trusted spawn observer receives real PID; failure kills and drains before rejection', real, async () => {
  let pid;
  await assert.rejects(runBundledWasm('bounded-echo', {text:'x'}, {onSpawn(child) {
    pid = child.pid;
    assert.equal(Number.isSafeInteger(pid), true);
    throw new Error('Synthetic durable claim write failed');
  }}), codeIs('SPAWN_OBSERVER_FAILED'));
  assert.throws(() => process.kill(pid, 0), {code:'ESRCH'});
});
