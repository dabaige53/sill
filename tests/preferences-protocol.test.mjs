/** F08 synthetic persisted-preference tests through real authenticated HTTP/MCP. */
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
import { digest } from '../server/store.mjs';
import { createHostTransport } from '../web/host-transport.js';

const OWNER = 'f08-owner-synthetic-only-012345678901234567890';
const READER = 'f08-reader-synthetic-only-012345678901234567890';
const DEFAULTS = { interests: [], sourcePriorities: {}, excludedSourceIds: [], includeRead: false };
const SETTINGS = { values: { sort: 'priority', reduceTransparency: false }, revision: 0 };
const OLD = '2020-01-01T00:00:00Z';
const preference = patch => ({ ...structuredClone(DEFAULTS), ...patch });
const ranks = response => ({ items: response.items, method: response.method });
const ids = response => response.items.map(item => item.card.id);
const sources = response => [...new Set(response.items.map(item => item.card.sourceId))].sort();
const cardId = (source, externalId) => `card_${digest([source, externalId]).slice(0, 32)}`;
const reader = resources => ({ id: 'reader', enabled: true, tokenEnv: 'F08_READER', tools: ['qg_recommend', 'qg_search', 'qg_get_card'], resources, limits: { requestsPerMinute: 600 } });

async function fixture(t, { principals = [], connectors = [], legacy, seed } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'qg-preferences-protocol-'));
  const config = ConfigSchema.parse({ dataDir: directory, connectors, access: { principals } });
  const external = [];
  let service, server, origin, clients = new Map();
  const start = async () => {
    service = new Service(config, { env: { F08_READER: READER }, fetchImpl: async (...args) => { external.push(args); throw new Error('Provider calls are not authorized in this synthetic fixture'); } });
    for (const method of ['collect', 'tools', 'write']) service.connectors[method] = async (...args) => { external.push({ method, args }); throw new Error('Preference changes must not call connectors'); };
    server = await startHttp(service, { port: 0, token: OWNER });
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    for (const client of clients.values()) await client.close().catch(() => {});
    clients = new Map();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close();
  };
  await start();
  if (legacy) service.store.put('settings', 'workspace', structuredClone(legacy));
  if (seed) seed(service);
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  const connect = async (token = OWNER) => {
    if (!clients.has(token)) {
      const client = new Client({ name: 'quiet-glass-preferences-protocol-fixture', version: '1' });
      clients.set(token, client);
      await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    }
    return clients.get(token);
  };
  const raw = async (name, args = {}, token = OWNER) => (await connect(token)).callTool({ name, arguments: args });
  const call = async (name, args = {}, token = OWNER) => { const result = await raw(name, args, token); assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent; };
  const http = (path, { method = 'GET', body, token = OWNER, headers = {} } = {}) => fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (path, options) => { const result = await http(path, options); assert.equal(result.status, 200, await result.clone().text()); return result.json(); };
  return { get service() { return service; }, config, external, raw, call, connect, http, json,
    restart: async () => { await stop(); await start(); },
    state: () => JSON.stringify({ settings: service.store.list('settings'), cards: service.store.list('card'), history: service.store.history(1000) }) };
}
const seed = (service, sourceId, items) => service.ingest({ sourceId, items: items.map(item => ({ publishedAt: OLD, ...item })) }).cardIds;

// These are synthetic loopback sessions and source records, never real provider
// credentials, external authorization, or evidence of a production deployment.
test('optional legacy preferences preserve defaults, use one HTTP/MCP CAS and survive a full restart', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.call('qg_read_settings'), SETTINGS);
  assert.deepEqual(await f.json('/api/settings'), SETTINGS);
  const initial = f.state();
  assert.deepEqual(await f.json('/api/settings', { method: 'PATCH', body: { set: { recommendation: preference() }, expectedRevision: 0 } }), SETTINGS);
  assert.equal(f.state(), initial, 'resetting an absent group is not a settings write or audit');
  const saved = preference({ interests: ['protocol-private-interest'], sourcePriorities: { 'source-a': 20, 'source-b': -10 }, includeRead: true });
  const updated = await f.call('qg_update_settings', { set: { recommendation: saved }, expectedRevision: 0 });
  assert.deepEqual(updated, { values: { ...SETTINGS.values, recommendation: saved }, revision: 1 });
  assert.deepEqual(await f.json('/api/settings'), updated);
  const beforeNoop = f.state();
  const reordered = { includeRead: true, excludedSourceIds: [], sourcePriorities: { 'source-b': -10, 'source-a': 20 }, interests: ['protocol-private-interest'] };
  assert.deepEqual(await f.json('/api/settings', { method: 'PATCH', body: { set: { recommendation: reordered }, expectedRevision: 1 } }), updated);
  assert.deepEqual(await f.call('qg_update_settings', { set: { recommendation: structuredClone(saved) }, expectedRevision: 1 }), updated);
  assert.equal(f.state(), beforeNoop, 'structurally identical nested objects do not revise or audit');
  const next = await f.json('/api/settings', { method: 'PATCH', body: { set: { sort: 'time', recommendation: preference({ excludedSourceIds: ['source-b'] }) }, expectedRevision: 1 } });
  assert.equal(next.revision, 2); assert.equal(next.values.sort, 'time');
  assert.deepEqual(next.values.recommendation, preference({ excludedSourceIds: ['source-b'] }), 'recommendation is whole-block replacement, not merge');
  assert.deepEqual(await f.call('qg_read_settings'), next);
  const beforeConflict = f.state();
  const conflict = await f.http('/api/settings', { method: 'PATCH', body: { set: { recommendation: saved }, expectedRevision: 1 } });
  assert.equal(conflict.status, 409); assert.deepEqual((await conflict.json()).current, next);
  const mcpConflict = await f.raw('qg_update_settings', { set: { recommendation: saved }, expectedRevision: 1 });
  assert.equal(mcpConflict.isError, true); assert.equal(mcpConflict.structuredContent.code, 'SETTINGS_CONFLICT'); assert.deepEqual(mcpConflict.structuredContent.current, next);
  assert.equal(f.state(), beforeConflict, 'neither entry point silently replays stale preferences');
  const events = f.service.store.history(1000).filter(event => event.event === 'settings_updated');
  assert.equal(events.length, 2); assert.deepEqual(events.map(event => event.detail.changedKeys), [['recommendation', 'sort'], ['recommendation']]);
  assert.equal(JSON.stringify(events).includes('protocol-private-interest'), false, 'audit contains keys and revisions, not interest values');
  await f.restart();
  assert.deepEqual(await f.call('qg_read_settings'), next); assert.deepEqual(await f.json('/api/settings'), next);
  const reset = await f.call('qg_update_settings', { set: { recommendation: preference() }, expectedRevision: 2 });
  assert.equal(reset.revision, 3); assert.deepEqual(reset.values.recommendation, DEFAULTS);
  const beforeSecondReset = f.state();
  assert.deepEqual(await f.json('/api/settings', { method: 'PATCH', body: { set: { recommendation: preference() }, expectedRevision: 3 } }), reset);
  assert.equal(f.state(), beforeSecondReset); assert.deepEqual(f.external, []);
});

test('existing legacy records remain byte-compatible and a simultaneous cross-entry update has exactly one winner', async t => {
  const legacy = { values: { sort: 'unread', reduceTransparency: true }, revision: 7 };
  const f = await fixture(t, { legacy });
  const before = f.state();
  assert.deepEqual(await f.call('qg_read_settings'), legacy);
  assert.deepEqual(await f.call('qg_update_settings', { set: { recommendation: preference() }, expectedRevision: 7 }), legacy);
  assert.equal(f.state(), before);
  const [http, mcp] = await Promise.all([
    f.http('/api/settings', { method: 'PATCH', body: { set: { recommendation: preference({ interests: ['http-choice'] }) }, expectedRevision: 7 } }),
    f.raw('qg_update_settings', { set: { recommendation: preference({ interests: ['mcp-choice'] }) }, expectedRevision: 7 }),
  ]);
  assert.equal(Number(http.status === 200) + Number(mcp.isError !== true), 1);
  assert.ok([200, 409].includes(http.status));
  const current = await f.call('qg_read_settings'); assert.equal(current.revision, 8);
  assert.equal(current.values.sort, legacy.values.sort); assert.equal(current.values.reduceTransparency, true);
  assert.equal(f.service.store.history(1000).filter(event => event.event === 'settings_updated').length, 1);
  if (http.status === 409) assert.deepEqual((await http.json()).current, current);
  if (mcp.isError) assert.deepEqual(mcp.structuredContent.current, current);
});

test('HTTP and MCP reject malformed, oversized, partial and security-shaped preferences atomically', async t => {
  const f = await fixture(t), full = preference();
  const invalid = [
    null, {}, { ...full, interests: 'one' }, { ...full, interests: [''] }, { ...full, interests: ['   '] },
    { ...full, interests: ['same', 'SAME'] }, { ...full, interests: ['same', ' same '] },
    { ...full, interests: Array.from({ length: 21 }, (_, i) => 'interest-' + i) }, { ...full, interests: ['x'.repeat(101)] },
    { ...full, sourcePriorities: [] }, { ...full, sourcePriorities: { source: '20' } }, { ...full, sourcePriorities: { source: 1.5 } },
    { ...full, sourcePriorities: { source: 31 } }, { ...full, sourcePriorities: { source: -31 } },
    { ...full, sourcePriorities: { '*': 20 } }, { ...full, sourcePriorities: { 'not a source': 20 } },
    { ...full, sourcePriorities: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['source-' + i, 1])) },
    { ...full, excludedSourceIds: ['same', 'same'] }, { ...full, excludedSourceIds: ['*'] },
    { ...full, excludedSourceIds: Array.from({ length: 101 }, (_, i) => 'source-' + i) },
    { ...full, includeRead: 'true' }, { ...full, includeRead: null }, { ...full, credentials: 'not accepted' },
    { ...full, principalId: 'owner' }, { ...full, learnedInterests: ['not accepted'] },
  ];
  for (const field of Object.keys(full)) { const partial = preference(); delete partial[field]; invalid.push(partial); }
  const before = f.state();
  for (const recommendation of invalid) {
    const body = { set: { recommendation }, expectedRevision: 0 };
    const response = await f.http('/api/settings', { method: 'PATCH', body });
    assert.equal(response.status, 400, JSON.stringify(recommendation));
    assert.equal((await f.raw('qg_update_settings', body)).isError, true, JSON.stringify(recommendation));
    assert.equal(f.state(), before, 'invalid input must not mutate data or audit');
  }
  for (const body of [
    { set: { recommendation: full }, expectedRevision: '0' },
    { set: { recommendation: full }, expectedRevision: 0, actorId: 'owner' },
    { set: { recommendation: full, access: { enabled: true } }, expectedRevision: 0 },
  ]) {
    assert.equal((await f.http('/api/settings', { method: 'PATCH', body })).status, 400);
    assert.equal((await f.raw('qg_update_settings', body)).isError, true);
  }
  assert.equal((await f.http('/api/settings', { method: 'PATCH', token: null, body: { set: { recommendation: full }, expectedRevision: 0 } })).status, 401);
  assert.equal((await f.http('/api/settings', { method: 'PATCH', headers: { Origin: 'https://untrusted.example' }, body: { set: { recommendation: full }, expectedRevision: 0 } })).status, 403);
  assert.equal(f.state(), before); assert.deepEqual(f.external, []);
});

test('saved recommendation fields apply across protocols and explicit empty/false overrides never persist', async t => {
  const f = await fixture(t, { seed: service => {
    seed(service, 'source-a', [{ externalId: 'focus', title: 'Focus article' }, { externalId: 'read', title: 'Already read' }]);
    seed(service, 'source-b', [{ externalId: 'other', title: 'Other article' }]);
    seed(service, 'source-c', [{ externalId: 'excluded', title: 'Excluded article' }]);
    service.feedback(cardId('source-a', 'read'), { read: true });
  } });
  const prefs = preference({ interests: ['focus'], sourcePriorities: { 'source-b': 30 }, excludedSourceIds: ['source-c'], includeRead: true });
  const settings = await f.call('qg_update_settings', { set: { recommendation: prefs }, expectedRevision: 0 });
  const before = f.state();
  const saved = await f.call('qg_recommend', { limit: 50 });
  assert.deepEqual(ranks(await f.json('/api/recommend', { method: 'POST', body: { limit: 50 } })), ranks(saved));
  assert.deepEqual(sources(saved), ['source-a', 'source-b']);
  assert.equal(saved.items[0].card.id, cardId('source-b', 'other'));
  assert.equal(saved.items[0].score, 40); assert.equal(saved.items[0].evidence.sourcePriority, 30);
  assert.ok(saved.items[0].reasons.some(reason => reason.includes('source-b') && reason.includes('+30')));
  assert.equal(saved.items.find(item => item.card.id === cardId('source-a', 'focus')).score, 25);
  assert.ok(ids(saved).includes(cardId('source-a', 'read')));
  const overrides = [
    [{ interests: [] }, result => assert.equal(result.items.find(item => item.card.id === cardId('source-a', 'focus')).score, 10)],
    [{ sourcePriorities: {} }, result => { assert.equal(result.items[0].card.id, cardId('source-a', 'focus')); assert.equal(result.items.find(item => item.card.sourceId === 'source-b').evidence.sourcePriority, undefined); }],
    [{ excludedSourceIds: [] }, result => assert.ok(sources(result).includes('source-c'))],
    [{ includeRead: false }, result => assert.equal(ids(result).includes(cardId('source-a', 'read')), false)],
    [{ ...preference(), query: 'other' }, result => { assert.equal(result.items[0].card.id, cardId('source-b', 'other')); assert.deepEqual(sources(result), ['source-a', 'source-b', 'source-c']); }],
  ];
  for (const [override, check] of overrides) {
    const args = { ...override, limit: 50 };
    const result = await f.call('qg_recommend', args); check(result);
    assert.deepEqual(ranks(await f.json('/api/recommend', { method: 'POST', body: args })), ranks(result));
    assert.deepEqual(await f.call('qg_read_settings'), settings);
  }
  assert.equal(f.state(), before, 'recommendation reads and temporary options cannot mutate preferences, card feedback or audit');
  const search = await f.call('qg_search', { sourceIds: ['source-c'] }); assert.equal(search.total, 1, 'exclusion is a recommendation filter, not deletion or source access policy');
  assert.deepEqual(ranks(await f.call('qg_recommend', { limit: 50 })), ranks(saved));
  assert.deepEqual(f.external, []);
});

function hostItem(provider) {
  const metadata = {
    notion: { externalId: '11111111-1111-1111-1111-111111111111', kind: 'note', url: 'https://www.notion.so/fixture/Source-11111111111111111111111111111111' },
    'google-calendar': { externalId: 'event-preference', kind: 'event', url: 'https://calendar.google.com/calendar/event?eid=preference', start: '2020-01-01T10:00:00Z', end: '2020-01-01T11:00:00Z' },
    linear: { externalId: 'issue-preference', kind: 'task', url: 'https://linear.app/fixture/issue/QUI-123/preference' },
  }[provider];
  return { ...metadata, title: `${provider} fixture`, content: 'Supplied original source text.', summary: 'Explicit model summary.', tags: ['fixture'], publishedAt: OLD, truncated: false, expectedRevision: 0,
    provenance: { provider, upstreamId: metadata.externalId, scope: { accountId: 'fixture-account', ...(provider === 'google-calendar' ? { calendarId: 'fixture-calendar' } : { workspaceId: 'fixture-workspace' }) }, retrievedAt: '2026-10-11T06:00:00Z', partial: false, contentOrigin: 'upstream-original', summaryOrigin: 'model-summary' } };
}

test('local, configured, legacy-ingested and host-assisted sources share the exact recommendation exclusion contract', async t => {
  const connectors = [
    { id: 'configured-calendar', type: 'google-calendar', label: 'Fixture calendar' },
    { id: 'configured-notion', type: 'notion', label: 'Fixture Notion' },
    { id: 'configured-mcp', type: 'mcp', label: 'Fixture MCP', url: 'https://provider.invalid/mcp', readTools: [] },
  ];
  const f = await fixture(t, { connectors });
  for (const sourceId of [...connectors.map(connector => connector.id), 'legacy-synthesis']) await f.call('qg_ingest', { sourceId, items: [{ externalId: sourceId, title: sourceId, content: 'Explicit synthetic fixture', publishedAt: OLD }] });
  await f.call('qg_create_note', { title: 'Local fixture', content: 'Local-only fixture', idempotencyKey: 'f08-local-fixture' });
  for (const provider of ['notion', 'google-calendar', 'linear']) await f.call('qg_ingest', { mode: 'host-assisted', sourceId: 'host-' + provider, items: [hostItem(provider)] });
  const sourceIds = ['configured-calendar', 'configured-notion', 'configured-mcp', 'legacy-synthesis', 'local-notes', 'host-notion', 'host-google-calendar', 'host-linear'].sort();
  assert.deepEqual(sources(await f.call('qg_recommend', { limit: 50 })), sourceIds);
  for (const sourceId of sourceIds) {
    const previous = await f.call('qg_read_settings');
    await f.json('/api/settings', { method: 'PATCH', body: { set: { recommendation: preference({ excludedSourceIds: [sourceId] }) }, expectedRevision: previous.revision } });
    assert.deepEqual(sources(await f.call('qg_recommend', { limit: 50 })), sourceIds.filter(id => id !== sourceId));
    assert.deepEqual(sources(await f.json('/api/recommend', { method: 'POST', body: { limit: 50 } })), sourceIds.filter(id => id !== sourceId));
    assert.equal((await f.call('qg_search', { sourceIds: [sourceId] })).total, 1, 'source content remains readable');
  }
  assert.deepEqual(f.external, []); assert.equal(f.service.store.list('action').length, 0); assert.equal(f.service.store.list('request').length, 0); assert.equal(f.service.store.list('ai-run').length, 0);
});

test('restricted MCP/HTTP never read or inherit owner preferences and explicit overrides preserve all F07 boundaries', async t => {
  const PRIVATE = 'OWNER_PRIVATE_PREFERENCE_MARKER';
  const f = await fixture(t, { principals: [reader({ sourceIds: ['allowed', 'allowed-two'] })], seed: service => {
    const [privateId] = seed(service, 'private', [{ externalId: 'private', title: 'OUT_OF_SCOPE_SOURCE_MARKER' }]);
    const [, , derivedId] = seed(service, 'allowed', [{ externalId: 'one', title: 'Public first card' }, { externalId: 'read', title: 'Public read card' }, { externalId: 'derived', title: 'OUT_OF_SCOPE_SOURCE_MARKER', evidenceIds: [privateId] }]);
    seed(service, 'allowed', [{ externalId: 'transitive', title: 'OUT_OF_SCOPE_SOURCE_MARKER', evidenceIds: [derivedId] }]);
    seed(service, 'allowed-two', [{ externalId: 'two', title: 'Public second card' }]);
    service.feedback(cardId('allowed', 'read'), { read: true });
    service.updateAnnotation({ cardId: cardId('allowed', 'one'), set: { note: PRIVATE }, expectedRevision: 0 });
  } });
  const baseline = await f.call('qg_recommend', { limit: 50 }, READER);
  assert.equal(baseline.items.length, 2);
  const prefs = preference({ interests: [PRIVATE, 'public'], sourcePriorities: { allowed: -30, 'allowed-two': 30, private: 30 }, excludedSourceIds: ['allowed'], includeRead: true });
  const settings = await f.call('qg_update_settings', { set: { recommendation: prefs }, expectedRevision: 0 });
  const owner = await f.call('qg_recommend', { limit: 50 }); assert.notDeepEqual(ids(owner), ids(baseline));
  const originalGet = f.service.store.get.bind(f.service.store);
  let settingsReads = 0;
  f.service.store.get = (...args) => { if (args[0] === 'settings') settingsReads++; return originalGet(...args); };
  const unchanged = await f.call('qg_recommend', { limit: 50 }, READER);
  const fromHttp = await f.json('/api/recommend', { token: READER, method: 'POST', body: { limit: 50 } });
  assert.deepEqual(ranks(unchanged), ranks(baseline)); assert.deepEqual(ranks(fromHttp), ranks(baseline));
  const overrides = { limit: 50, interests: ['public'], sourcePriorities: { private: 30, allowed: 20 }, excludedSourceIds: [], includeRead: true };
  const temporary = await f.call('qg_recommend', overrides, READER);
  assert.equal(temporary.items.length, 3); assert.deepEqual(sources(temporary), ['allowed', 'allowed-two']);
  assert.deepEqual(ranks(await f.json('/api/recommend', { token: READER, method: 'POST', body: overrides })), ranks(temporary));
  assert.equal(settingsReads, 0, 'restricted recommendation must not even load the owner settings record');
  f.service.store.get = originalGet;
  for (const result of [unchanged, fromHttp, temporary]) {
    const text = JSON.stringify(result); assert.equal(text.includes(PRIVATE), false); assert.equal(text.includes('OUT_OF_SCOPE_SOURCE_MARKER'), false);
    for (const item of result.items) { assert.equal(Object.hasOwn(item.card, 'annotation'), false); assert.equal(item.evidence.cardId, item.card.id); assert.equal(item.evidence.sourceId, item.card.sourceId); }
  }
  assert.equal((await f.http('/api/settings', { token: READER })).status, 403);
  assert.equal((await f.http('/api/settings', { token: READER, method: 'PATCH', body: { set: { recommendation: preference() }, expectedRevision: settings.revision } })).status, 403);
  for (const [name, args] of [['qg_read_settings', {}], ['qg_update_settings', { set: { recommendation: preference() }, expectedRevision: settings.revision }]]) {
    const denied = await f.raw(name, args, READER); assert.equal(denied.isError, true); assert.equal(JSON.stringify(denied).includes(PRIVATE), false);
  }
  assert.deepEqual(await f.call('qg_read_settings'), settings);
  f.config.access.principals[0].resources.cardIds = [cardId('allowed', 'one'), cardId('private', 'private')];
  assert.deepEqual(ids(await f.call('qg_recommend', overrides, READER)), [cardId('allowed', 'one')], 'explicit card grants only narrow allowed sources');
  f.config.access.principals[0].resources.sourceIds = [];
  assert.equal((await f.call('qg_recommend', overrides, READER)).items.length, 0, 'card IDs never grant a missing source');
  assert.deepEqual(f.external, []);
});

test('explicit preferences retain deterministic ties, diversity, saved reasons and dismissed/snoozed/urgent behavior', async t => {
  const start = new Date(Date.now() + 30 * 60000).toISOString(), end = new Date(Date.now() + 90 * 60000).toISOString();
  const f = await fixture(t, { seed: service => {
    seed(service, 'priority', ['a', 'b', 'c'].map(externalId => ({ externalId, title: 'Equal priority card' })));
    seed(service, 'other', [{ externalId: 'other', title: 'Other source card' }]);
    seed(service, 'hidden', [{ externalId: 'dismissed', title: 'Dismissed match' }, { externalId: 'snoozed', title: 'Snoozed match' }]);
    seed(service, 'event', [{ externalId: 'urgent', title: 'Urgent event', kind: 'event', start, end }]);
    service.feedback(cardId('hidden', 'dismissed'), { dismissed: true });
    service.feedback(cardId('hidden', 'snoozed'), { snoozedUntil: new Date(Date.now() + 3600000).toISOString() });
    service.feedback(cardId('other', 'other'), { bookmarked: true });
  } });
  const body = { limit: 50, interests: ['priority'], sourcePriorities: { priority: 20, hidden: 30 }, includeRead: true };
  const before = f.state(), first = await f.call('qg_recommend', body);
  assert.equal(first.items[0].card.id, cardId('event', 'urgent'));
  assert.ok(first.items[0].reasons.some(reason => reason.includes('一小时')));
  assert.equal(sources(first).includes('hidden'), false);
  const priority = first.items.filter(item => item.card.sourceId === 'priority');
  assert.equal(priority.length, 3); assert.ok(priority.every(item => item.score === 45));
  assert.deepEqual(priority.map(item => item.card.id), [...priority.map(item => item.card.id)].sort());
  assert.equal(first.items[3].card.sourceId, 'other', 'a third ordinary card from one source is deferred for diversity');
  assert.ok(first.items[3].reasons.includes('已收藏'));
  assert.deepEqual(first.items[3].evidence.sourceDiversity, { scoreRank: 5, displayRank: 4 });
  assert.deepEqual(first.items[4].evidence.sourceDiversity, { scoreRank: 4, displayRank: 5 });
  assert.ok(first.items[3].reasons.some(reason => reason.includes('来源多样性')));
  assert.ok(first.items[4].reasons.some(reason => reason.includes('来源多样性')));
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(ranks(await f.call('qg_recommend', body)), ranks(first));
    assert.deepEqual(ranks(await f.json('/api/recommend', { method: 'POST', body })), ranks(first));
  }
  assert.equal(f.state(), before, 'repeated recommendation calls never learn or persist inferred interests');
});

test('recommendation discovery exposes only strict bounded one-off options and rejects malformed requests', async t => {
  const f = await fixture(t), tools = (await (await f.connect()).listTools()).tools;
  const recommend = tools.find(tool => tool.name === 'qg_recommend');
  assert.equal(recommend.annotations.readOnlyHint, true); assert.equal(recommend.annotations.openWorldHint, false); assert.equal(recommend.inputSchema.additionalProperties, false);
  for (const field of Object.keys(DEFAULTS)) assert.ok(recommend.inputSchema.properties[field], 'MCP discovers ' + field);
  for (const field of Object.keys(DEFAULTS)) assert.equal(recommend.inputSchema.required?.includes(field) || false, false);
  const before = f.state();
  for (const body of [
    { recommendation: preference() }, { interests: [''] }, { sourcePriorities: { allowed: 31 } },
    { excludedSourceIds: ['*'] }, { includeRead: 'false' }, { interests: ['one'], save: true },
    { interests: ['one'], owner: true }, { sourcePriorities: { allowed: 20 }, access: { sourceIds: ['private'] } },
  ]) {
    assert.equal((await f.http('/api/recommend', { method: 'POST', body })).status, 400, JSON.stringify(body));
    assert.equal((await f.raw('qg_recommend', body)).isError, true, JSON.stringify(body));
  }
  assert.equal(f.state(), before); assert.deepEqual(f.external, []);
});


test('host preview adapter forwards exact temporary options to the real MCP service and preserves CAS errors', async t => {
  const f = await fixture(t, { seed: service => {
    seed(service, 'source-a', [{ externalId: 'one', title: 'Alpha fixture' }]);
    seed(service, 'source-b', [{ externalId: 'two', title: 'Beta fixture' }]);
  } });
  const client = await f.connect(), calls = [];
  const api = createHostTransport(async request => { calls.push(structuredClone(request)); return client.callTool(request); });
  const savedPreferences = preference({ interests: ['alpha'], excludedSourceIds: ['source-b'] });
  const current = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ set: { recommendation: savedPreferences }, expectedRevision: 0 }) });
  assert.deepEqual(await api('/api/settings'), current);
  const opened = await f.raw('qg_open_workspace');
  assert.notEqual(opened.isError, true);
  assert.deepEqual(opened._meta['quiet-glass/workspace'].settings, current, 'bounded host bootstrap preserves explicitly saved ordinary recommendation settings');
  const before = f.state(), temporary = { ...preference({ interests: ['beta'], sourcePriorities: { 'source-b': 20 } }), limit: 3 };
  const preview = await api('/api/recommend', { method: 'POST', body: JSON.stringify(temporary) });
  assert.deepEqual(calls.at(-1), { name: 'qg_recommend', arguments: temporary });
  assert.equal(preview.items[0].card.sourceId, 'source-b');
  assert.deepEqual(ranks(preview), ranks(await f.call('qg_recommend', temporary)));
  assert.equal(f.state(), before, 'host preview is read-only and cannot persist its draft');
  await assert.rejects(() => api('/api/settings', { method: 'PATCH', body: JSON.stringify({ set: { recommendation: preference() }, expectedRevision: 0 }) }), error => error.code === 'SETTINGS_CONFLICT' && error.current.revision === current.revision);
  assert.deepEqual(await api('/api/settings'), current);
  assert.deepEqual(f.external, []);
});
