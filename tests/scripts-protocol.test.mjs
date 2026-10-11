/** F10 security/behavior tests through real authenticated loopback HTTP and MCP.
 * Every token, value, run and opt-in configuration is a disposable fixture.
 * Real executions use the pinned installed Wasmtime runtime, never a fake result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema, PRINCIPAL_TOOLS } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { createHostTransport } from '../web/host-transport.js';

const OWNER = 'f10-owner-synthetic-only-012345678901234567890';
const READER = 'f10-principal-synthetic-only-012345678901234567890';
const TOOLS = ['qg_list_scripts', 'qg_run_script', 'qg_get_script_run', 'qg_list_script_runs', 'qg_cancel_script_run'];
const PYTHON = resolve(import.meta.dirname, '../.sandbox-venv/bin/python');
const input = (patch = {}) => ({ scriptId: 'integer-stats', version: '1.0.0', parameters: { values: [8, -3, 2] }, idempotencyKey: 'synthetic-run-key', ...patch });
const principal = () => ({ id: 'fixture', enabled: true, tokenEnv: 'F10_READER', tools: [...PRINCIPAL_TOOLS], resources: { sourceIds: ['local-notes', 'allowed'], ingestSourceIds: ['allowed'] }, limits: { requestsPerMinute: 600, maxConcurrent: 8 } });
const errorCode = response => response.result?.structuredContent?.code;
const rejected = response => assert.ok(response.error || response.result?.isError === true, 'Expected rejection: ' + JSON.stringify(response));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t, { scripts = {}, options = {}, seed } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'qg-scripts-protocol-'));
  const config = ConfigSchema.parse({ dataDir: directory, scripts: { pythonPath: PYTHON, ...scripts }, access: { principals: [principal()] } });
  const external = [], clients = []; let service, server, origin, sequence = 0;
  const start = async () => {
    service = new Service(config, { ...options, env: { F10_READER: READER }, fetchImpl: async (...args) => { external.push(args); throw Error('External calls forbidden in this fixture'); } });
    for (const method of ['collect', 'tools', 'write']) service.connectors[method] = async (...args) => { external.push({ method, args }); throw Error('Scripts cannot call connectors'); };
    server = await startHttp(service, { port: 0, token: OWNER }); origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    for (const client of clients.splice(0)) await client.close().catch(() => {});
    server.closeAllConnections(); await new Promise(done => server.close(done)); await service.close();
  };
  await start(); if (seed) seed(service);
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  const http = (path, { token = OWNER, method = 'GET', body, headers = {} } = {}) => fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (path, options) => { const response = await http(path, options); assert.ok(response.status >= 200 && response.status < 300, await response.clone().text()); return response.json(); };
  const rpc = async (method, params = {}, token = OWNER) => { const response = await http('/mcp', { token, method: 'POST', body: { jsonrpc: '2.0', id: ++sequence, method, params }, headers: { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' } }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const raw = (name, args = {}, token = OWNER) => rpc('tools/call', { name, arguments: args }, token);
  const call = async (name, args = {}, token = OWNER) => { const response = await raw(name, args, token); assert.equal(response.error, undefined, JSON.stringify(response)); assert.notEqual(response.result?.isError, true, JSON.stringify(response)); return response.result.structuredContent; };
  const connect = async (token = OWNER) => { const client = new Client({ name: 'quiet-glass-scripts-protocol-fixture', version: '1' }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); return client; };
  const records = () => JSON.stringify(service.store.db.prepare('SELECT kind,id,value FROM records ORDER BY kind,id').all());
  const ordinary = () => JSON.stringify(Object.fromEntries(['card', 'annotation', 'settings', 'action', 'workflow', 'conversation', 'message', 'request', 'ai-run', 'job', 'job-run'].map(kind => [kind, service.store.list(kind)])));
  const terminal = async id => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { const run = await call('qg_get_script_run', { runId: id }); if (run.status !== 'running') return run; await new Promise(done => setTimeout(done, 10)); }
    assert.fail('Script did not reach a terminal state');
  };
  return { get service() { return service; }, config, directory, external, http, json, rpc, raw, call, connect, records, ordinary, terminal, restart: async () => { await stop(); await start(); } };
}

async function assertRejectedBoth(f, body) {
  const response = await f.http('/api/script-runs', { method: 'POST', body });
  assert.equal(response.status, 400, JSON.stringify(body) + ': ' + await response.clone().text());
  rejected(await f.raw('qg_run_script', body));
}

test('exactly five script tools are owner-only; restricted grants, dispatch and cookie escalation fail closed', async t => {
  const f = await fixture(t), owner = (await (await f.connect()).listTools()).tools;
  assert.deepEqual(owner.filter(tool => /script/.test(tool.name)).map(tool => tool.name).sort(), [...TOOLS].sort());
  for (const name of TOOLS) { const tool = owner.find(value => value.name === name); assert.ok(tool, name); assert.equal(tool.annotations.openWorldHint, false); assert.equal(ConfigSchema.safeParse({ access: { principals: [{ ...principal(), tools: [name] }] } }).success, false); }
  const reader = (await (await f.connect(READER)).listTools()).tools.map(tool => tool.name);
  const before = f.records();
  for (const [name, args] of [['qg_list_scripts', {}], ['qg_run_script', input()], ['qg_get_script_run', { runId: 'scriptrun_missing' }], ['qg_list_script_runs', {}], ['qg_cancel_script_run', { runId: 'scriptrun_missing' }]]) { assert.equal(reader.includes(name), false); rejected(await f.raw(name, args, READER)); }
  for (const [method, path, body] of [['GET', '/api/scripts'], ['POST', '/api/script-runs', input()], ['GET', '/api/script-runs'], ['GET', '/api/script-runs/scriptrun_missing'], ['POST', '/api/script-runs/scriptrun_missing/cancel', {}]]) assert.equal((await f.http(path, { method, body, token: READER })).status, 403, method + ' ' + path);
  assert.equal((await f.http('/api/scripts', { token: null })).status, 401);
  const login = await f.http('/api/session', { token: null, method: 'POST', body: { token: OWNER } }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.http('/api/scripts', { token: null, headers: { Cookie: cookie } })).status, 200);
  assert.equal((await f.http('/api/scripts', { token: READER, headers: { Cookie: cookie } })).status, 403);
  assert.equal((await f.http('/api/scripts', { token: 'wrong', headers: { Cookie: cookie } })).status, 401);
  assert.equal((await f.http('/mcp', { token: null, method: 'POST', body: {}, headers: { Cookie: cookie } })).status, 401);
  assert.equal((await f.http('/api/script-runs', { method: 'POST', body: input(), headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal(f.records(), before); assert.deepEqual(f.external, []);
});

test('disabled scripts reject explicit manual execution without a durable claim and cannot be enabled by settings or payload', async t => {
  let dispatches = 0;
  const f = await fixture(t, { options: { scriptsCheckpoint: () => { dispatches++; } } });
  assert.equal(f.config.scripts.enabled, false);
  const list = await f.call('qg_list_scripts'); assert.equal(list.enabled, false);
  assert.equal((await f.call('qg_list_script_runs')).total, 0);
  const before = f.records();
  const response = await f.http('/api/script-runs', { method: 'POST', body: input() });
  assert.ok(response.status >= 400); assert.equal((await response.json()).code, 'SCRIPT_DISABLED');
  const denied = await f.raw('qg_run_script', input()); rejected(denied); assert.equal(errorCode(denied), 'SCRIPT_DISABLED');
  for (const set of [{ scripts: { enabled: true } }, { scriptsEnabled: true }, { runtimeEnabled: true }]) {
    const body = { set, expectedRevision: 0 };
    assert.equal((await f.http('/api/settings', { method: 'PATCH', body })).status, 400); rejected(await f.raw('qg_update_settings', body));
  }
  for (const patch of [{ enabled: true }, { manual: true }, { config: { scripts: { enabled: true } } }, { owner: true }, { actorId: 'owner' }, { force: true }]) await assertRejectedBoth(f, input(patch));
  assert.equal(f.records(), before); assert.equal(dispatches, 0); assert.equal(f.config.scripts.enabled, false); assert.deepEqual(f.external, []);
});

test('registry/version/hash/code/path/tool/network-shaped invocation payloads fail atomically on both transports', async t => {
  const f = await fixture(t, { scripts: { enabled: true } }), before = f.records();
  const invalid = [null, {}, input({ scriptId: 'shell' }), input({ scriptId: '__proto__' }), input({ scriptId: 'constructor' }), input({ scriptId: '../wasm-runner.py' }), input({ scriptId: 'qg_collect' }), input({ version: 'latest' }), input({ version: '1.0.1' }), input({ version: null }), input({ idempotencyKey: '' }), input({ idempotencyKey: 'x'.repeat(201) }),
    ...[{ code: 'process.exit()' }, { script: 'print(1)' }, { wasm: 'AGFzbQ==' }, { module: 'AGFzbQ==' }, { moduleBytes: [0, 97, 115, 109] }, { path: '/tmp/executable' }, { pythonPath: '/bin/sh' }, { command: 'echo forbidden' }, { url: 'https://provider.invalid' }, { connectorId: 'any' }, { tool: 'qg_collect' }, { registryHash: '0'.repeat(64) }, { hash: '0'.repeat(64) }, { runtime: 'native' }, { limits: { fuel: 1000000000 } }, { environment: { SECRET: 'fixture' } }, { stdin: 'unbounded' }, { schedule: { intervalSeconds: 60 } }].map(patch => input(patch))];
  for (const body of invalid) { await assertRejectedBoth(f, body); assert.equal(f.records(), before, 'Rejected payload cannot create a run or receipt'); }
  assert.deepEqual(f.external, []);
});

test('typed parameters, safe integer bounds, unicode, and byte limits are enforced before claiming any run', async t => {
  const f = await fixture(t, { scripts: { enabled: true } }), before = f.records();
  for (const parameters of [null, {}, [], { values: '1,2' }, { values: [1.1] }, { values: [1000001] }, { values: [-1000001] }, { values: [Number.MAX_SAFE_INTEGER] }, { values: [null] }, { values: [true] }, { values: ['1'] }, { values: Array(1001).fill(1) }, { values: [], code: 'unreachable' }, { text: 'wrong script schema' }]) await assertRejectedBoth(f, input({ parameters }));
  for (const parameters of [{}, { text: 1 }, { text: 'x'.repeat(1025) }, { text: '\ud800' }, { text: 'ok', url: 'https://provider.invalid' }, { values: [] }]) await assertRejectedBoth(f, input({ scriptId: 'bounded-echo', parameters }));
  assert.equal(f.records(), before);
  const limited = await fixture(t, { scripts: { enabled: true, maxInputBytes: 256 } });
  const body = input({ scriptId: 'bounded-echo', parameters: { text: '界'.repeat(100) } });
  const response = await limited.http('/api/script-runs', { method: 'POST', body }); assert.ok(response.status >= 400); assert.equal((await response.json()).code, 'SCRIPT_INPUT_LIMIT');
  const result = await limited.raw('qg_run_script', body); rejected(result); assert.equal(errorCode(result), 'SCRIPT_INPUT_LIMIT'); assert.equal((await limited.call('qg_list_script_runs')).total, 0);
  assert.deepEqual(f.external, []); assert.deepEqual(limited.external, []);
});

test('HTTP and host routes strictly preserve target IDs, methods and pagination without extra dispatch', async t => {
  const f = await fixture(t), before = f.records();
  const invalid = [['GET', '/api/scripts?enabled=true'], ['GET', '/api/scripts?limit=1'], ['GET', '/api/script-runs?limit=1&limit=2'], ['GET', '/api/script-runs?offset='], ['GET', '/api/script-runs?offset=1e2'], ['GET', '/api/script-runs?offset=-1'], ['GET', '/api/script-runs?limit=101'], ['GET', '/api/script-runs/scriptrun_missing?runId=scriptrun_other'], ['GET', '/api/script-runs/scriptrun_missing?limit=1'], ['POST', '/api/script-runs?enabled=true', input()], ['POST', '/api/script-runs/scriptrun_missing/cancel?force=true', {}], ['POST', '/api/script-runs/scriptrun_missing/cancel', { runId: 'scriptrun_other' }], ['POST', '/api/script-runs/scriptrun_missing/cancel', { force: true }]];
  for (const [method, path, body] of invalid) assert.equal((await f.http(path, { method, body })).status, 400, method + ' ' + path);
  for (const [name, args] of [['qg_list_scripts', { enabled: true }], ['qg_list_script_runs', { enabled: true }], ['qg_get_script_run', { runId: 'scriptrun_missing', scriptId: 'bounded-echo' }], ['qg_cancel_script_run', { runId: 'scriptrun_missing', force: true }]]) rejected(await f.raw(name, args));
  assert.equal(f.records(), before);
  const dispatched = [], host = createHostTransport(async args => { dispatched.push(args); return { structuredContent: { ok: true } }; });
  for (const [path, options, expected] of [['/api/scripts', {}, { name: 'qg_list_scripts', arguments: {} }], ['/api/script-runs', { method: 'POST', body: JSON.stringify(input()) }, { name: 'qg_run_script', arguments: input() }], ['/api/script-runs?limit=2&offset=1', {}, { name: 'qg_list_script_runs', arguments: { limit: 2, offset: 1 } }], ['/api/script-runs/scriptrun_fixture', {}, { name: 'qg_get_script_run', arguments: { runId: 'scriptrun_fixture' } }], ['/api/script-runs/scriptrun_fixture/cancel', { method: 'POST', body: '{}' }, { name: 'qg_cancel_script_run', arguments: { runId: 'scriptrun_fixture' } }]]) { assert.deepEqual(await host(path, options), { ok: true }); assert.deepEqual(dispatched.at(-1), expected); }
  const count = dispatched.length;
  for (const [method, path, body] of invalid) await assert.rejects(host(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path);
  assert.equal(dispatched.length, count, 'Invalid host routing must be rejected before dispatch'); assert.deepEqual(f.external, []);
});

test('enabled registry executes both bundled modules in real Wasmtime and leaves ordinary workspace and jobs unchanged', async t => {
  const PRIVATE = 'SYNTHETIC_PRIVATE_WORKSPACE_MARKER_DO_NOT_INCLUDE';
  const f = await fixture(t, { scripts: { enabled: true }, seed: service => service.createNote({ title: 'Unrelated fixture', content: PRIVATE, idempotencyKey: 'fixture-note' }) });
  const before = f.ordinary(), listing = await f.call('qg_list_scripts');
  assert.deepEqual(listing.registry.map(entry => entry.id).sort(), ['bounded-echo', 'integer-stats']);
  assert.equal(listing.enabled, true); assert.equal(listing.runtimeAvailability.available, true, JSON.stringify(listing.runtimeAvailability)); assert.equal(listing.registry.length, 2);
  for (const body of [input(), input({ scriptId: 'bounded-echo', parameters: { text: 'Unicode 界 🔒 <script>untrusted</script>' }, idempotencyKey: 'echo-key' })]) {
    const run = await f.json('/api/script-runs', { method: 'POST', body }); assert.equal(run.status, 'running'); assert.equal(run.attempt, 1); assert.match(run.registryHash, /^[a-f0-9]{64}$/);
    const done = await f.terminal(run.id); assert.equal(done.status, 'completed', JSON.stringify(done)); assert.equal(done.error, null);
    const descriptor = listing.registry.find(entry => entry.id === body.scriptId);
    assert.equal(done.registryHash, createHash('sha256').update(JSON.stringify(stable(descriptor))).digest('hex'));
    assert.equal(done.result.sha256, descriptor.sha256); assert.equal(done.result.runtime, 'wasmtime-py'); assert.equal(done.result.version, '49.0.0'); assert.equal(done.result.abi, 'qg-json-v1'); assert.match(done.result.sha256, /^[a-f0-9]{64}$/); assert.ok(done.result.metrics.fuelConsumed > 0); assert.ok(done.result.metrics.memoryBytes <= 16 * 1024 * 1024);
    assert.deepEqual(done.result.output, body.scriptId === 'integer-stats' ? { count: 3, sum: 7, min: -3, max: 8 } : body.parameters);
    assert.equal(JSON.stringify(done).includes(PRIVATE), false); assert.equal(JSON.stringify(done).includes(OWNER), false); assert.equal(JSON.stringify(done).includes(READER), false);
    assert.deepEqual(await f.call('qg_run_script', body), done, 'Retry is a saved snapshot, not a second dispatch');
    assert.deepEqual(await f.json('/api/script-runs/' + run.id), done);
  }
  const history = await f.call('qg_list_script_runs', { limit: 1, offset: 0 }); assert.equal(history.total, 2); assert.equal(history.runs.length, 1); assert.equal(history.nextOffset, 1);
  const rest = await f.json('/api/script-runs?limit=1&offset=1'); assert.equal(rest.nextOffset, null); assert.notEqual(history.runs[0].id, rest.runs[0].id);
  assert.equal(f.ordinary(), before); assert.deepEqual(f.external, []);
});

test('concurrent HTTP/MCP retries atomically claim once and payload conflicts cannot change a durable run', async t => {
  const held = deferred(), entered = deferred(); let dispatches = 0;
  const f = await fixture(t, { scripts: { enabled: true, maxConcurrency: 1 }, options: { scriptsCheckpoint: async stage => { if (stage === 'before-dispatch') { dispatches++; entered.resolve(); await held.promise; } } } });
  t.after(() => held.resolve());
  const body = input();
  const [http, mcp] = await Promise.all([f.json('/api/script-runs', { method: 'POST', body }), f.call('qg_run_script', body)]);
  assert.equal(http.id, mcp.id); await entered.promise; assert.equal(dispatches, 1);
  const before = f.records();
  const conflict = await f.raw('qg_run_script', input({ parameters: { values: [99] } })); rejected(conflict); assert.equal(errorCode(conflict), 'SCRIPT_IDEMPOTENCY_CONFLICT');
  const response = await f.http('/api/script-runs', { method: 'POST', body: input({ parameters: { values: [99] } }) }); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'SCRIPT_IDEMPOTENCY_CONFLICT'); assert.equal(f.records(), before);
  const full = await f.http('/api/script-runs', { method: 'POST', body: input({ idempotencyKey: 'second-key' }) }); assert.equal(full.status, 429); assert.equal((await full.json()).code, 'SCRIPT_CONCURRENCY_LIMIT');
  held.resolve(); const done = await f.terminal(http.id); assert.equal(done.status, 'completed', JSON.stringify(done));
  await f.restart(); assert.deepEqual(await f.call('qg_run_script', body), done); assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.equal(dispatches, 1); assert.deepEqual(f.external, []);
});

test('cancellation wins before dispatch and over a completed guest result waiting to commit, without replay', async t => {
  for (const stageToHold of ['before-dispatch', 'before-commit']) {
    const held = deferred(), entered = deferred();
    const f = await fixture(t, { scripts: { enabled: true }, options: { scriptsCheckpoint: async stage => { if (stage === stageToHold) { entered.resolve(); await held.promise; } } } });
    t.after(() => held.resolve());
    const body = input({ idempotencyKey: stageToHold }), run = await f.call('qg_run_script', body); await entered.promise;
    const cancelled = await f.json('/api/script-runs/' + run.id + '/cancel', { method: 'POST', body: {} }); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.result, null);
    held.resolve(); await f.service.scripts.drain();
    assert.deepEqual(await f.call('qg_get_script_run', { runId: run.id }), cancelled);
    assert.deepEqual(await f.call('qg_cancel_script_run', { runId: run.id }), cancelled);
    assert.deepEqual(await f.call('qg_run_script', body), cancelled); assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.deepEqual(f.external, []);
  }
});

test('missing pinned runtime fails durably with a safe public error and never auto-retries on reads or restart', async t => {
  const f = await fixture(t, { scripts: { enabled: true, pythonPath: '/not-present-f10-fixture/SECRET_INTERPRETER_PATH' } });
  const listing = await f.call('qg_list_scripts'); assert.equal(listing.runtimeAvailability.available, false);
  const body = input(), run = await f.call('qg_run_script', body), done = await f.terminal(run.id);
  assert.equal(done.status, 'failed'); assert.equal(done.error.code, 'SCRIPT_RUNTIME_UNAVAILABLE'); assert.equal(done.result, null);
  assert.equal(JSON.stringify(done).includes('SECRET_INTERPRETER_PATH'), false); assert.equal(JSON.stringify(done).includes(OWNER), false);
  assert.deepEqual(await f.json('/api/script-runs/' + run.id), done); assert.deepEqual(await f.call('qg_run_script', body), done);
  await f.restart(); assert.deepEqual(await f.call('qg_run_script', body), done); assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.deepEqual(f.external, []);
});

test('run history pruning preserves exact-payload receipts and hard receipt capacity without replay', async t => {
  const f = await fixture(t, { scripts: { enabled: true, maxRuns: 1, maxReceipts: 2, maxConcurrency: 1 } });
  const firstBody = input(), first = await f.call('qg_run_script', firstBody); assert.equal((await f.terminal(first.id)).status, 'completed');
  const second = await f.call('qg_run_script', input({ idempotencyKey: 'second-key' })); assert.equal((await f.terminal(second.id)).status, 'completed');
  const before = f.records();
  const old = await f.http('/api/script-runs', { method: 'POST', body: firstBody }); assert.equal(old.status, 409); assert.equal((await old.json()).code, 'SCRIPT_RUN_PRUNED');
  const replay = await f.raw('qg_run_script', firstBody); rejected(replay); assert.equal(errorCode(replay), 'SCRIPT_RUN_PRUNED');
  const full = await f.http('/api/script-runs', { method: 'POST', body: input({ idempotencyKey: 'third-key' }) }); assert.equal(full.status, 429); assert.equal((await full.json()).code, 'SCRIPT_RECEIPT_LIMIT');
  assert.equal(f.records(), before); assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.equal((await f.http('/api/script-runs/' + first.id)).status, 404);
  await f.restart(); const still = await f.raw('qg_run_script', firstBody); rejected(still); assert.equal(errorCode(still), 'SCRIPT_RUN_PRUNED'); assert.deepEqual(f.external, []);
});

test('real runtime fuel and saved-result bounds produce safe terminal failures without workspace effects', async t => {
  for (const [scripts, expected] of [[{ fuel: 1 }, 'SCRIPT_FUEL_LIMIT'], [{ maxResultBytes: 256 }, 'SCRIPT_OUTPUT_LIMIT']]) {
    const f = await fixture(t, { scripts: { enabled: true, ...scripts } }), before = f.ordinary();
    const body = input(), run = await f.call('qg_run_script', body), done = await f.terminal(run.id);
    assert.equal(done.status, 'failed', JSON.stringify(done)); assert.equal(done.error.code, expected, JSON.stringify(done)); assert.equal(done.result, null);
    assert.deepEqual(await f.call('qg_run_script', body), done); assert.equal(f.ordinary(), before); assert.deepEqual(f.external, []);
  }
});

test('a service deadline discards delayed work and repeated read/cancel/run calls cannot revive it', async t => {
  const held = deferred(), entered = deferred();
  const f = await fixture(t, { scripts: { enabled: true, timeoutMs: 100 }, options: { scriptsCheckpoint: async stage => { if (stage === 'before-dispatch') { entered.resolve(); await held.promise; } } } });
  t.after(() => held.resolve());
  const body = input(), run = await f.call('qg_run_script', body); await entered.promise;
  const done = await f.terminal(run.id); assert.equal(done.status, 'timed_out'); assert.equal(done.error.code, 'SCRIPT_TIMEOUT'); assert.equal(done.result, null);
  held.resolve(); await f.service.scripts.drain();
  assert.deepEqual(await f.call('qg_run_script', body), done); assert.deepEqual(await f.call('qg_cancel_script_run', { runId: run.id }), done);
  assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.deepEqual(f.external, []);
});

test('shutdown and restart preserve interruption and its receipt without dispatching an abandoned invocation', async t => {
  const held = deferred(), entered = deferred(); let dispatches = 0;
  const f = await fixture(t, { scripts: { enabled: true }, options: { scriptsCheckpoint: async stage => { if (stage === 'before-dispatch') { dispatches++; entered.resolve(); await held.promise; } } } });
  t.after(() => held.resolve());
  const body = input(), run = await f.call('qg_run_script', body); await entered.promise; await f.restart();
  const done = await f.json('/api/script-runs/' + run.id); assert.equal(done.status, 'interrupted'); assert.equal(done.error.code, 'SCRIPT_INTERRUPTED'); assert.equal(done.result, null);
  held.resolve(); assert.deepEqual(await f.call('qg_run_script', body), done); assert.equal(dispatches, 1); assert.equal((await f.call('qg_list_script_runs')).total, 1); assert.deepEqual(f.external, []);
});

test('a forward wall-clock jump cannot make an undrained execution reservation reusable', async t => {
  let now = Date.now(); const held = deferred(), entered = deferred();
  const f = await fixture(t, { scripts: { enabled: true, maxConcurrency: 1 }, options: { scriptsClock: { now: () => now }, scriptsCheckpoint: async stage => { if (stage === 'before-dispatch') { entered.resolve(); await held.promise; } } } });
  t.after(() => held.resolve());
  const run = await f.call('qg_run_script', input()); await entered.promise;
  now += 60000;
  const response = await f.http('/api/script-runs', { method: 'POST', body: input({ idempotencyKey: 'clock-jump-key' }) });
  assert.equal(response.status, 429, 'A wall-clock deadline cannot substitute for native process closure');
  assert.equal((await response.json()).code, 'SCRIPT_CONCURRENCY_LIMIT');
  held.resolve(); await f.service.scripts.drain();
  assert.notEqual((await f.call('qg_get_script_run', { runId: run.id })).status, 'running'); assert.equal((await f.call('qg_list_script_runs')).total, 1);
});

test('script audit records attribute owners and bounded outcomes without private input, keys, runtime paths or credentials', async t => {
  const secret = 'SYNTHETIC_PRIVATE_SCRIPT_TEXT', key = 'SYNTHETIC_PRIVATE_IDEMPOTENCY_KEY';
  const f = await fixture(t, { scripts: { enabled: true } }), body = input({ scriptId: 'bounded-echo', parameters: { text: secret }, idempotencyKey: key });
  const run = await f.json('/api/script-runs', { method: 'POST', body }); const done = await f.terminal(run.id); assert.equal(done.status, 'completed');
  assert.deepEqual(done.result.output, { text: secret });
  const audit = f.service.store.history(1000).filter(event => event.event.startsWith('script_'));
  assert.equal(audit.filter(event => event.event === 'script_started').length, 1); assert.equal(audit.filter(event => event.event === 'script_finished').length, 1);
  assert.ok(audit.every(event => event.detail.actorId === 'owner' && event.detail.actorKind === 'owner'));
  assert.equal(audit.find(event => event.event === 'script_started').detail.transport, 'http');
  for (const value of [secret, key, OWNER, READER, PYTHON]) assert.equal(JSON.stringify(audit).includes(value), false, 'Audit must not expose ' + value);
  const discovery = await f.call('qg_list_scripts'); for (const value of [secret, key, OWNER, READER, PYTHON]) assert.equal(JSON.stringify(discovery).includes(value), false);
  assert.deepEqual(f.external, []);
});


test('missing, unreadable or foreign PID namespaces cannot release a durable execution reservation', () => {
  // Isolated process: mock the filesystem failure only in this regression,
  // without adding a production injection hook or affecting HTTP test workers.
  const source = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { mkdtemp, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { Service } from ${JSON.stringify(new URL('../server/service.mjs', import.meta.url).href)};
    import { ConfigSchema } from ${JSON.stringify(new URL('../server/config.mjs', import.meta.url).href)};
    const directory = await mkdtemp(join(tmpdir(), 'qg-namespace-regression-'));
    const service = new Service(ConfigSchema.parse({ dataDir: directory }));
    const identity = structuredClone(service.scripts.ownerIdentity);
    assert.ok(identity && identity.pidNamespace, 'Linux process identity must be available');
    const run = { id: 'scriptrun_fixture', owner: 'different-worker', ownerIdentity: identity, dispatchStarted: false, childIdentity: null, slotReleasedAt: null };
    const originalLink = fs.readlinkSync, originalRead = fs.readFileSync;
    try {
      assert.equal(service.scripts.holdsSlot(run), true);
      for (const code of ['ENOENT', 'EACCES']) {
        fs.readlinkSync = (path, ...args) => {
          if (path === '/proc/self/ns/pid') throw Object.assign(new Error('Synthetic namespace read failure'), { code });
          return originalLink(path, ...args);
        };
        syncBuiltinESMExports();
        assert.equal(service.scripts.holdsSlot(run), true, code + ' on namespace identity is uncertainty, not process death');
      }
      fs.readlinkSync = (path, ...args) => path === '/proc/self/ns/pid' ? 'pid:[0]' : originalLink(path, ...args);
      syncBuiltinESMExports();
      assert.equal(service.scripts.holdsSlot(run), true, 'A foreign namespace must remain reserved');
      run.ownerIdentity = { ...identity, bootId: '00000000-0000-0000-0000-000000000000' };
      assert.equal(service.scripts.holdsSlot(run), true, 'A different boot view cannot override an unverified PID namespace');
      run.ownerIdentity = identity;
      fs.readlinkSync = originalLink;
      fs.readFileSync = (path, ...args) => {
        if (path === '/proc/' + identity.pid + '/stat') throw Object.assign(new Error('Synthetic verified-namespace process absence'), { code: 'ENOENT' });
        return originalRead(path, ...args);
      };
      syncBuiltinESMExports();
      assert.equal(service.scripts.holdsSlot(run), false, 'Only target absence in the verified namespace permits release');
    } finally {
      fs.readlinkSync = originalLink; fs.readFileSync = originalRead; syncBuiltinESMExports();
      await service.close(); await rm(directory, { recursive: true, force: true });
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Namespace regression failed');
});
