/** F06 synthetic authorized-host imports through the real authenticated MCP/HTTP service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const token = 'provenance-protocol-test-only-012345678901234567890';
const retrievedAt = '2026-10-11T06:00:00Z';
const sources = {
  notion: { externalId: '11111111-1111-1111-1111-111111111111', title: 'Notion source document', kind: 'note', url: 'https://www.notion.so/fixture-workspace/Design-11111111111111111111111111111111', scope: { accountId: 'fixture-notion-account', workspaceId: 'fixture-workspace' } },
  'google-calendar': { externalId: 'event-shared', title: 'Calendar source event', kind: 'event', url: 'https://calendar.google.com/calendar/event?eid=fixture-event', scope: { accountId: 'fixture-calendar-account', calendarId: 'fixture-calendar' }, start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:00:00Z' },
  linear: { externalId: 'issue-shared', title: 'Linear source issue', kind: 'task', url: 'https://linear.app/fixture-workspace/issue/QUI-123/fixture-title', scope: { accountId: 'fixture-linear-account', workspaceId: 'fixture-workspace' } },
};
function imported(provider = 'notion', patch = {}) {
  const { scope, ...source } = sources[provider];
  const item = { ...source, content: `Original ${provider} tool-result text.`, summary: `Model summary of ${provider}; never source text.`, tags: ['host-fixture'], truncated: false, expectedRevision: 0,
    provenance: { provider, upstreamId: source.externalId, scope: { ...scope }, retrievedAt, upstreamUpdatedAt: '2026-10-10T05:00:00Z', partial: false, contentOrigin: 'upstream-original', summaryOrigin: 'model-summary' }, ...patch };
  return { mode: 'host-assisted', sourceId: `host-${provider}`, items: [item] };
}
const clone = value => structuredClone(value);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'qg-provenance-protocol-'));
  const external = [];
  const service = new Service(ConfigSchema.parse({ dataDir: directory }), { env: {}, fetchImpl: async (...args) => { external.push(args); throw new Error('No provider request is authorized in this fixture'); } });
  for (const method of ['collect', 'tools', 'write']) service.connectors[method] = async (...args) => { external.push({ method, args }); throw new Error('Host import must not call a configured connector'); };
  const server = await startHttp(service, { port: 0, token }), origin = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: 'quiet-glass-provenance-protocol-fixture', version: '1' });
  t.after(async () => { await client.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true }); });
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const raw = (name, args = {}) => client.callTool({ name, arguments: args });
  const call = async (name, args = {}) => { const result = await raw(name, args); assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent; };
  const http = async path => { const response = await fetch(origin + path, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(response.status, 200); return response.json(); };
  const records = () => JSON.stringify({ cards: service.store.list('card'), history: service.store.history(1000) });
  return { service, client, raw, call, http, origin, external, records };
}

// These fixtures model app results already read by an authorized host. They do
// not claim to prove a real app connection, authorization, or native installation.
test('host-provided Notion, Calendar and Linear provenance survives MCP, HTTP and app bootstrap without provider calls', async t => {
  const f = await fixture(t), ids = [];
  for (const provider of Object.keys(sources)) {
    const payload = imported(provider), item = payload.items[0];
    const result = await f.call('qg_ingest', payload);
    assert.equal(result.count, 1); ids.push(result.cardIds[0]);
    const card = await f.call('qg_get_card', { cardId: result.cardIds[0] });
    assert.equal(card.sourceId, payload.sourceId); assert.equal(card.revision, 1);
    for (const field of ['externalId', 'title', 'url', 'content', 'summary', 'truncated']) assert.equal(card[field], item[field]);
    for (const [key, value] of Object.entries(item.provenance)) assert.deepEqual(card.provenance[key], value);
    assert.equal(card.provenance.attribution, 'host-asserted'); assert.equal(card.provenance.mode, 'host-assisted');
    assert.deepEqual(await f.http('/api/cards/' + card.id), card, 'HTTP and MCP use the same source record');
    assert.equal(card.annotation.revision, 0); assert.equal(card.local, undefined);
  }
  assert.equal(new Set(ids).size, 3);
  assert.equal((await fetch(f.origin + '/api/feed')).status, 401);
  assert.equal((await fetch(f.origin + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await f.http('/api/feed')).total, 3);
  const tools = (await f.client.listTools()).tools, ingest = tools.find(tool => tool.name === 'qg_ingest');
  assert.equal(ingest.inputSchema.additionalProperties, false); assert.equal(ingest.annotations.openWorldHint, false);
  const workspace = await f.call('qg_status'); assert.deepEqual(workspace.connectors, []);
  const opened = await f.raw('qg_open_workspace'); assert.notEqual(opened.isError, true);
  const bootstrap = opened._meta['quiet-glass/workspace'].recommendations.items;
  for (const id of ids) {
    const card = bootstrap.find(item => item.card.id === id)?.card;
    assert.ok(card, 'each host source is available in bounded app bootstrap');
    assert.equal(card.provenance.attribution, 'host-asserted');
    assert.equal(card.provenance.retrievedAt, retrievedAt);
  }
  assert.deepEqual(f.external, []); assert.equal(f.service.store.list('action').length, 0);
  assert.equal(JSON.stringify(opened).includes(token), false);
});

test('HTTP host ingestion enforces auth, origin, strict schema and conflict status with MCP parity', async t => {
  const f = await fixture(t), payload = imported('google-calendar');
  const send = (body, extra = {}, path = '/api/ingest') => fetch(f.origin + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  assert.equal((await send(payload, { Authorization: '' })).status, 401);
  assert.equal((await send(payload, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(payload, {}, '/api/ingest?unexpected=1')).status, 400);
  assert.equal((await f.call('qg_search')).total, 0);
  const response = await send(payload); assert.equal(response.status, 200); const created = await response.json();
  assert.equal(created.replayed, 0); assert.equal(created.items[0].replayed, false);
  const current = await f.call('qg_get_card', { cardId: created.cardIds[0] });
  assert.deepEqual(await f.http('/api/cards/' + current.id), current);
  const replay = await f.call('qg_ingest', payload); assert.equal(replay.replayed, 1); assert.deepEqual(replay.cardIds, created.cardIds);
  const stale = clone(payload); stale.items[0].content = 'A different payload cannot reuse create revision';
  const conflict = await send(stale); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'INGEST_CONFLICT');
  const invalid = clone(payload); invalid.items[0].url = 'https://evil.example/calendar/event?eid=fixture-event';
  assert.equal((await send(invalid)).status, 400); assert.deepEqual(await f.call('qg_get_card', { cardId: current.id }), current);
  assert.deepEqual(f.external, []);
});

test('same upstream ID is deduplicated only inside its provider/account/workspace or calendar scope', async t => {
  const f = await fixture(t);
  for (const provider of Object.keys(sources)) {
    const base = imported(provider), first = await f.call('qg_ingest', base), before = await f.call('qg_get_card', { cardId: first.cardIds[0] });
    const replay = await f.call('qg_ingest', clone(base));
    assert.equal(replay.replayed, 1); assert.equal(replay.items[0].replayed, true); assert.deepEqual(replay.cardIds, first.cardIds); assert.deepEqual(await f.call('qg_get_card', { cardId: first.cardIds[0] }), before, 'exact replay never bumps revision or collection timestamp');
    const otherAccount = clone(base); otherAccount.items[0].provenance.scope.accountId += '-other';
    const otherSpace = clone(base), scopeField = provider === 'google-calendar' ? 'calendarId' : 'workspaceId';
    otherSpace.items[0].provenance.scope[scopeField] += '-other';
    const variants = await Promise.all([f.call('qg_ingest', otherAccount), f.call('qg_ingest', otherSpace)]);
    assert.equal(new Set([first.cardIds[0], ...variants.map(result => result.cardIds[0])]).size, 3);
  }
  assert.equal((await f.call('qg_search')).total, 9); assert.deepEqual(f.external, []);
});

test('host updates use CAS; exact stale retries return the current record without rolling back source, state or annotations', async t => {
  const f = await fixture(t), original = imported();
  const first = await f.call('qg_ingest', original), id = first.cardIds[0];
  await f.call('qg_feedback', { cardId: id, state: { bookmarked: true, read: true } });
  await f.call('qg_update_annotation', { cardId: id, set: { note: 'User-only annotation', tags: ['personal'] }, expectedRevision: 0 });
  const update = clone(original); update.items[0].expectedRevision = 1; update.items[0].content = 'New original source text'; update.items[0].provenance.retrievedAt = '2026-10-11T06:30:00Z'; update.items[0].provenance.upstreamUpdatedAt = '2026-10-11T06:20:00Z';
  const saved = await f.call('qg_ingest', update); assert.deepEqual(saved.cardIds, [id]);
  const current = await f.call('qg_get_card', { cardId: id }); assert.equal(current.revision, 2); assert.equal(current.content, update.items[0].content);
  assert.equal(current.state.bookmarked, true); assert.equal(current.state.read, true); assert.equal(current.annotation.values.note, 'User-only annotation');
  for (const retry of [original, update]) { await f.call('qg_ingest', clone(retry)); assert.deepEqual(await f.call('qg_get_card', { cardId: id }), current); }
  for (const revision of [0, 1, 99]) {
    const stale = clone(update); stale.items[0].expectedRevision = revision; stale.items[0].content = 'Stale replacement that must be rejected';
    const before = f.records(), result = await f.raw('qg_ingest', stale);
    assert.equal(result.isError, true); assert.equal(f.records(), before, 'failed CAS must not change cards or audit');
  }
  assert.deepEqual(f.external, []);
});

test('strict host provenance rejects invalid provider, scope, source, URL and source/summary claims without side effects', async t => {
  const f = await fixture(t);
  const cases = [
    ['unknown mode', p => p.mode = 'trusted-host'],
    ['unknown provider', p => p.items[0].provenance.provider = 'unrecognized'],
    ['source mismatch', p => p.sourceId = 'host-linear'],
    ['unreserved source', p => p.sourceId = 'notion'],
    ['missing provenance', p => delete p.items[0].provenance],
    ['missing scope', p => delete p.items[0].provenance.scope],
    ['missing account', p => delete p.items[0].provenance.scope.accountId],
    ['blank account', p => p.items[0].provenance.scope.accountId = '   '],
    ['missing workspace', p => delete p.items[0].provenance.scope.workspaceId],
    ['wrong scope kind', p => p.items[0].provenance.scope.calendarId = 'wrong'],
    ['unknown scope field', p => p.items[0].provenance.scope.secret = 'not accepted'],
    ['mismatched upstream identity', p => p.items[0].provenance.upstreamId = 'other'],
    ['missing retrieval time', p => delete p.items[0].provenance.retrievedAt],
    ['invalid retrieval time', p => p.items[0].provenance.retrievedAt = 'yesterday'],
    ['missing partial marker', p => delete p.items[0].provenance.partial],
    ['missing source content', p => delete p.items[0].content],
    ['missing truncation marker', p => delete p.items[0].truncated],
    ['provider-kind mismatch', p => p.items[0].kind = 'event'],
    ['forged attestation', p => p.items[0].provenance.attribution = 'verified'],
    ['unknown source origin', p => p.items[0].provenance.contentOrigin = 'original'],
    ['model content as original text', p => p.items[0].provenance.contentOrigin = 'model-summary'],
    ['unlabeled summary', p => delete p.items[0].provenance.summaryOrigin],
    ['missing URL', p => delete p.items[0].url],
    ['plain HTTP URL', p => p.items[0].url = 'http://www.notion.so/page'],
    ['javascript URL', p => p.items[0].url = 'javascript:alert(1)'],
    ['off-provider URL', p => p.items[0].url = 'https://example.com/page'],
    ['provider login is not source', p => p.items[0].url = 'https://www.notion.so/login'],
    ['provider marketing page is not source', p => p.items[0].url = 'https://www.notion.so/product'],
    ['provider redirect is not source', p => p.items[0].url = 'https://www.notion.so/redirect?url=https%3A%2F%2Fevil.example'],
    ['deceptive hostname', p => p.items[0].url = 'https://notion.so.evil.example/page'],
    ['credential URL', p => p.items[0].url = 'https://user:secret@www.notion.so/page'],
    ['missing expected revision', p => delete p.items[0].expectedRevision],
    ['negative expected revision', p => p.items[0].expectedRevision = -1],
    ['unexpected item data', p => p.items[0].credentials = 'not accepted'],
    ['unexpected top-level data', p => p.accessToken = 'not accepted'],
    ['duplicate scoped identity', p => p.items.push(clone(p.items[0]))],
  ];
  for (const [label, mutate] of cases) {
    const payload = imported(); mutate(payload); const before = f.records();
    const result = await f.raw('qg_ingest', payload);
    assert.equal(result.isError, true, label + ': ' + JSON.stringify(result)); assert.equal(f.records(), before, label + ' must be atomic');
  }
  for (const sourceId of ['host-notion', 'host-google-calendar', 'host-linear', 'local-notes']) {
    const result = await f.raw('qg_ingest', { sourceId, items: [{ externalId: 'forged', title: 'Legacy route cannot claim host source' }] });
    assert.equal(result.isError, true, sourceId);
  }
  for (const provider of ['google-calendar', 'linear']) {
    const payload = imported(provider); payload.items[0].provenance.scope = { accountId: 'fixture-account', ...(provider === 'google-calendar' ? { workspaceId: 'wrong' } : { calendarId: 'wrong' }) };
    assert.equal((await f.raw('qg_ingest', payload)).isError, true);
  }
  assert.equal((await f.call('qg_search')).total, 0); assert.deepEqual(f.external, []);
});

test('a later CAS or evidence failure rolls back every earlier item and audit entry in the host batch', async t => {
  const f = await fixture(t), original = imported(), id = (await f.call('qg_ingest', original)).cardIds[0];
  const fresh = clone(original.items[0]); fresh.externalId = '22222222-2222-2222-2222-222222222222'; fresh.provenance.upstreamId = fresh.externalId; fresh.url = 'https://www.notion.so/fixture-workspace/Next-22222222222222222222222222222222';
  const stale = clone(original.items[0]); stale.expectedRevision = 0; stale.content = 'Conflicting content';
  const missing = clone(fresh); missing.externalId = '33333333-3333-3333-3333-333333333333'; missing.provenance.upstreamId = missing.externalId; missing.url = 'https://www.notion.so/fixture-workspace/Next-33333333333333333333333333333333'; missing.evidenceIds = ['card_missing'];
  for (const second of [stale, missing]) {
    const before = f.records(), result = await f.raw('qg_ingest', { ...original, items: [fresh, second] });
    assert.equal(result.isError, true); assert.equal(f.records(), before);
    assert.equal((await f.call('qg_get_card', { cardId: id })).revision, 1);
  }
  assert.deepEqual(f.external, []);
});

test('partial original excerpts and summary-only host results remain distinctly labeled without inventing source text', async t => {
  const f = await fixture(t), excerpt = imported('notion');
  excerpt.items[0].truncated = true; excerpt.items[0].provenance.partial = true;
  const summary = imported('linear'); summary.items[0].content = ''; summary.items[0].provenance.contentOrigin = 'model-summary'; summary.items[0].provenance.partial = true;
  const ids = [];
  for (const payload of [excerpt, summary]) ids.push((await f.call('qg_ingest', payload)).cardIds[0]);
  const cards = await Promise.all(ids.map(cardId => f.call('qg_get_card', { cardId })));
  assert.equal(cards[0].truncated, true); assert.equal(cards[0].provenance.partial, true); assert.equal(cards[0].provenance.contentOrigin, 'upstream-original');
  assert.equal(cards[1].content, ''); assert.ok(cards[1].summary.length > 0); assert.equal(cards[1].provenance.contentOrigin, 'model-summary'); assert.equal(cards[1].provenance.summaryOrigin, 'model-summary');
  for (const card of cards) assert.deepEqual(await f.http('/api/cards/' + card.id), card);
  assert.deepEqual(f.external, []); assert.equal(f.service.store.list('request').length, 0); assert.equal(f.service.store.list('action').length, 0);
});

test('frozen conversation evidence preserves source provenance and original/summary separation after later import updates', async t => {
  const f = await fixture(t), payload = imported('linear');
  payload.items[0].content = ''; payload.items[0].provenance.contentOrigin = 'model-summary'; payload.items[0].provenance.partial = true;
  const id = (await f.call('qg_ingest', payload)).cardIds[0];
  const conversation = await f.call('qg_create_conversation', { title: 'Provenance fixture', idempotencyKey: 'provenance-conversation' });
  const request = await f.call('qg_create_request', { conversationId: conversation.id, question: 'Summarize only the supplied evidence.', cardIds: [id], idempotencyKey: 'provenance-question' });
  const snapshot = request.cardRefs[0];
  assert.equal(snapshot.content, ''); assert.equal(snapshot.summary, payload.items[0].summary);
  assert.equal(snapshot.provenance.contentOrigin, 'model-summary'); assert.equal(snapshot.provenance.attribution, 'host-asserted'); assert.equal(snapshot.provenance.partial, true);
  assert.deepEqual(snapshot.provenance.scope, payload.items[0].provenance.scope);
  const update = clone(payload); update.items[0].expectedRevision = 1; update.items[0].summary = 'A later model summary'; update.items[0].provenance.retrievedAt = '2026-10-11T06:30:00Z';
  await f.call('qg_ingest', update);
  assert.deepEqual((await f.call('qg_get_request', { requestId: request.id })).cardRefs[0], snapshot);
  const messages = (await f.call('qg_read_conversation', { conversationId: conversation.id })).messages;
  assert.deepEqual(messages[0].cardRefs[0], snapshot); assert.deepEqual(f.external, []);
});

test('a summary-only record can later acquire original text from the same upstream version without weakening original-loss protection', async t => {
  const f = await fixture(t), payload = imported('linear');
  payload.items[0].content = ''; payload.items[0].provenance.contentOrigin = 'model-summary'; payload.items[0].provenance.partial = true;
  const id = (await f.call('qg_ingest', payload)).cardIds[0];
  const enrichment = clone(payload); enrichment.items[0].expectedRevision = 1; enrichment.items[0].content = 'Actual original issue text read after the summary';
  enrichment.items[0].provenance.contentOrigin = 'upstream-original'; enrichment.items[0].provenance.retrievedAt = '2026-10-11T06:30:00Z'; enrichment.items[0].provenance.partial = false;
  await f.call('qg_ingest', enrichment);
  const current = await f.call('qg_get_card', { cardId: id }); assert.equal(current.revision, 2); assert.equal(current.content, enrichment.items[0].content);
  assert.equal(current.provenance.upstreamUpdatedAt, payload.items[0].provenance.upstreamUpdatedAt); assert.equal(current.provenance.contentOrigin, 'upstream-original');
  const downgrade = clone(payload); downgrade.items[0].expectedRevision = 2; downgrade.items[0].provenance.retrievedAt = '2026-10-11T07:00:00Z';
  const rejected = await f.raw('qg_ingest', downgrade); assert.equal(rejected.isError, true); assert.equal(rejected.structuredContent.code, 'INGEST_CONFLICT');
  assert.deepEqual(await f.call('qg_get_card', { cardId: id }), current); assert.deepEqual(f.external, []);
});
