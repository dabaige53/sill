/**
 * F04: real Chromium -> authenticated HTTP -> SQLite conversation recovery,
 * with explicit MCP answers. No host-chat persistence or model invocation.
 * Run: node tests/conversations-browser.mjs (optional CHROMIUM_PATH).
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema, ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const directory = await mkdtemp(join(tmpdir(), 'qg-conversations-browser-'));
const artifacts = join(ROOT, 'tests/artifacts');
await mkdir(artifacts, { recursive: true });
const service = new Service(ConfigSchema.parse({ dataDir: directory }));
const source = service.ingest({ sourceId: 'conversation-source', items: [{
  externalId: 'recovery-source', title: '对话中引用的原始卡片',
  content: '这是保存请求时的来源正文。用于检查恢复后仍能找到同一份卡片引用。', kind: 'note',
}] }).cardIds[0];
const referenceIds = service.ingest({ sourceId: 'reference-limit-source', items: Array.from({ length: 21 }, (_, index) => ({
  externalId: `reference-${index}`, title: `引用数量边界卡片 ${index + 1}`, content: '用于检查明确的引用数量限制。', kind: 'note',
})) }).cardIds;
const token = 'conversation-recovery-test-only-012345678901234567890';
const server = await startHttp(service, { port: 0, token });
const origin = `http://127.0.0.1:${server.address().port}`;
const client = new Client({ name: 'conversation-recovery-browser-test', version: '1' });
const checks = [], pageErrors = [], externalRequests = [], submittedRequests = [], createdConversations = [];
const releaseGates = new Set();
let browser, page, failure;

async function api(path, method = 'GET', data) {
  const response = await fetch(origin + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  assert.notEqual(response.isError, true, JSON.stringify(response));
  return response.structuredContent;
}
async function eventual(assertion, timeout = 15000) {
  const until = Date.now() + timeout;
  let last;
  do {
    try { return await assertion(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 75));
  } while (Date.now() < until);
  throw last;
}
async function conversation(id, limit = 100, offset = 0) {
  return api(`/api/conversations/${id}?limit=${limit}&offset=${offset}`);
}
async function allMessages(id) {
  const result = [];
  let offset = 0;
  do {
    const chunk = await conversation(id, 50, offset);
    result.push(...chunk.messages); offset = chunk.nextOffset;
  } while (offset !== null);
  return result;
}
function requests() { return service.store.list('request'); }
function conversations() { return service.store.list('conversation'); }
function gate() {
  let release;
  const promise = new Promise(resolve => release = resolve);
  const unlock = () => { releaseGates.delete(unlock); release(); };
  releaseGates.add(unlock);
  return { promise, release: unlock };
}
async function waitForGate(signal, description) {
  let timer;
  try {
    await Promise.race([signal.promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
async function fieldValue(expected, message) {
  await eventual(async () => assert.equal(await page.locator('#ai-input').inputValue(), expected, message));
}
function messageLocator(text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('#ai-messages .message').filter({ hasText: new RegExp('^' + escaped + '(?:\\n|$)') });
}
async function hasMessage(text) {
  await messageLocator(text).first().waitFor();
}
async function titleIs(title) {
  await eventual(async () => assert.equal(await page.locator('#conversation-title').textContent(), title));
}
async function openHistory(id) {
  await page.locator('[data-action="conversation-list"]').click();
  await page.locator(`[data-action="conversation-open"][data-id="${id}"]`).click();
}
async function reloadAI() {
  await page.reload();
  await page.locator(`[data-card="${source}"]`).waitFor();
  await page.evaluate(() => window.__app.openAI());
  await page.locator('#conversation-title').waitFor();
}
async function send(question) {
  await page.locator('#ai-input').fill(question);
  await page.locator('[data-action="ai-send"]').click();
  await hasMessage(question);
  await eventual(async () => assert.equal(await page.locator('[data-action="ai-send"]').isEnabled(), true));
  const request = requests().find(item => item.question === question);
  assert.ok(request, `question persisted: ${question}`);
  return request;
}
async function errorIs(text) {
  await page.waitForFunction(value => document.getElementById('toast-text').textContent.includes(value), text);
}
function passed(description) { checks.push(description); console.log(`PASS ${description}`); }

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  // A new regression must fail locally rather than contact any external service.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    externalRequests.push(url.href); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/requests') submittedRequests.push(request.postDataJSON());
    if (path === '/api/conversations') createdConversations.push(request.postDataJSON());
  });
  await page.goto(origin);
  await page.locator('#qg-token').fill(token);
  await page.locator('[data-qg-action="login"]').click();
  await page.locator(`[data-card="${source}"]`).waitFor();
  await page.evaluate(id => window.__app.attach([id]), source);
  assert.equal(requests().length, 0, 'attaching a reference never submits a request');
  assert.equal(conversations().length, 0, 'a blank draft does not create persisted history');
  assert.equal(submittedRequests.length, 0);
  passed('attach-before-send creates no request and invokes no model');

  const firstQuestion = '刷新后继续回答这张卡片的问题';
  const first = await send(firstQuestion), firstId = first.conversationId;
  const initial = await conversation(firstId);
  assert.equal(initial.messages.length, 1);
  assert.equal(initial.messages[0].role, 'user');
  assert.equal(initial.messages[0].status, 'pending');
  assert.equal(initial.messages[0].requestId, first.id);
  assert.deepEqual(initial.messages[0].cardRefs.map(ref => ref.cardId), [source]);
  assert.equal(initial.messages[0].cardRefs[0].snapshotOrigin, 'request-creation');
  assert.equal(initial.messages[0].cardRefs[0].title, '对话中引用的原始卡片');
  const originalMessageId = initial.messages[0].id;
  const frozenRefs = initial.messages[0].cardRefs;
  await reloadAI();
  await hasMessage(firstQuestion);
  await titleIs(initial.conversation.title);
  await eventual(async () => assert.ok((await page.locator('#ai-messages').textContent()).includes(first.id)));
  assert.equal(requests().length, 1, 'reload does not resubmit a pending request');
  const pending = (await call('qg_list_requests')).requests.find(request => request.id === first.id);
  assert.ok(pending, 'pending request is recoverable through MCP after browser reload');
  assert.equal(pending.conversationId, firstId);
  assert.deepEqual(pending.cardRefs, frozenRefs);
  assert.ok(pending.context.messages.some(message => message.text === firstQuestion));
  passed('pending request, ordered user message, and frozen references survive reload');

  const answer = '刷新后的 MCP 回答，仍然对应原始卡片。';
  const answered = await call('qg_answer_request', { requestId: first.id, answer, evidenceIds: [source] });
  await hasMessage(answer);
  const repeated = await call('qg_answer_request', { requestId: first.id, answer, evidenceIds: [source] });
  assert.deepEqual(repeated, answered, 'an identical MCP answer returns the existing result');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await reloadAI(); await hasMessage(answer);
  const answeredHistory = await allMessages(firstId);
  assert.equal(answeredHistory.length, 2);
  assert.deepEqual(answeredHistory.map(message => message.role), ['user', 'assistant']);
  assert.equal(answeredHistory[0].id, originalMessageId);
  assert.equal(answeredHistory[0].status, 'answered');
  assert.equal(answeredHistory[1].requestId, first.id);
  assert.equal(answeredHistory[1].id, answered.answerMessageId);
  assert.deepEqual(answeredHistory[1].evidenceIds, [source]);
  assert.deepEqual(answeredHistory.map(message => message.sequence), [1, 2]);
  assert.equal(await messageLocator(answer).count(), 1);
  passed('answer after reload reaches UI; identical MCP retry creates one assistant message');

  // Continue the same conversation, then switch away and resume it through history.
  const followupQuestion = '请结合刚才的回答继续说明';
  const followup = await send(followupQuestion);
  assert.equal(followup.conversationId, firstId);
  const followupContext = (await call('qg_list_requests')).requests.find(request => request.id === followup.id).context;
  assert.ok(followupContext.messages.some(message => message.text === firstQuestion));
  assert.ok(followupContext.messages.some(message => message.text === answer));
  const firstDraft = '第一段对话尚未发送的草稿';
  await page.locator('#ai-input').fill(firstDraft);
  await page.locator('[data-action="conversation-new"]').click();
  await fieldValue('');
  assert.equal(requests().length, 2, 'new conversation is not a send');
  const secondQuestion = '这是另一个独立对话';
  const second = await send(secondQuestion), secondId = second.conversationId;
  assert.notEqual(secondId, firstId);
  const secondHistory = await conversation(secondId);
  assert.equal(secondHistory.total, 1);
  assert.equal(secondHistory.messages[0].text, secondQuestion);
  const secondDraft = '第二段对话的独立草稿';
  await page.locator('#ai-input').fill(secondDraft);
  await openHistory(firstId); await hasMessage(answer); await hasMessage(followupQuestion); await fieldValue(firstDraft);
  assert.equal(await messageLocator(secondQuestion).count(), 0);
  await openHistory(secondId); await hasMessage(secondQuestion); await fieldValue(secondDraft);
  await reloadAI(); await hasMessage(secondQuestion); await fieldValue(secondDraft);
  assert.equal(requests().length, 3, 'open, switch, and reload never submit drafts');
  passed('multiple conversations resume independently with prior MCP context and separate drafts');

  // An older selection may finish later, but cannot replace the newest selection.
  const oldLoad = gate(), oldStarted = gate();
  let delayed = false;
  const firstPattern = `${origin}/api/conversations/${firstId}*`;
  await page.route(firstPattern, async route => {
    if (delayed) return route.continue();
    delayed = true;
    const response = await route.fetch(); oldStarted.release();
    await oldLoad.promise; await route.fulfill({ response });
  });
  await page.locator('[data-action="conversation-list"]').click();
  await page.locator(`[data-action="conversation-open"][data-id="${firstId}"]`).click();
  await waitForGate(oldStarted, 'delayed conversation read to reach the server');
  await page.evaluate(id => window.__app.action('conversation-open', id), secondId);
  await titleIs(secondHistory.conversation.title); await hasMessage(secondQuestion); await fieldValue(secondDraft);
  const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/conversations/${firstId}`);
  oldLoad.release(); await (await oldResponse).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await titleIs(secondHistory.conversation.title); await hasMessage(secondQuestion); await fieldValue(secondDraft);
  assert.equal(await messageLocator(firstQuestion).count(), 0);
  await page.unroute(firstPattern);
  passed('delayed old-conversation read cannot overwrite newer active history or draft');

  // A disconnected read must be visible, with the destination's draft intact.
  await page.route(firstPattern, route => route.abort('failed'));
  await openHistory(firstId); await errorIs('对话暂时无法读取'); await fieldValue(firstDraft);
  assert.equal(await messageLocator(secondQuestion).count(), 0, 'failed read does not show another conversation');
  await reloadAI(); await errorIs('对话暂时无法读取'); await fieldValue(firstDraft);
  await page.unroute(firstPattern);
  await page.evaluate(id => window.__app.action('conversation-open', id), firstId);
  await hasMessage(answer); await fieldValue(firstDraft);
  passed('disconnected history read reports a clear error and preserves draft through reload');

  // Lose the create response after SQLite has committed. A retry must use the
  // original create/request payload while preserving subsequent draft edits.
  await page.locator('[data-action="conversation-new"]').click();
  await page.evaluate(id => window.__app.attach([id]), source);
  const beforeCreate = conversations().length, beforeCreateRequests = requests().length;
  const createQuestion = '创建响应丢失前提交的问题';
  const editedCreateDraft = '创建响应丢失后继续编辑的草稿';
  let createDropped = false, committedConversation;
  await page.route(`${origin}/api/conversations`, async route => {
    if (route.request().method() !== 'POST' || createDropped) return route.continue();
    createDropped = true;
    const response = await route.fetch(); committedConversation = await response.json();
    assert.equal(response.status(), 201); await route.abort('failed');
  });
  await page.locator('#ai-input').fill(createQuestion);
  await page.locator('[data-action="ai-send"]').click();
  await errorIs('请求未确认');
  assert.equal(conversations().length, beforeCreate + 1);
  assert.equal(requests().length, beforeCreateRequests);
  await page.locator('#ai-input').fill(editedCreateDraft);
  await page.locator(`[data-action="ai-remove"][data-id="${source}"]`).click();
  await reloadAI(); await fieldValue(editedCreateDraft);
  await page.locator('[data-action="ai-send"]').click();
  await hasMessage(createQuestion); await fieldValue(editedCreateDraft);
  await eventual(async () => assert.equal(await page.locator('[data-action="ai-send"]').isEnabled(), true));
  assert.equal(conversations().length, beforeCreate + 1, 'create retry must not duplicate history');
  assert.equal(requests().length, beforeCreateRequests + 1);
  const recoveredCreate = requests().find(request => request.question === createQuestion);
  assert.equal(recoveredCreate.conversationId, committedConversation.id);
  assert.deepEqual(recoveredCreate.cardIds, [source], 'original submission keeps its captured references');
  const createAttempts = createdConversations.filter(item => item.idempotencyKey === createdConversations.at(-1).idempotencyKey);
  assert.equal(createAttempts.length, 2);
  assert.deepEqual(createAttempts[0], createAttempts[1], 'retry reuses the immutable create payload');
  await page.unroute(`${origin}/api/conversations`);
  await page.locator('[data-action="ai-send"]').click(); await hasMessage(editedCreateDraft);
  await eventual(async () => assert.equal(await page.locator('[data-action="ai-send"]').isEnabled(), true));
  await fieldValue('');
  const laterCreateDraft = requests().find(request => request.question === editedCreateDraft);
  assert.equal(laterCreateDraft.conversationId, committedConversation.id);
  assert.deepEqual(laterCreateDraft.cardIds, [], 'later draft reference edits remain separate from the original submission');
  assert.equal(conversations().length, beforeCreate + 1);
  passed('lost create response retries without duplication and preserves newer text/reference edits');

  const requestQuestion = '请求响应丢失前已保存的问题';
  const editedRequestDraft = '等待请求回应时继续输入的草稿';
  const beforeRequest = requests().length;
  const requestCommit = gate(), requestRelease = gate();
  let requestDropped = false;
  await page.route(`${origin}/api/requests`, async route => {
    if (route.request().method() !== 'POST' || requestDropped) return route.continue();
    requestDropped = true; const response = await route.fetch();
    assert.equal(response.status(), 201); requestCommit.release();
    await requestRelease.promise; await route.abort('failed');
  });
  await page.locator('#ai-input').fill(requestQuestion);
  await page.locator('[data-action="ai-send"]').click(); await waitForGate(requestCommit, 'request commit before lost response');
  await page.locator('#ai-input').fill(editedRequestDraft);
  requestRelease.release(); await errorIs('请求未确认');
  assert.equal(requests().length, beforeRequest + 1);
  await reloadAI(); await hasMessage(requestQuestion); await fieldValue(editedRequestDraft);
  await page.locator('[data-action="ai-send"]').click();
  await eventual(async () => assert.equal(await page.locator('[data-action="ai-send"]').isEnabled(), true));
  await fieldValue(editedRequestDraft);
  assert.equal(requests().length, beforeRequest + 1, 'request retry must not create a second request');
  const requestAttempts = submittedRequests.filter(item => item.question === requestQuestion);
  assert.equal(requestAttempts.length, 2);
  assert.deepEqual(requestAttempts[0], requestAttempts[1], 'request retry uses the original idempotency key and payload');
  const requestMessages = await allMessages(committedConversation.id);
  assert.equal(requestMessages.filter(message => message.text === requestQuestion).length, 1);
  assert.equal(await messageLocator(requestQuestion).count(), 1);
  await page.unroute(`${origin}/api/requests`);
  passed('lost request response and in-flight edits recover after reload without duplicate messages');

  // Card-only drafts must be discoverable even when their question is empty.
  const beforeUnsentRequests = requests().length, beforeUnsentConversations = conversations().length;
  await page.locator('[data-action="conversation-new"]').click();
  await page.evaluate(id => window.__app.attach([id]), source);
  await page.locator('[data-action="conversation-new"]').click();
  await page.locator('[data-action="conversation-list"]').click();
  const cardOnlyRow = page.locator('[data-action="conversation-open"]').filter({ hasText: /^未提交草稿：已选1张卡片$/ });
  await cardOnlyRow.waitFor(); await cardOnlyRow.click();
  await fieldValue('');
  assert.deepEqual(await page.evaluate(() => window.__app.contexts), [source]);
  await reloadAI(); await fieldValue('');
  assert.deepEqual(await page.evaluate(() => window.__app.contexts), [source]);
  assert.equal(requests().length, beforeUnsentRequests); assert.equal(conversations().length, beforeUnsentConversations);
  passed('card-only unsent draft remains reachable through history and reload');

  // Validation must not silently truncate the draft before navigation or reload.
  await page.locator('[data-action="conversation-new"]').click();
  const oversized = '长'.repeat(4500), beforeOversizedPosts = submittedRequests.length, beforeOversizedCreates = createdConversations.length;
  await page.locator('#ai-input').fill(oversized);
  await page.locator('[data-action="ai-send"]').click(); await errorIs('问题最多4000');
  await fieldValue(oversized);
  assert.equal(submittedRequests.length, beforeOversizedPosts); assert.equal(createdConversations.length, beforeOversizedCreates);
  await page.locator('[data-action="conversation-new"]').click();
  await page.locator('[data-action="conversation-list"]').click();
  await page.locator('[data-action="conversation-open"]').filter({ hasText: new RegExp('^未提交草稿：' + '长'.repeat(80) + '$') }).click();
  await fieldValue(oversized); await reloadAI(); await fieldValue(oversized);
  await page.locator('[data-action="ai-send"]').click(); await errorIs('问题最多4000');
  assert.equal(submittedRequests.length, beforeOversizedPosts); assert.equal(createdConversations.length, beforeOversizedCreates);
  const shortened = await send('缩短后才能提交的有效问题');
  assert.equal(shortened.question, '缩短后才能提交的有效问题');
  assert.equal(submittedRequests.length, beforeOversizedPosts + 1); assert.equal(createdConversations.length, beforeOversizedCreates + 1);
  passed('4500-character draft survives navigation/reload intact and is blocked until shortened');

  await page.locator('[data-action="conversation-new"]').click();
  const beforeAttachmentPosts = submittedRequests.length;
  await page.evaluate(ids => window.__app.attach(ids), referenceIds);
  await errorIs('每个问题最多引用20张卡片');
  assert.deepEqual(await page.evaluate(() => window.__app.contexts), referenceIds.slice(0, 20));
  assert.equal(await page.locator('#ai-contexts [data-action="ai-remove"]').count(), 20);
  assert.equal(submittedRequests.length, beforeAttachmentPosts);
  await reloadAI();
  assert.deepEqual(await page.evaluate(() => window.__app.contexts), referenceIds.slice(0, 20));
  passed('over-limit attachments are capped explicitly without submitting or silently losing accepted refs');

  // A committed conversation can be opened from history before its creation ACK
  // reaches the original draft. Neither draft is allowed to overwrite the other.
  await page.locator('[data-action="conversation-new"]').click();
  const collisionQuestion = '创建确认尚未返回时的原始问题';
  const destinationDraft = '从历史打开新对话之后输入的草稿 B';
  const beforeCollisionCreates = conversations().length, beforeCollisionRequests = requests().length;
  const collisionCommit = gate(), collisionRelease = gate();
  let collisionHeld = false, collisionConversation;
  await page.route(`${origin}/api/conversations`, async route => {
    if (route.request().method() !== 'POST' || collisionHeld) return route.continue();
    collisionHeld = true; const response = await route.fetch();
    collisionConversation = await response.json();
    assert.equal(response.status(), 201); collisionCommit.release();
    await collisionRelease.promise; await route.fulfill({ response });
  });
  await page.locator('#ai-input').fill(collisionQuestion);
  await page.locator('[data-action="ai-send"]').click();
  await waitForGate(collisionCommit, 'conversation commit before delayed successful ACK');
  await openHistory(collisionConversation.id); await titleIs(collisionConversation.title);
  await page.locator('#ai-input').fill(destinationDraft);
  collisionRelease.release();
  await eventual(() => assert.ok(requests().some(request => request.question === collisionQuestion)));
  await hasMessage(collisionQuestion); await fieldValue(destinationDraft);
  assert.equal(conversations().length, beforeCollisionCreates + 1);
  assert.equal(requests().length, beforeCollisionRequests + 1);
  assert.equal(requests().find(request => request.question === collisionQuestion).conversationId, collisionConversation.id);
  await reloadAI(); await hasMessage(collisionQuestion); await fieldValue(destinationDraft);
  await page.unroute(`${origin}/api/conversations`);
  const destinationRequest = await send(destinationDraft);
  assert.equal(destinationRequest.conversationId, collisionConversation.id);
  assert.equal(conversations().length, beforeCollisionCreates + 1);
  passed('opening committed history before create ACK preserves the independently edited destination draft');

  // Seed enough explicit synthetic requests to exercise the 50-message UI page.
  const long = await api('/api/conversations', 'POST', { title: '超过一页的对话历史', idempotencyKey: 'browser-long-conversation' });
  for (let index = 0; index < 27; index++) {
    const request = await api('/api/requests', 'POST', {
      conversationId: long.id, question: `历史问题 ${index + 1}`, cardIds: [], idempotencyKey: `browser-long-question-${index}`,
    });
    await call('qg_answer_request', { requestId: request.id, answer: `历史回答 ${index + 1}`, evidenceIds: [] });
  }
  const firstPage = await conversation(long.id, 1, 0), nextPage = await conversation(long.id, 1, firstPage.nextOffset);
  assert.equal(firstPage.total, 54); assert.equal(firstPage.messages[0].sequence, 1); assert.equal(nextPage.messages[0].sequence, 2);
  const all = await allMessages(long.id);
  assert.equal(new Set(all.map(message => message.id)).size, 54);
  assert.deepEqual(all.map(message => message.sequence), Array.from({ length: 54 }, (_, index) => index + 1));
  const requestCountBeforeHistory = requests().length;
  await openHistory(long.id); await hasMessage('历史回答 27');
  assert.equal(await messageLocator('历史问题 1').count(), 0);
  const beforeOlder = await page.locator('#ai-messages').evaluate(element => {
    element.scrollTop = 60; return { top: element.scrollTop, height: element.scrollHeight };
  });
  await page.locator('[data-action="conversation-older"]').click(); await hasMessage('历史问题 1');
  const afterOlder = await page.locator('#ai-messages').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }));
  assert.ok(Math.abs(afterOlder.top - beforeOlder.top - (afterOlder.height - beforeOlder.height)) <= 2, 'loading earlier messages preserves the previous reading anchor');
  assert.equal(await page.locator('#ai-messages .message').count(), 54);
  assert.equal(await page.locator('[data-action="conversation-older"]').isVisible(), false);
  const listPage = await api('/api/conversations?limit=1&offset=0');
  assert.equal(listPage.conversations.length, 1); assert.equal(listPage.total, conversations().length);
  assert.equal(listPage.nextOffset, 1);
  const listNext = await api('/api/conversations?limit=1&offset=1');
  assert.notEqual(listPage.conversations[0].id, listNext.conversations[0].id);
  assert.equal(requests().length, requestCountBeforeHistory, 'history pagination never submits a request');
  passed('message and conversation pagination retain strict order without omissions or duplicates');

  const readingTop = await page.locator('#ai-messages').evaluate(element => { element.scrollTop = 40; return element.scrollTop; });
  const refreshed = page.waitForResponse(response => {
    const url = new URL(response.url()); return url.pathname === `/api/conversations/${long.id}` && url.searchParams.get('offset') === '4';
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await (await refreshed).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.ok(Math.abs(await page.locator('#ai-messages').evaluate(element => element.scrollTop) - readingTop) <= 2, 'an unchanged poll must not jump to the latest message');
  const later = await api('/api/requests', 'POST', { conversationId: long.id, question: '阅读较早消息时新增的问题', cardIds: [], idempotencyKey: 'browser-long-later-question' });
  await call('qg_answer_request', { requestId: later.id, answer: '阅读较早消息时到达的回答', evidenceIds: [] });
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await hasMessage('阅读较早消息时到达的回答');
  assert.ok(Math.abs(await page.locator('#ai-messages').evaluate(element => element.scrollTop) - readingTop) <= 2, 'new answers preserve an older reading position');
  passed('loading older messages preserves the anchor; unchanged and new-answer polling never jumps to bottom');

  await page.screenshot({ path: join(artifacts, 'conversations-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390px layout must not overflow');
  await page.screenshot({ path: join(artifacts, 'conversations-mobile.png'), fullPage: true, animations: 'disabled' });
  const longTitle = 'W'.repeat(200);
  const titled = await api('/api/conversations', 'POST', { title: longTitle, idempotencyKey: 'browser-mobile-long-title' });
  await openHistory(titled.id); await titleIs(longTitle);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a valid 200-character unbroken title does not overflow mobile');
  assert.equal(await page.locator('[data-action="conversation-list"], [data-action="conversation-new"]').evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth;
  })), true, 'history and new-conversation controls remain within the viewport');
  await page.locator('[data-action="conversation-list"]').click();
  await page.locator(`[data-action="conversation-open"][data-id="${titled.id}"]`).waitFor();
  assert.equal(await page.locator('#modal').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'long history titles wrap within the dialog');
  await page.screenshot({ path: join(artifacts, 'conversations-mobile-long-title.png'), fullPage: true, animations: 'disabled' });
  passed('200-character unbroken conversation titles remain usable in the mobile toolbar and history list');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, [], 'all browser traffic remains within the isolated local application');
  passed('390px history rendering, no page errors, and no automatic external model traffic');
  console.log('PASS F04 conversation recovery browser + HTTP + MCP journey');
} catch (error) {
  failure = error;
  if (page) await page.screenshot({ path: join(artifacts, 'conversations-failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  throw error;
} finally {
  for (const release of releaseGates) release();
  await writeFile(join(artifacts, 'conversations-browser.json'), JSON.stringify({
    status: failure ? 'FAIL' : 'PASS', checks, pageErrors, externalRequests,
    browserRequestSubmissions: submittedRequests.length, browserConversationCreates: createdConversations.length,
    ...(failure ? { error: failure.stack || failure.message } : {}),
    scope: 'Isolated standalone application history, authenticated HTTP, SQLite and explicit MCP answers; not a real host installation or model call.',
  }, null, 2));
  await browser?.close(); await client.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close();
  await rm(directory, { recursive: true, force: true });
}
