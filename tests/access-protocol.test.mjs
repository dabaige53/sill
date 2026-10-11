/** F07 adversarial synthetic-principal tests through actual HTTP and MCP transports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { digest } from '../server/store.mjs';

const OWNER = 'f07-owner-fixture-only-012345678901234567890';
const ALPHA = 'f07-alpha-fixture-only-012345678901234567890';
const BETA = 'f07-beta-fixture-only-012345678901234567890';
const ALL_SAFE = ['qg_search', 'qg_get_card', 'qg_recommend', 'qg_create_note', 'qg_update_note', 'qg_read_annotation', 'qg_update_annotation', 'qg_feedback', 'qg_ingest'];
const READ = ['qg_search', 'qg_get_card', 'qg_recommend'];
const SECRET = 'OUTSIDE_BOUNDARY_PRIVATE_MARKER';
const cardId = (source, externalId) => `card_${digest([source, externalId]).slice(0, 32)}`;
const principal = (patch = {}) => ({ id: 'alpha', enabled: true, tokenEnv: 'F07_ALPHA', tools: READ, resources: { sourceIds: ['allowed'] }, ...patch });
async function fixture(t, { principals = [principal()], env = {}, now, seed } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'qg-access-protocol-'));
  const config = ConfigSchema.parse({ dataDir: directory, access: { principals } });
  const environment = { F07_ALPHA: ALPHA, F07_BETA: BETA, ...env }, external = [], clients = [];
  const service = new Service(config, { env: environment, ...(now ? { now } : {}), fetchImpl: async (...args) => { external.push(args); throw new Error('External calls are not authorized by this synthetic fixture'); } });
  for (const method of ['collect', 'tools', 'write']) service.connectors[method] = async (...args) => { external.push({ method, args }); throw new Error('Restricted protocol must not call external connectors'); };
  if (seed) seed(service);
  const server = await startHttp(service, { port: 0, token: OWNER }), origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { for (const client of clients) await client.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true }); });
  const http = (path, { token = ALPHA, method = 'GET', body, headers = {} } = {}) => fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  let sequence = 0;
  const rpc = async (method, params = {}, token = ALPHA) => { const response = await http('/mcp', { token, method: 'POST', body: { jsonrpc: '2.0', id: ++sequence, method, params }, headers: { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' } }); return { status: response.status, body: await response.json() }; };
  const raw = async (name, args = {}, token = ALPHA) => (await rpc('tools/call', { name, arguments: args }, token)).body;
  const call = async (name, args = {}, token = ALPHA) => { const response = await raw(name, args, token); assert.equal(response.error, undefined, JSON.stringify(response)); assert.notEqual(response.result?.isError, true, JSON.stringify(response)); return response.result.structuredContent; };
  const connect = async (token = ALPHA) => { const client = new Client({ name: 'quiet-glass-access-protocol-fixture', version: '1' }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); return client; };
  const records = () => JSON.stringify(Object.fromEntries(['card', 'annotation', 'note-key', 'conversation', 'message', 'request', 'action', 'workflow', 'settings'].map(kind => [kind, service.store.list(kind)])));
  return { service, config, env: environment, origin, http, rpc, raw, call, connect, external, records };
}
const denied = response => assert.ok(response.error || response.result?.isError === true, 'Expected denial: ' + JSON.stringify(response));
const noPrivate = value => assert.equal(JSON.stringify(value).includes(SECRET), false, 'Private out-of-scope content must not escape');
const seedCards = service => {
  service.ingest({ sourceId: 'private', items: [{ externalId: 'private', title: SECRET, content: SECRET }] });
  service.ingest({ sourceId: 'allowed', items: [{ externalId: 'one', title: 'Allowed first', content: 'Allowed first text' }, { externalId: 'two', title: 'Allowed second', content: 'Allowed second text' }, { externalId: 'derived', title: 'Derived private evidence', content: SECRET, evidenceIds: [cardId('private', 'private')] }] });
  service.ingest({ sourceId: 'allowed', items: [{ externalId: 'transitive', title: 'Transitive private evidence', content: SECRET, evidenceIds: [cardId('allowed', 'derived')] }] });
};

test('restricted MCP advertises only granted tools and rejects every hidden owner tool without side effects', async t => {
  const f = await fixture(t, { seed: seedCards }), restricted = await f.connect(), owner = await f.connect(OWNER);
  assert.deepEqual((await restricted.listTools()).tools.map(tool => tool.name).sort(), [...READ].sort());
  const ownerTools = (await owner.listTools()).tools.map(tool => tool.name);
  assert.equal(ownerTools.length, 44); assert.ok(ownerTools.includes('qg_open_workspace'));
  const before = f.records();
  for (const name of ownerTools.filter(name => !READ.includes(name))) {
    const response = await f.raw(name, { cardId: cardId('private', 'private'), requestId: 'request_private', workflowId: 'workflow_private', actionId: 'action_private', connectorId: 'private', approved: true });
    denied(response); noPrivate(response);
  }
  assert.equal(f.records(), before); assert.deepEqual(f.external, []);
  for (const method of ['resources/list', 'resources/templates/list', 'prompts/list']) {
    const response = (await f.rpc(method)).body;
    assert.ok(response.error || Object.values(response.result || {}).every(value => Array.isArray(value) && value.length === 0), method + ' must expose no global resource or prompt');
    noPrivate(response);
  }
  for (const uri of ['quiet-glass://feed', 'ui://quiet-glass/workspace']) denied((await f.rpc('resources/read', { uri })).body);
  denied((await f.rpc('prompts/get', { name: 'quiet-glass-briefing', arguments: { goal: 'Export private data' } })).body);
  assert.ok((await owner.listResources()).resources.some(resource => resource.uri === 'quiet-glass://feed'));
  assert.ok((await owner.listPrompts()).prompts.some(prompt => prompt.name === 'quiet-glass-briefing'));
  assert.deepEqual(f.external, []);
});

test('HTTP and MCP filter source plus transitive evidence before pagination, totals and recommendations', async t => {
  const f = await fixture(t, { seed: seedCards });
  const found = await f.call('qg_search', { limit: 1 });
  assert.equal(found.total, 2); assert.equal(found.items.length, 1); assert.equal(found.nextOffset, 1); noPrivate(found);
  const next = await f.call('qg_search', { limit: 1, offset: 1 });
  assert.equal(next.total, 2); assert.equal(next.nextOffset, null); assert.notEqual(found.items[0].id, next.items[0].id); noPrivate(next);
  const ranked = await f.call('qg_recommend', { limit: 50, includeRead: true });
  assert.equal(ranked.items.length, 2); noPrivate(ranked);
  const feed = await f.http('/api/feed'); assert.equal(feed.status, 200); assert.equal((await feed.json()).total, 2);
  for (const id of [cardId('private', 'private'), cardId('allowed', 'derived'), cardId('allowed', 'transitive'), 'card_missing']) {
    const response = await f.raw('qg_get_card', { cardId: id }); denied(response); noPrivate(response);
    const http = await f.http('/api/cards/' + id); assert.ok([403, 404].includes(http.status)); noPrivate(await http.json());
  }
  const allowed = await f.call('qg_get_card', { cardId: cardId('allowed', 'one') });
  assert.equal(allowed.title, 'Allowed first'); assert.equal(Object.hasOwn(allowed, 'annotation'), false, 'Annotation grant is separate from card reading');
  const escape = await f.raw('qg_search', { sourceIds: ['private'] }); noPrivate(escape);
  if (!escape.error && !escape.result?.isError) assert.equal(escape.result.structuredContent.total, 0);
  const ownerResult = await f.call('qg_search', {}, OWNER); assert.equal(ownerResult.total, 5); assert.ok(JSON.stringify(ownerResult).includes(SECRET));
});

test('sourceIds are mandatory and optional cardIds only narrow the source boundary', async t => {
  const f = await fixture(t, { principals: [principal({ resources: { sourceIds: ['allowed'], cardIds: [cardId('allowed', 'one'), cardId('private', 'private')] } })], seed: seedCards });
  const result = await f.call('qg_search'); assert.equal(result.total, 1); assert.equal(result.items[0].id, cardId('allowed', 'one')); noPrivate(result);
  denied(await f.raw('qg_get_card', { cardId: cardId('allowed', 'two') }));
  denied(await f.raw('qg_get_card', { cardId: cardId('private', 'private') }));
  f.config.access.principals[0].resources.cardIds = [];
  assert.equal((await f.call('qg_search')).total, 0, 'Present empty cardIds means no cards');
  f.config.access.principals[0].resources.sourceIds = [];
  f.config.access.principals[0].resources.cardIds = [cardId('allowed', 'one')];
  assert.equal((await f.call('qg_search')).total, 0, 'Card IDs cannot grant a source');
});

test('restricted REST never reaches global settings, conversations, source operations, AI, workflow or export routes', async t => {
  const f = await fixture(t, { seed: seedCards });
  const conversation = f.service.createConversation({ title: SECRET, idempotencyKey: 'owner-conversation' });
  const request = f.service.createRequest({ conversationId: conversation.id, question: SECRET, cardIds: [cardId('private', 'private')], idempotencyKey: 'owner-question' });
  const before = f.records();
  const routes = [
    ['GET', '/api/status'], ['GET', '/api/settings'], ['PATCH', '/api/settings', { set: { sort: 'time' }, expectedRevision: 0 }],
    ['GET', '/api/ai'], ['POST', '/api/collect', { connectorIds: ['private'] }], ['GET', '/api/workflows/workflow_private'],
    ['GET', '/api/conversations'], ['GET', '/api/conversations/' + conversation.id], ['POST', '/api/conversations', { title: 'Bypass', idempotencyKey: 'bypass' }],
    ['GET', '/api/requests'], ['GET', '/api/requests/' + request.id], ['POST', '/api/requests', { question: 'Bypass', cardIds: [] }],
    ['POST', '/api/requests/' + request.id + '/answer', { answer: 'Bypass', evidenceIds: [] }],
    ['GET', '/api/requests/' + request.id + '/ai'], ['GET', '/api/requests/' + request.id + '/ai/events'],
    ['POST', '/api/requests/' + request.id + '/ai/start', {}], ['POST', '/api/requests/' + request.id + '/ai/cancel', {}],
    ['GET', '/api/export'], ['GET', '/api/admin'], ['POST', '/api/tools/qg_status', {}],
  ];
  for (const [method, path, body] of routes) { const response = await f.http(path, { method, body }); assert.ok([403, 404].includes(response.status), method + ' ' + path + ': ' + response.status); noPrivate(await response.json()); }
  assert.equal(f.records(), before); assert.deepEqual(f.external, []);
  const owner = await f.http('/api/requests/' + request.id, { token: OWNER }); assert.equal(owner.status, 200); assert.equal((await owner.json()).question, SECRET);
});

test('bearer identity is authoritative over browser cookies and restricted tokens cannot mint owner sessions', async t => {
  const f = await fixture(t, { seed: seedCards });
  const login = await f.http('/api/session', { token: null, method: 'POST', body: { token: OWNER } }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.http('/api/status', { token: null, headers: { Cookie: cookie } })).status, 200);
  for (const value of [ALPHA, BETA, 'wrong', '', 'a'.repeat(8192)]) {
    const attempt = await f.http('/api/session', { token: null, method: 'POST', body: { token: value } });
    assert.ok([400, 401].includes(attempt.status)); assert.equal(attempt.headers.get('set-cookie'), null); noPrivate(await attempt.json());
  }
  assert.equal((await f.http('/api/status', { token: 'wrong', headers: { Cookie: cookie } })).status, 401, 'Invalid bearer must not fall back to cookie');
  assert.equal((await f.http('/api/status', { token: ALPHA, headers: { Cookie: cookie } })).status, 403, 'Restricted bearer must not inherit owner cookie');
  assert.equal((await f.http('/mcp', { token: null, method: 'POST', body: {}, headers: { Cookie: cookie } })).status, 401);
  for (const authorization of ['Basic ' + ALPHA, 'Bearer', 'Bearer ' + ALPHA + ', Bearer ' + OWNER, 'bearer ' + ALPHA]) {
    assert.equal((await f.http('/api/feed', { token: null, headers: { Authorization: authorization } })).status, 401);
  }
  assert.equal((await f.http('/api/feed', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const hostileHost = await new Promise((resolve, reject) => { const request = httpRequest(f.origin + '/api/feed', { headers: { Host: 'evil.example', Authorization: `Bearer ${ALPHA}` } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); }); request.on('error', reject); request.end(); });
  assert.equal(hostileHost, 403);
  assert.equal((await f.http('/api/feed', { token: null })).status, 401);
});

test('existing and missing out-of-scope records produce generic read and conflict denials', async t => {
  const f = await fixture(t, { principals: [principal({ tools: ALL_SAFE, resources: { sourceIds: ['allowed'], ingestSourceIds: ['allowed'] } })], seed: seedCards });
  const note = f.service.createNote({ title: SECRET, content: SECRET, idempotencyKey: 'private-note' });
  f.service.updateAnnotation({ cardId: note.id, set: { note: SECRET }, expectedRevision: 0 });
  for (const [name, args] of [
    ['qg_get_card', { cardId: note.id }],
    ['qg_update_note', { cardId: note.id, set: { title: 'Try stale conflict' }, expectedRevision: 0 }],
    ['qg_read_annotation', { cardId: note.id }],
    ['qg_update_annotation', { cardId: note.id, set: { note: 'Try stale conflict' }, expectedRevision: 0 }],
    ['qg_feedback', { cardId: note.id, state: { bookmarked: true } }],
  ]) {
    const existing = await f.raw(name, args), missing = await f.raw(name, { ...args, cardId: 'local_note_missing' });
    denied(existing); denied(missing); noPrivate(existing); noPrivate(missing);
    assert.deepEqual(existing.result?.structuredContent ?? existing.error, missing.result?.structuredContent ?? missing.error, name + ' must not provide an existence oracle');
  }
  const stale = await f.http('/api/notes/' + note.id, { method: 'PATCH', body: { set: { title: 'Bypass' }, expectedRevision: 0 } });
  assert.equal(stale.status, 403); noPrivate(await stale.json());
  assert.equal(f.service.getCard(note.id).content, SECRET);
});

test('legacy ingest requires separate source write grants and checks an entire batch before mutation', async t => {
  const f = await fixture(t, { principals: [principal({ tools: ALL_SAFE, resources: { sourceIds: ['allowed'], ingestSourceIds: ['allowed'] } })], seed: seedCards });
  const saved = await f.call('qg_ingest', { sourceId: 'allowed', items: [{ externalId: 'actor-added', title: 'Authorized local source', evidenceIds: [cardId('allowed', 'one')] }] });
  assert.equal(saved.count, 1);
  const before = f.records();
  const attempts = [
    { sourceId: 'private', items: [{ externalId: 'forged', title: 'Not permitted' }] },
    { sourceId: 'allowed', items: [{ externalId: 'fresh', title: 'Would be valid' }, { externalId: 'bad', title: 'Hidden reference', evidenceIds: [cardId('private', 'private')] }] },
    { sourceId: 'allowed', items: [{ externalId: 'bad', title: 'Transitive hidden reference', evidenceIds: [cardId('allowed', 'derived')] }] },
    { sourceId: 'allowed', items: [{ externalId: 'bad', title: 'Missing reference', evidenceIds: ['card_missing'] }] },
    { sourceId: 'allowed', items: [{ externalId: 'derived', title: 'Overwrite inaccessible existing source' }] },
  ];
  for (const input of attempts) { const response = await f.raw('qg_ingest', input); denied(response); noPrivate(response); assert.equal(f.records(), before); }
  const noWrite = await fixture(t, { principals: [principal({ tools: ['qg_ingest'], resources: { sourceIds: ['allowed'] } })] });
  denied(await noWrite.raw('qg_ingest', { sourceId: 'allowed', items: [{ externalId: 'one', title: 'No separate ingestion grant' }] }));
  assert.equal(noWrite.service.store.list('card').length, 0); assert.deepEqual(f.external, []);
});

test('concurrent distinct principals and owner retain actor-scoped durable note idempotency and audit attribution', async t => {
  const tools = ['qg_create_note', 'qg_update_note', 'qg_get_card'], resources = { sourceIds: ['local-notes'] };
  const f = await fixture(t, { principals: [principal({ tools, resources }), principal({ id: 'beta', tokenEnv: 'F07_BETA', tools, resources })] });
  const inputs = [ALPHA, BETA, OWNER].map((token, i) => ({ token, body: { title: 'Actor ' + i, content: 'Actor-private-payload-' + i, idempotencyKey: 'same-caller-supplied-key' } }));
  const results = await Promise.all(inputs.map(({ token, body }) => f.call('qg_create_note', body, token)));
  assert.equal(new Set(results.map(item => item.id)).size, 3, 'Identical caller keys are isolated by actor');
  const retries = await Promise.all(inputs.map(({ token, body }) => f.call('qg_create_note', body, token)));
  assert.deepEqual(retries.map(item => item.id), results.map(item => item.id));
  for (let i = 0; i < inputs.length; i++) {
    const response = await f.raw('qg_create_note', { ...inputs[i].body, title: 'Different payload' }, inputs[i].token); denied(response);
    assert.equal(JSON.stringify(response).includes('Actor-private-payload-'), false);
  }
  assert.equal(f.service.store.list('card').length, 3);
  const events = f.service.store.history(100).filter(event => event.event === 'note_created'); assert.equal(events.length, 3);
  for (let i = 0; i < results.length; i++) {
    const event = events.find(event => event.detail.id === results[i].id); assert.ok(event);
    assert.ok(JSON.stringify(event).includes(i === 0 ? 'alpha' : i === 1 ? 'beta' : 'owner'), 'Audit should attribute the exact actor');
  }
  const audit = JSON.stringify(f.service.store.history(100));
  for (const secret of [OWNER, ALPHA, BETA, ...inputs.map(item => item.body.content), 'same-caller-supplied-key']) assert.equal(audit.includes(secret), false);
  const persisted = JSON.stringify(f.service.store.list('note-key'));
  for (const secret of [OWNER, ALPHA, BETA]) assert.equal(persisted.includes(secret), false);
});

test('revocation and token rotation take effect for already initialized HTTP MCP clients', async t => {
  const f = await fixture(t, { seed: seedCards }), client = await f.connect();
  assert.equal((await client.callTool({ name: 'qg_search', arguments: {} })).structuredContent.total, 2);
  f.config.access.principals[0].enabled = false;
  assert.equal((await f.http('/api/feed')).status, 401);
  await assert.rejects(() => client.callTool({ name: 'qg_search', arguments: {} }));
  f.config.access.principals[0].enabled = true;
  assert.equal((await f.http('/api/feed')).status, 200);
  const rotated = 'f07-rotated-fixture-only-012345678901234567890';
  f.env.F07_ALPHA = rotated;
  assert.equal((await f.http('/api/feed')).status, 401);
  await assert.rejects(() => client.listTools());
  assert.equal((await f.http('/api/feed', { token: rotated })).status, 200);
  delete f.env.F07_ALPHA;
  assert.equal((await f.http('/api/feed', { token: rotated })).status, 401);
  assert.equal((await f.http('/api/feed', { token: OWNER })).status, 200);
});

test('empty and disabled principals default deny without inheriting owner discovery or cards', async t => {
  const disabled = await fixture(t, { principals: [{ id: 'alpha', tokenEnv: 'F07_ALPHA' }] });
  assert.equal((await disabled.http('/api/feed')).status, 401);
  const noTools = await fixture(t, { principals: [principal({ tools: [], resources: { sourceIds: ['allowed'] } })], seed: seedCards });
  denied(await noTools.raw('qg_search'));
  const discovery = (await noTools.rpc('tools/list')).body;
  assert.ok(discovery.error || discovery.result?.tools.length === 0); noPrivate(discovery);
  const noSources = await fixture(t, { principals: [principal({ resources: {} })], seed: seedCards });
  assert.equal((await noSources.call('qg_search')).total, 0);
  denied(await noSources.raw('qg_get_card', { cardId: cardId('allowed', 'one') }));
});

test('strict access configuration rejects wildcard, unknown, duplicate and unsafe grants', () => {
  const valid = principal();
  const cases = [
    { ...valid, id: 'owner' }, { ...valid, extra: true }, { ...valid, token: ALPHA }, { ...valid, tokenEnv: 'invalid-name' },
    { ...valid, tools: ['*'] }, { ...valid, tools: ['qg_status'] }, { ...valid, tools: ['qg_start_ai'] }, { ...valid, tools: ['qg_open_workspace'] },
    { ...valid, tools: ['qg_search', 'qg_search'] }, { ...valid, resources: { sourceIds: ['*'] } },
    { ...valid, resources: { sourceIds: ['allowed'], cardIds: ['*'] } },
    { ...valid, resources: { sourceIds: ['allowed'], ingestSourceIds: ['private'] } },
    { ...valid, resources: { sourceIds: ['allowed'], unknown: true } },
    { ...valid, limits: { requestsPerMinute: 0 } }, { ...valid, limits: { maxRequestBytes: 0 } }, { ...valid, limits: { maxConcurrent: 0 } },
  ];
  for (const value of cases) assert.equal(ConfigSchema.safeParse({ access: { principals: [value] } }).success, false, JSON.stringify(value));
  assert.equal(ConfigSchema.safeParse({ access: { principals: [valid, valid] } }).success, false);
  assert.equal(ConfigSchema.safeParse({ access: { enabled: true } }).success, false);
});

test('restricted request byte and per-principal rate bounds reject before mutating state', async t => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock, principals: [principal({ tools: ALL_SAFE, resources: { sourceIds: ['local-notes'] }, limits: { maxRequestBytes: 2048, requestsPerMinute: 3, maxConcurrent: 1 } })] });
  const first = await f.http('/api/feed'); assert.equal(first.status, 200);
  const second = await f.http('/api/feed'); assert.equal(second.status, 200);
  const third = await f.http('/api/feed'); assert.equal(third.status, 200);
  const exhausted = await f.http('/api/feed'); assert.equal(exhausted.status, 429);
  assert.equal((await f.http('/api/feed', { token: OWNER })).status, 200, 'Restricted rate use must not affect owner');
  clock += 61000;
  assert.equal((await f.http('/api/feed')).status, 200);
  const over = await f.http('/api/notes', { method: 'POST', body: { title: 'Too large', content: 'x'.repeat(3000), idempotencyKey: 'oversized' } });
  assert.ok([413, 400].includes(over.status)); assert.equal(f.service.store.list('card').length, 0);
  clock += 61000;
  const oversizedMcp = await f.raw('qg_create_note', { title: 'Too large', content: 'x'.repeat(3000), idempotencyKey: 'oversized-mcp' });
  assert.ok(oversizedMcp.error || oversizedMcp.result?.isError || oversizedMcp.code); assert.equal(f.service.store.list('card').length, 0);
});


test('aliased principal or owner credential values fail closed, including disabled aliases', async t => {
  const duplicate = await fixture(t, { principals: [principal(), principal({ id: 'beta', tokenEnv: 'F07_BETA', enabled: false })], env: { F07_BETA: ALPHA } });
  assert.equal((await duplicate.http('/api/feed')).status, 401);
  assert.equal((await duplicate.http('/api/feed', { token: OWNER })).status, 200);
  const ownerAlias = await fixture(t, { env: { F07_ALPHA: OWNER } });
  assert.equal((await ownerAlias.http('/api/feed', { token: OWNER })).status, 401, 'Principal value cannot become the owner identity');
  assert.equal((await ownerAlias.http('/api/session', { token: null, method: 'POST', body: { token: OWNER } })).status, 401);
  const short = await fixture(t, { env: { F07_ALPHA: 'too-short' } });
  assert.equal((await short.http('/api/feed', { token: 'too-short' })).status, 401);
  assert.equal((await short.http('/api/feed', { token: OWNER })).status, 200);
});

test('actual overlapping HTTP requests enforce the principal concurrency cap without blocking another actor', async t => {
  const tools = [...READ, 'qg_create_note'], resources = { sourceIds: ['local-notes'] };
  const f = await fixture(t, { principals: [principal({ tools, resources, limits: { maxConcurrent: 1 } }), principal({ id: 'beta', tokenEnv: 'F07_BETA', tools, resources })] });
  let finish;
  const pending = new Promise((resolve, reject) => {
    const request = httpRequest(f.origin + '/api/notes', { method: 'POST', headers: { Authorization: `Bearer ${ALPHA}`, 'Content-Type': 'application/json' } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject); request.write('{"title":"In-flight synthetic note",'); finish = () => request.end('"content":"bounded","idempotencyKey":"held-request"}');
  });
  // Waiting for the independent socket to enter the server avoids conflating
  // queued TCP delivery with the application's concurrency accounting.
  await new Promise(resolve => setTimeout(resolve, 40));
  try {
    assert.equal((await f.http('/api/feed')).status, 429);
    assert.equal((await f.http('/api/feed', { token: BETA })).status, 200);
    assert.equal((await f.http('/api/feed', { token: OWNER })).status, 200);
  } finally { finish(); }
  assert.equal((await pending).status, 201);
  assert.equal((await f.http('/api/feed')).status, 200, 'The completed request releases its slot');
  assert.equal(f.service.store.list('card').length, 1);
});


test('host-assisted provenance cannot be forged even when the reserved source is explicitly in read and ingest bounds', async t => {
  const f = await fixture(t, { principals: [principal({ tools: ['qg_ingest', 'qg_search'], resources: { sourceIds: ['host-linear'], ingestSourceIds: ['host-linear'] } })] });
  const payload = { mode: 'host-assisted', sourceId: 'host-linear', items: [{ externalId: 'fixture-issue', title: 'Restricted host claim', content: 'Caller supplied source text', url: 'https://linear.app/fixture/issue/FIX-1/restricted', kind: 'task', truncated: false, expectedRevision: 0, provenance: { provider: 'linear', upstreamId: 'fixture-issue', scope: { accountId: 'fixture-account', workspaceId: 'fixture-workspace' }, retrievedAt: '2026-10-11T06:00:00Z', partial: false, contentOrigin: 'upstream-original' } }] };
  const response = await f.raw('qg_ingest', payload); denied(response);
  assert.equal(f.service.store.list('card').length, 0);
  const owner = await f.call('qg_ingest', payload, OWNER); assert.equal(owner.count, 1, 'Owner host-assisted ingestion remains compatible');
  const stale = structuredClone(payload); stale.items[0].content = SECRET;
  const attempt = await f.raw('qg_ingest', stale); denied(attempt); noPrivate(attempt);
  assert.equal(f.service.getCard(owner.cardIds[0]).content, 'Caller supplied source text');
  assert.deepEqual(f.external, []);
});

test('annotation update grant cannot be used as a read bypass for pre-existing private annotation fields', async t => {
  const f = await fixture(t, { principals: [principal({ tools: ['qg_update_annotation', 'qg_get_card'], resources: { sourceIds: ['allowed'] } })], seed: seedCards });
  const id = cardId('allowed', 'one');
  f.service.updateAnnotation({ cardId: id, set: { note: SECRET, tags: ['PrivateTag'] }, expectedRevision: 0 });
  noPrivate(await f.call('qg_get_card', { cardId: id }));
  const stale = await f.raw('qg_update_annotation', { cardId: id, set: { tags: ['NewTag'] }, expectedRevision: 0 });
  noPrivate(stale);
  const current = await f.raw('qg_update_annotation', { cardId: id, set: { tags: ['NewTag'] }, expectedRevision: 1 });
  noPrivate(current);
});
