/** F11 adversarial coverage through authenticated, real loopback HTTP and MCP.
 * All databases, tokens, source records and operational records are temporary
 * synthetic fixtures. No real provider, credentials, database or browser is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema, PRINCIPAL_TOOLS } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { createHostTransport } from '../web/host-transport.js';

const OWNER = 'f11-owner-synthetic-only-012345678901234567890';
const READER = 'f11-reader-synthetic-only-012345678901234567890';
const TOOLS = ['qg_export_content_backup', 'qg_preview_content_restore', 'qg_commit_content_restore', 'qg_get_content_restore', 'qg_undo_content_restore'];
const PRINCIPAL = { id: 'fixture', enabled: true, tokenEnv: 'F11_READER', tools: [...PRINCIPAL_TOOLS], resources: { sourceIds: ['local-notes', 'allowed'], ingestSourceIds: ['allowed'] }, limits: { requestsPerMinute: 600, maxConcurrent: 8 } };
const rejected = response => assert.ok(response.error || response.result?.isError === true, 'Expected rejection: ' + JSON.stringify(response));
const resultCode = response => response.result?.structuredContent?.code;
const approval = (plan, idempotencyKey = 'synthetic-restore', patch = {}) => ({ planId: plan.planId, expectedPlanDigest: plan.planDigest, approvalToken: plan.approvalToken, approved: true, acknowledgeVisibility: true, idempotencyKey, ...patch });
const undoArgs = (receipt, idempotencyKey = 'synthetic-undo') => ({ restoreId: receipt.restoreId, expectedEpoch: receipt.undo.expectedEpoch, approved: true, idempotencyKey });
const undoBody = receipt => { const { restoreId, ...body } = undoArgs(receipt); return body; };
const noteInput = (idempotencyKey = 'synthetic-note', patch = {}) => ({ title: 'Synthetic local note', content: 'Explicit fixture content', tags: ['fixture'], idempotencyKey, ...patch });
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const reseal = value => {
  const backup = structuredClone(value), unsigned = structuredClone(backup); delete unsigned.checksum;
  unsigned.payload.cards.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  unsigned.payload.annotations.sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0);
  backup.checksum = { algorithm: 'sha256', value: hash(unsigned) }; return backup;
};

async function fixture(t, { principals = [], options = {}, seed } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'qg-backups-protocol-'));
  const config = ConfigSchema.parse({ dataDir: directory, access: { principals } });
  const external = [], clients = [], env = { F11_READER: READER }; let service, server, origin, sequence = 0;
  const start = async () => {
    service = new Service(config, { ...options, env, fetchImpl: async (...args) => { external.push(args); throw Error('External provider calls forbidden in backup fixture'); } });
    for (const method of ['collect', 'tools', 'write']) service.connectors[method] = async (...args) => { external.push({ method, args }); throw Error('Backup operations must not call connectors'); };
    server = await startHttp(service, { port: 0, token: OWNER });
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    for (const client of clients.splice(0)) await client.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null; }
    if (service) { await service.close(); service = null; }
  };
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  await start(); if (seed) seed(service);
  const http = (path, { token = OWNER, method = 'GET', body, headers = {} } = {}) => fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (path, options) => { const response = await http(path, options); assert.ok(response.status >= 200 && response.status < 300, await response.clone().text()); return response.json(); };
  const rpc = async (method, params = {}, token = OWNER) => { const response = await http('/mcp', { token, method: 'POST', body: { jsonrpc: '2.0', id: ++sequence, method, params }, headers: { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' } }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const raw = (name, args = {}, token = OWNER) => rpc('tools/call', { name, arguments: args }, token);
  const call = async (name, args = {}, token = OWNER) => { const response = await raw(name, args, token); assert.equal(response.error, undefined, JSON.stringify(response)); assert.notEqual(response.result?.isError, true, JSON.stringify(response)); return response.result.structuredContent; };
  const connect = async (token = OWNER) => { const client = new Client({ name: 'sill-backups-protocol-fixture', version: '1' }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); return client; };
  const records = () => JSON.stringify(service.store.db.prepare('SELECT kind,id,value FROM records ORDER BY kind,id').all());
  const ordinary = () => JSON.stringify(Object.fromEntries(['card', 'annotation', 'settings', 'action', 'workflow', 'conversation', 'message', 'request', 'ai-run', 'job', 'job-run', 'script-run'].map(kind => [kind, service.store.list(kind)])));
  return { get service() { return service; }, config, env, external, http, json, raw, call, connect, records, ordinary, restart: async () => { await stop(); await start(); } };
}

test('exactly five backup tools are owner-only; restricted discovery, grants and cookie escalation fail closed', async t => {
  const f = await fixture(t, { principals: [structuredClone(PRINCIPAL)] });
  const ownerTools = (await (await f.connect()).listTools()).tools;
  assert.deepEqual(ownerTools.filter(tool => /(?:content_backup|content_restore)$/.test(tool.name)).map(tool => tool.name).sort(), [...TOOLS].sort());
  const readerTools = (await (await f.connect(READER)).listTools()).tools.map(tool => tool.name);
  for (const name of TOOLS) {
    assert.equal(ownerTools.find(tool => tool.name === name).annotations.openWorldHint, false);
    assert.equal(readerTools.includes(name), false);
    assert.equal(ConfigSchema.safeParse({ access: { principals: [{ ...structuredClone(PRINCIPAL), tools: [name] }] } }).success, false);
  }
  const before = f.records();
  for (const [name, args] of [
    [TOOLS[0], {}], [TOOLS[1], { backup: {}, mode: 'overwrite' }],
    [TOOLS[2], { planId: 'backupplan_missing', expectedPlanDigest: '0'.repeat(64), approvalToken: '0'.repeat(64), approved: true, acknowledgeVisibility: true, idempotencyKey: 'attack' }],
    [TOOLS[3], { restoreId: 'restore_missing' }], [TOOLS[4], { restoreId: 'restore_missing', expectedEpoch: 0, approved: true, idempotencyKey: 'attack' }],
  ]) rejected(await f.raw(name, args, READER));
  for (const [method, path, body] of [
    ['POST', '/api/backups/export', {}], ['POST', '/api/backups/preview', { backup: {}, mode: 'overwrite' }],
    ['POST', '/api/backups/commit', {}], ['GET', '/api/backups/restores/restore_missing'],
    ['POST', '/api/backups/restores/restore_missing/undo', { expectedEpoch: 0, approved: true, idempotencyKey: 'attack' }],
  ]) assert.equal((await f.http(path, { method, body, token: READER })).status, 403, path);
  assert.equal((await f.http('/api/backups/export', { method: 'POST', body: {}, token: null })).status, 401);
  const login = await f.http('/api/session', { method: 'POST', body: { token: OWNER }, token: null });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.http('/api/backups/export', { method: 'POST', body: {}, token: READER, headers: { Cookie: cookie } })).status, 403);
  assert.equal((await f.http('/api/backups/export', { method: 'POST', body: {}, token: 'wrong', headers: { Cookie: cookie } })).status, 401);
  assert.equal((await f.http('/api/backups/export', { method: 'POST', body: {}, headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal(f.records(), before); assert.deepEqual(f.external, []);
});

test('HTTP and host routes reject unknown fields, queries, ID substitution and methods before dispatch', async t => {
  const f = await fixture(t), before = f.records();
  const invalid = [
    ['POST', '/api/backups/export?all=true', {}], ['POST', '/api/backups/export', { includeCredentials: true }],
    ['POST', '/api/backups/preview?mode=overwrite', { backup: {} }], ['POST', '/api/backups/commit?approved=true', {}],
    ['GET', '/api/backups/restores/restore_missing?restoreId=restore_other'],
    ['POST', '/api/backups/restores/restore_missing/undo?force=true', {}],
    ['POST', '/api/backups/restores/restore_missing/undo', { restoreId: 'restore_other', expectedEpoch: 0, approved: true, idempotencyKey: 'attack' }],
  ];
  for (const [method, path, body] of invalid) assert.equal((await f.http(path, { method, body })).status, 400, method + ' ' + path);
  for (const [method, path, body] of [['GET', '/api/backups/export'], ['GET', '/api/backups/preview'], ['GET', '/api/backups/commit'], ['DELETE', '/api/backups/restores/restore_missing'], ['GET', '/api/backups/restores/restore_missing/undo']]) {
    assert.ok([404, 405].includes((await f.http(path, { method, body })).status), method + ' ' + path);
  }
  const dispatched = [], host = createHostTransport(async args => { dispatched.push(args); return { structuredContent: { ok: true } }; });
  const commit = { planId: 'backupplan_fixture', expectedPlanDigest: '0'.repeat(64), approvalToken: '0'.repeat(64), approved: true, acknowledgeVisibility: true, idempotencyKey: 'fixture' };
  const undo = { expectedEpoch: 3, approved: true, idempotencyKey: 'fixture-undo' };
  for (const [path, options, expected] of [
    ['/api/backups/export', { method: 'POST', body: '{}' }, { name: TOOLS[0], arguments: {} }],
    ['/api/backups/preview', { method: 'POST', body: JSON.stringify({ backup: {}, mode: 'additive' }) }, { name: TOOLS[1], arguments: { backup: {}, mode: 'additive' } }],
    ['/api/backups/commit', { method: 'POST', body: JSON.stringify(commit) }, { name: TOOLS[2], arguments: commit }],
    ['/api/backups/restores/restore_fixture', {}, { name: TOOLS[3], arguments: { restoreId: 'restore_fixture' } }],
    ['/api/backups/restores/restore_fixture/undo', { method: 'POST', body: JSON.stringify(undo) }, { name: TOOLS[4], arguments: { restoreId: 'restore_fixture', ...undo } }],
  ]) { assert.deepEqual(await host(path, options), { ok: true }); assert.deepEqual(dispatched.at(-1), expected); }
  const count = dispatched.length;
  for (const [method, path, body] of invalid) await assert.rejects(host(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path);
  assert.equal(dispatched.length, count); assert.equal(f.records(), before); assert.deepEqual(f.external, []);
});

test('export preserves only owner content, provenance, state and nullable ordinary settings; checksum is deterministic integrity', async t => {
  const f = await fixture(t, { principals: [structuredClone(PRINCIPAL)] });
  const note = await f.call('qg_create_note', noteInput());
  await f.call('qg_update_annotation', { cardId: note.id, set: { note: 'Synthetic private annotation', tags: ['personal'] }, expectedRevision: 0 });
  await f.call('qg_feedback', { cardId: note.id, state: { read: true, bookmarked: true } });
  const host = await f.call('qg_ingest', { mode: 'host-assisted', sourceId: 'host-linear', items: [{ externalId: 'fixture-backup-issue', title: 'Synthetic upstream source', content: 'Supplied original text', summary: 'Supplied model summary', kind: 'task', url: 'https://linear.app/fixture/issue/FIX-11/backups', tags: [], evidenceIds: [note.id], truncated: false, expectedRevision: 0, provenance: { provider: 'linear', upstreamId: 'fixture-backup-issue', scope: { accountId: 'fixture-account', workspaceId: 'fixture-workspace' }, retrievedAt: '2026-10-11T00:00:00Z', partial: false, contentOrigin: 'upstream-original', summaryOrigin: 'model-summary' } }] });
  const privateMarker = 'EXCLUDED_OPERATIONAL_SYNTHETIC_MARKER';
  const conversation = await f.call('qg_create_conversation', { title: privateMarker, idempotencyKey: 'excluded-conversation-key' });
  await f.call('qg_create_request', { conversationId: conversation.id, question: privateMarker, cardIds: [note.id], idempotencyKey: 'excluded-request-key' });
  for (const kind of ['action', 'action-key', 'workflow', 'ai-run', 'script-run', 'job', 'job-run', 'configuration', 'credentials', 'host-import-receipt']) f.service.store.put(kind, 'excluded-fixture', { marker: privateMarker });
  f.service.store.audit('synthetic_private_audit', { marker: privateMarker });
  const before = f.records(), first = await f.json('/api/backups/export', { method: 'POST', body: {} });
  const second = await f.call(TOOLS[0]);
  assert.deepEqual(Object.keys(first).sort(), ['checksum', 'exportedAt', 'format', 'payload', 'scope', 'version']);
  assert.deepEqual(Object.keys(first.payload).sort(), ['annotations', 'cards', 'settings']);
  assert.equal(first.format, 'sill-content-backup'); assert.equal(first.version, 1); assert.equal(first.scope, 'cards-annotations-settings');
  assert.equal(first.payload.settings, null, 'An absent ordinary setting record stays absent in the exported format');
  assert.deepEqual(first.payload, second.payload);
  assert.deepEqual(first.payload.cards.map(card => card.id).sort(), [note.id, host.cardIds[0]].sort());
  assert.deepEqual(first.payload.cards.find(card => card.id === note.id), f.service.store.get('card', note.id));
  assert.deepEqual(first.payload.cards.find(card => card.id === host.cardIds[0]), f.service.store.get('card', host.cardIds[0]));
  assert.deepEqual(first.payload.annotations, [f.service.store.get('annotation', note.id)]);
  assert.equal(first.checksum.algorithm, 'sha256'); assert.equal(first.checksum.value, reseal(first).checksum.value);
  for (const secret of [OWNER, READER, 'F11_READER', privateMarker, 'excluded-conversation-key', 'excluded-request-key', 'synthetic-note']) assert.equal(JSON.stringify(first).includes(secret), false, secret);
  assert.equal(f.records(), before, 'Export writes neither content nor receipts');
  const reordered = Object.fromEntries(Object.entries(first).reverse()); reordered.payload.cards.reverse();
  const target = await fixture(t);
  const plan = await target.call(TOOLS[1], { backup: reordered });
  assert.equal(plan.mode, 'additive'); assert.equal(target.service.store.list('card').length, 0, 'Preview is never a content commit');
  const edited = structuredClone(first); edited.payload.cards.find(card => card.id === note.id).state.bookmarked = false;
  rejected(await target.raw(TOOLS[1], { backup: edited }));
  // Anyone can recompute this public checksum: it authenticates no caller,
  // grants no access, and is deliberately not a signature or permission token.
  const recomputed = await target.call(TOOLS[1], { backup: reseal(edited) }); assert.equal(recomputed.mode, 'additive');
  assert.deepEqual(f.external, []); assert.deepEqual(target.external, []);
});

test('unknown versions, secret-record injection, missing evidence, tampering and hard bounds reject atomically on both protocols', async t => {
  const source = await fixture(t), target = await fixture(t);
  await source.call('qg_create_note', noteInput());
  const valid = await source.call(TOOLS[0]), before = target.records();
  const withPatch = change => { const copy = structuredClone(valid); change(copy); return reseal(copy); };
  const invalid = [
    null, {}, JSON.stringify(valid), { ...valid, version: 2 }, { ...valid, format: 'database-dump' }, { ...valid, scope: 'everything' },
    { ...valid, checksum: { algorithm: 'sha256', value: '0'.repeat(64) } },
    ...['credentials', 'config', 'conversations', 'requests', 'audit', 'receipts', 'principals'].map(key => withPatch(copy => { copy.payload[key] = [{ token: READER }]; })),
    withPatch(copy => { copy.payload.cards[0].credentials = READER; }),
    withPatch(copy => { copy.payload.annotations = [{ cardId: 'card_missing', values: { note: '', tags: [] }, revision: 0 }]; }),
    withPatch(copy => { copy.payload.settings = { values: { sort: 'priority', reduceTransparency: false, access: { principals: [] } }, revision: 0 }; }),
    withPatch(copy => { copy.payload.cards = Array(101).fill(copy.payload.cards[0]); }),
    withPatch(copy => { copy.payload.annotations = Array(101).fill({ cardId: copy.payload.cards[0].id, values: { note: '', tags: [] }, revision: 0 }); }),
  ];
  for (const backup of invalid) {
    const response = await target.http('/api/backups/preview', { method: 'POST', body: { backup } });
    assert.equal(response.status, 400, await response.clone().text()); rejected(await target.raw(TOOLS[1], { backup }));
    assert.equal(target.records(), before, 'Rejected preview cannot save a plan, receipt or content');
  }
  for (const backup of [withPatch(copy => { copy.payload.cards[0].content = '界'.repeat(90000); }), withPatch(copy => { copy.extra = Array(8001).fill(null); })]) {
    const response = await target.http('/api/backups/preview', { method: 'POST', body: { backup } });
    assert.equal(response.status, 413); assert.equal((await response.json()).code, 'BACKUP_LIMIT');
    const mcp = await target.raw(TOOLS[1], { backup }); rejected(mcp); assert.equal(resultCode(mcp), 'BACKUP_LIMIT'); assert.equal(target.records(), before);
  }
  const legacy = source.service.ingest({ sourceId: 'allowed', items: [{ externalId: 'derived', title: 'Synthetic derived record', evidenceIds: [valid.payload.cards[0].id] }] });
  const closure = await source.call(TOOLS[0]); closure.payload.cards = closure.payload.cards.filter(card => card.id === legacy.cardIds[0]);
  const missing = reseal(closure); assert.equal((await target.http('/api/backups/preview', { method: 'POST', body: { backup: missing } })).status, 400); rejected(await target.raw(TOOLS[1], { backup: missing }));
  assert.equal(target.records(), before); assert.deepEqual(source.external, []); assert.deepEqual(target.external, []);
});

async function overwriteFixture(t, targetOptions = {}) {
  const source = await fixture(t), target = await fixture(t, targetOptions);
  const original = await source.call('qg_create_note', noteInput('existing-note', { content: 'Before restore' }));
  target.service.store.put('card', original.id, source.service.store.get('card', original.id));
  await source.call('qg_update_note', { cardId: original.id, set: { content: 'After restore' }, expectedRevision: original.revision });
  await source.call('qg_update_annotation', { cardId: original.id, set: { note: 'Restored annotation', tags: ['restored'] }, expectedRevision: 0 });
  await source.call('qg_update_settings', { set: { sort: 'time', reduceTransparency: true }, expectedRevision: 0 });
  const added = await source.call('qg_create_note', noteInput('added-note', { title: 'Added fixture note' }));
  const backup = await source.call(TOOLS[0]);
  return { source, target, original, added, backup };
}

test('additive conflicts are whole-plan; explicit overwrite commits exactly once across HTTP/MCP and survives restart', async t => {
  const { source, target: f, original, added, backup } = await overwriteFixture(t);
  const beforePreview = f.ordinary();
  const additive = await f.call(TOOLS[1], { backup }); assert.equal(additive.mode, 'additive');
  assert.equal(f.ordinary(), beforePreview);
  const conflict = await f.raw(TOOLS[2], approval(additive, 'additive-conflict')); rejected(conflict); assert.equal(resultCode(conflict), 'BACKUP_CONFLICT');
  assert.equal(f.ordinary(), beforePreview, 'A conflict cannot import even the otherwise-new cards');
  const plan = await f.json('/api/backups/preview', { method: 'POST', body: { backup, mode: 'overwrite' } });
  assert.equal(plan.mode, 'overwrite'); assert.match(plan.planDigest, /^[a-f0-9]{64}$/); assert.ok(plan.approvalToken); assert.ok(plan.storeInstanceId); assert.ok(Number.isSafeInteger(plan.mutationEpoch));
  assert.equal(f.ordinary(), beforePreview);
  const input = approval(plan), beforeInvalid = f.records();
  for (const patch of [{ expectedPlanDigest: '0'.repeat(64) }, { approvalToken: 'wrong-fixture-token' }, { approved: false }, { mode: 'additive' }, { backup }, { storeInstanceId: 'another-store' }, { mutationEpoch: plan.mutationEpoch + 1 }]) {
    const response = await f.http('/api/backups/commit', { method: 'POST', body: { ...input, ...patch } });
    assert.ok(response.status >= 400); rejected(await f.raw(TOOLS[2], { ...input, ...patch })); assert.equal(f.records(), beforeInvalid);
  }
  const [http, mcp] = await Promise.all([f.json('/api/backups/commit', { method: 'POST', body: input }), f.call(TOOLS[2], input)]);
  assert.deepEqual(http, mcp); assert.equal(http.restoreId, plan.restoreId); assert.equal(http.status, 'committed');
  assert.equal((await f.call('qg_get_card', { cardId: original.id })).content, 'After restore');
  assert.equal((await f.call('qg_get_card', { cardId: added.id })).title, 'Added fixture note');
  const after = f.records();
  assert.deepEqual(await f.call(TOOLS[2], input), http); assert.equal(f.records(), after);
  rejected(await f.raw(TOOLS[2], { ...input, expectedPlanDigest: 'f'.repeat(64) })); assert.equal(f.records(), after);
  await f.restart();
  assert.deepEqual(await f.json('/api/backups/restores/' + http.restoreId), http);
  assert.deepEqual(await f.call(TOOLS[2], input), http); assert.equal(f.records(), after);
  assert.deepEqual(source.external, []); assert.deepEqual(f.external, []);
});

test('immediate undo keeps added cards and restores overwritten values with monotonically newer revisions and no ABA', async t => {
  const { target: f, original, added, backup } = await overwriteFixture(t);
  const plan = await f.call(TOOLS[1], { backup, mode: 'overwrite' }), committed = await f.call(TOOLS[2], approval(plan));
  const cardAfter = await f.call('qg_get_card', { cardId: original.id });
  const annotationAfter = await f.call('qg_read_annotation', { cardId: original.id });
  const settingsAfter = await f.call('qg_read_settings');
  assert.ok(cardAfter.revision > original.revision); assert.equal(committed.undo.available, true);
  await f.restart();
  const undone = await f.json('/api/backups/restores/' + committed.restoreId + '/undo', { method: 'POST', body: undoBody(committed) });
  assert.equal(undone.status, 'undone');
  const restored = await f.call('qg_get_card', { cardId: original.id });
  assert.equal(restored.content, original.content); assert.ok(restored.revision > cardAfter.revision);
  assert.equal((await f.call('qg_get_card', { cardId: added.id })).title, 'Added fixture note', 'Undo is not deletion of added cards');
  const annotation = await f.call('qg_read_annotation', { cardId: original.id });
  assert.deepEqual(annotation.values, { note: '', tags: [] }); assert.ok(annotation.revision > annotationAfter.revision);
  const settings = await f.call('qg_read_settings');
  assert.equal(settings.values.sort, 'priority'); assert.equal(settings.values.reduceTransparency, false); assert.ok(settings.revision > settingsAfter.revision);
  assert.ok(f.service.store.get('annotation', original.id), 'Absent-before annotations become explicit revisioned defaults');
  assert.ok(f.service.store.get('settings', 'workspace'), 'Absent-before settings become explicit revisioned defaults');
  const after = f.records();
  assert.deepEqual(await f.call(TOOLS[4], undoArgs(committed)), undone); assert.equal(f.records(), after);
  for (const [name, args] of [
    ['qg_update_note', { cardId: original.id, set: { content: 'Stale content' }, expectedRevision: original.revision }],
    ['qg_update_note', { cardId: original.id, set: { content: 'Stale content' }, expectedRevision: cardAfter.revision }],
    ['qg_update_annotation', { cardId: original.id, set: { note: 'Stale annotation' }, expectedRevision: 0 }],
    ['qg_update_annotation', { cardId: original.id, set: { note: 'Stale annotation' }, expectedRevision: annotationAfter.revision }],
    ['qg_update_settings', { set: { sort: 'unread' }, expectedRevision: 0 }],
    ['qg_update_settings', { set: { sort: 'unread' }, expectedRevision: settingsAfter.revision }],
  ]) { rejected(await f.raw(name, args)); assert.equal(f.records(), after); }
  assert.deepEqual(f.external, []);
});

test('preview binds current workspace and policy; new data and changed visibility require another preview', async t => {
  const { target: f, backup } = await overwriteFixture(t, { principals: [structuredClone(PRINCIPAL)] });
  const plan = await f.call(TOOLS[1], { backup, mode: 'overwrite' });
  assert.equal(plan.visibility.requiresAcknowledgement, true);
  const beforeDenied = f.records();
  const denied = await f.raw(TOOLS[2], approval(plan, 'missing-visibility', { acknowledgeVisibility: false })); rejected(denied); assert.equal(f.records(), beforeDenied);
  f.config.access.principals[0].resources.cardIds = [];
  const beforePolicy = f.records();
  rejected(await f.raw(TOOLS[2], approval(plan, 'stale-policy'))); assert.equal(f.records(), beforePolicy);
  const second = await f.call(TOOLS[1], { backup, mode: 'overwrite' });
  assert.equal(second.visibility.requiresAcknowledgement, false);
  await f.call('qg_create_note', noteInput('later-write'));
  const beforeEpoch = f.records();
  rejected(await f.raw(TOOLS[2], approval(second, 'stale-workspace'))); assert.equal(f.records(), beforeEpoch);
  const fresh = await f.call(TOOLS[1], { backup, mode: 'overwrite' });
  const committed = await f.call(TOOLS[2], approval(fresh, 'fresh-approval', { acknowledgeVisibility: false }));
  assert.equal(committed.status, 'committed'); assert.deepEqual(f.external, []);
});

test('commit and undo injected mid-write failures roll back content, epochs, receipts and audit before same-key retry', async t => {
  let failAt = 'after-write';
  const { target: f, backup } = await overwriteFixture(t, { options: { backupCheckpoint: stage => { if (stage === failAt) throw Error('Synthetic local transaction interruption'); } } });
  const plan = await f.call(TOOLS[1], { backup, mode: 'overwrite' }), input = approval(plan);
  const before = f.records(), beforeAudit = JSON.stringify(f.service.store.history(1000)), beforeEpoch = f.service.store.mutationState();
  rejected(await f.raw(TOOLS[2], input));
  assert.equal(f.records(), before); assert.equal(JSON.stringify(f.service.store.history(1000)), beforeAudit); assert.deepEqual(f.service.store.mutationState(), beforeEpoch);
  failAt = null;
  const committed = await f.json('/api/backups/commit', { method: 'POST', body: input });
  const after = f.records(), afterAudit = JSON.stringify(f.service.store.history(1000)), afterEpoch = f.service.store.mutationState();
  failAt = 'undo-after-write';
  rejected(await f.raw(TOOLS[4], undoArgs(committed)));
  assert.equal(f.records(), after); assert.equal(JSON.stringify(f.service.store.history(1000)), afterAudit); assert.deepEqual(f.service.store.mutationState(), afterEpoch);
  failAt = null;
  const undone = await f.call(TOOLS[4], undoArgs(committed)); assert.equal(undone.status, 'undone'); assert.deepEqual(f.external, []);
});

test('a later request reference or background job result blocks undo even when restored content is unchanged', async t => {
  await t.test('request reference', async t => {
    const { target: f, original, backup } = await overwriteFixture(t);
    const conversation = await f.call('qg_create_conversation', { title: 'Synthetic reference holder', idempotencyKey: 'holder' });
    const plan = await f.call(TOOLS[1], { backup, mode: 'overwrite' }), committed = await f.call(TOOLS[2], approval(plan));
    const restoredCard = f.service.store.get('card', original.id);
    await f.call('qg_create_request', { conversationId: conversation.id, question: 'Explicit synthetic question', cardIds: [original.id], idempotencyKey: 'later-reference' });
    assert.deepEqual(f.service.store.get('card', original.id), restoredCard);
    const latest = await f.call(TOOLS[3], { restoreId: committed.restoreId }); assert.equal(latest.undo.available, false);
    const before = f.records();
    const response = await f.http('/api/backups/restores/' + committed.restoreId + '/undo', { method: 'POST', body: undoBody(committed) });
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'BACKUP_STALE');
    rejected(await f.raw(TOOLS[4], undoArgs(committed))); assert.equal(f.records(), before); assert.deepEqual(f.external, []);
  });
  await t.test('background completion', async t => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { entered = resolve; });
    t.after(() => release());
    const { target: f, original, backup } = await overwriteFixture(t, { options: {
      // Keep trusted worker lease timers inert while this synthetic operation
      // is held; the completed registered operation still runs normally.
      jobsClock: { setInterval: () => ({ unref() {} }), clearInterval: () => {} },
      jobsCheckpoint: async stage => { if (stage === 'before-commit') { entered(); await gate; } },
    } });
    const job = await f.call('qg_create_job', { kind: 'recommendation-snapshot', schedule: { intervalSeconds: 3600, startAt: '2030-01-01T00:00:00Z' }, paused: true, idempotencyKey: 'held-job' });
    const run = await f.call('qg_run_job', { jobId: job.id, idempotencyKey: 'held-run' });
    await reached;
    const plan = await f.call(TOOLS[1], { backup, mode: 'overwrite' }), committed = await f.call(TOOLS[2], approval(plan));
    const restoredCard = f.service.store.get('card', original.id);
    assert.equal((await f.call(TOOLS[3], { restoreId: committed.restoreId })).undo.available, true);
    release(); await f.service.jobs.drain();
    assert.equal(f.service.store.get('job-run', run.id).status, 'completed');
    assert.deepEqual(f.service.store.get('card', original.id), restoredCard);
    assert.equal((await f.call(TOOLS[3], { restoreId: committed.restoreId })).undo.available, false);
    const before = f.records(); rejected(await f.raw(TOOLS[4], undoArgs(committed))); assert.equal(f.records(), before); assert.deepEqual(f.external, []);
  });
});

test('final evidence closure discloses newly readable pre-existing cards and requires explicit visibility acknowledgment', async t => {
  const source = await fixture(t), target = await fixture(t, { principals: [structuredClone(PRINCIPAL)] });
  const evidence = source.service.ingest({ sourceId: 'allowed', items: [{ externalId: 'missing-evidence', title: 'Synthetic restored evidence' }] }).cardIds[0];
  const derived = source.service.ingest({ sourceId: 'allowed', items: [{ externalId: 'already-stored', title: 'Pre-existing derived card', evidenceIds: [evidence] }] }).cardIds[0];
  target.service.store.put('card', derived, source.service.store.get('card', derived));
  assert.equal((await target.call('qg_search', {}, READER)).total, 0, 'An unresolved dependency hides an otherwise in-scope card');
  const exported = await source.call(TOOLS[0]); exported.payload.cards = exported.payload.cards.filter(card => card.id === evidence);
  const backup = reseal(exported), policyBefore = structuredClone(target.config.access);
  const plan = await target.call(TOOLS[1], { backup });
  assert.equal(plan.visibility.requiresAcknowledgement, true);
  assert.equal(plan.visibility.principals.length, 1);
  const disclosed = plan.visibility.principals[0];
  assert.equal(disclosed.id, 'fixture'); assert.equal(disclosed.newlyVisibleCount, 2);
  assert.deepEqual(disclosed.newlyVisibleCardIds, [evidence, derived].sort());
  assert.deepEqual(disclosed.sourceIds, ['allowed']);
  const before = target.records();
  rejected(await target.raw(TOOLS[2], approval(plan, 'no-ack', { acknowledgeVisibility: false }))); assert.equal(target.records(), before);
  const committed = await target.call(TOOLS[2], approval(plan, 'with-ack'));
  assert.equal((await target.call('qg_search', {}, READER)).total, 2);
  assert.deepEqual(target.config.access, policyBefore, 'No principal grant is created or changed by restore');
  // Newly added evidence stays after undo, so visibility cannot be represented
  // as retractable merely because the restore receipt can be undone.
  await target.call(TOOLS[4], undoArgs(committed));
  assert.equal((await target.call('qg_search', {}, READER)).total, 2);
  assert.deepEqual(target.external, []); assert.deepEqual(source.external, []);
});

test('preview visibility matches access traversal through cycles, missing evidence and out-of-scope dependencies without reading credentials', async t => {
  const f = await fixture(t, { principals: [structuredClone(PRINCIPAL)] });
  const policy = f.config.access.principals[0];
  Object.defineProperty(f.env, 'F11_READER', { configurable: true, get() { throw Error('Visibility analysis must not inspect token environment values'); } });
  const card = (id, evidenceIds = [], sourceId = 'allowed') => ({ id, sourceId, evidenceIds });
  const graphs = [
    [[], [card('a'), card('b', ['a'])]],
    [[], [card('a', ['b']), card('b', ['a']), card('self', ['self'])]],
    [[], [card('a', ['b']), card('b', ['a', 'missing']), card('safe')]],
    [[], [card('a', ['b']), card('b', ['a', 'hidden']), card('hidden', [], 'private'), card('safe')]],
    [[card('a', ['b'])], [card('a', ['b']), card('b')]],
    [[card('a', ['b']), card('b')], [card('a', ['b']), card('b', ['missing'])]],
  ];
  const readable = cards => {
    f.service.store.db.prepare("DELETE FROM records WHERE kind='card'").run();
    for (const entry of cards) f.service.store.put('card', entry.id, entry);
    return cards.filter(entry => f.service.access.canReadCard(entry, policy)).map(entry => entry.id).sort();
  };
  for (const [before, after] of graphs) {
    const previous = readable(before), expected = readable(after);
    const result = f.service.access.backupVisibility(before, after, after.map(entry => entry.id));
    assert.equal(result.requiresAcknowledgement, expected.length > 0);
    if (!expected.length) assert.deepEqual(result.principals, []);
    else {
      assert.deepEqual(result.principals[0].affectedVisibleCardIds, expected);
      assert.deepEqual(result.principals[0].newlyVisibleCardIds, expected.filter(id => !previous.includes(id)));
    }
  }
  policy.resources.cardIds = ['a'];
  const blocked = [card('a', ['b']), card('b')];
  assert.deepEqual(readable(blocked), []); assert.deepEqual(f.service.access.backupVisibility([], blocked, ['a', 'b']).principals, []);
  assert.deepEqual(f.external, []);
});
