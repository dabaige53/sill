/**
 * F05: real Chromium -> authenticated HTTP -> SQLite -> real OpenAI adapter,
 * using an in-memory Responses SSE provider. No API key, external provider,
 * account, billable request, or native-host installation is exercised.
 * Run: node tests/ai-browser.mjs (optional CHROMIUM_PATH).
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { ConfigSchema, ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const directory = await mkdtemp(join(tmpdir(), 'qg-ai-browser-'));
const artifacts = join(ROOT, 'tests/artifacts');
await mkdir(artifacts, { recursive: true });
const token = 'ai-browser-service-only-012345678901234567890';
const fixtureCredential = 'not-a-real-key-ai-browser-fixture';
const checks = [], pageErrors = [], externalRequests = [], fixtures = [], releaseGates = new Set();
let browser, page, failure;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventual(assertion, timeout = 15000) {
  const until = Date.now() + timeout;
  let last;
  do {
    try { return await assertion(); } catch (error) { last = error; }
    await sleep(60);
  } while (Date.now() < until);
  throw last;
}
function passed(description) { checks.push(description); console.log(`PASS ${description}`); }
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
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

// This fake replaces fetch only at the server adapter boundary. The production
// request builder, SSE parser, persistence and browser polling all run normally.
function fakeProvider() {
  const calls = [], plans = [];
  const encoder = new TextEncoder();
  return {
    calls,
    queue(plan = {}) { plans.push(plan); },
    async fetchImpl(url, init) {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.equal(init.method, 'POST');
      const headers = new Headers(init.headers);
      assert.equal(headers.get('authorization'), `Bearer ${fixtureCredential}`);
      const body = JSON.parse(init.body);
      assert.equal(body.stream, true);
      assert.equal(body.store, false);
      assert.equal(body.background, false);
      assert.deepEqual(body.tools, []);
      assert.equal(body.tool_choice, 'none');
      assert.equal(init.redirect, 'error');
      assert.ok(plans.length, 'provider invocation requires an explicit queued fixture');
      const plan = plans.shift();
      let controller, closed = false;
      const call = { body, aborted: false, output: '', id: `resp_fixture_${calls.length + 1}` };
      calls.push(call);
      if (plan.status) return new Response(plan.body || 'private upstream error detail', { status: plan.status });
      const stream = new ReadableStream({
        start(value) { controller = value; },
        cancel() { closed = true; },
      });
      call.event = (type, payload, fragmented = false) => {
        assert.equal(closed, false, 'cannot write a closed fixture stream');
        const bytes = encoder.encode(`event: ${type}\r\ndata: ${JSON.stringify({ type, ...payload })}\r\n\r\n`);
        if (fragmented) {
          // Deliberately split UTF-8 codepoints, field names and SSE delimiters.
          for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
        } else controller.enqueue(bytes);
      };
      call.delta = (text, fragmented = true) => {
        call.output += text;
        call.event('response.output_text.delta', { item_id: 'msg_fixture', output_index: 0, content_index: 0, delta: text }, fragmented);
      };
      call.complete = () => {
        call.event('response.completed', { response: {
          id: call.id, status: 'completed',
          output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: call.output }] }],
          usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        } }, true);
        controller.close(); closed = true;
      };
      call.abort = () => {
        call.aborted = true;
        if (!closed) { closed = true; controller.error(new DOMException('Fixture aborted', 'AbortError')); }
      };
      init.signal?.addEventListener('abort', call.abort, { once: true });
      if (init.signal?.aborted) call.abort();
      else call.event('response.created', { response: { id: call.id, status: 'in_progress' } }, true);
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    },
    cleanup() { for (const call of calls) call.abort?.(); },
  };
}

async function createFixture(name, enabled = false) {
  const provider = fakeProvider();
  const config = ConfigSchema.parse({ dataDir: join(directory, name), ...(enabled ? { ai: { enabled: true, model: 'fixture' } } : {}) });
  const options = { env: { OPENAI_API_KEY: fixtureCredential }, fetchImpl: provider.fetchImpl };
  const fixture = { name, provider, config, options, service: new Service(config, options) };
  fixtures.push(fixture);
  fixture.source = fixture.service.ingest({ sourceId: 'ai-browser-source', items: [{
    externalId: 'source', title: '流式回答的原始卡片', content: '这份来源只供明确启动的测试请求使用。', kind: 'note',
  }] }).cardIds[0];
  fixture.server = await startHttp(fixture.service, { port: 0, token });
  fixture.origin = `http://127.0.0.1:${fixture.server.address().port}`;
  fixture.context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await fixture.context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === fixture.origin) return route.continue();
    externalRequests.push(url.href); return route.abort();
  });
  fixture.page = await fixture.context.newPage();
  fixture.page.setDefaultTimeout(15000);
  fixture.page.on('pageerror', error => pageErrors.push(error.message));
  await login(fixture);
  return fixture;
}
async function login(fixture) {
  page = fixture.page;
  await page.goto(fixture.origin);
  await page.locator('#qg-token').fill(token);
  await page.locator('[data-qg-action="login"]').click();
  await page.locator(`[data-card="${fixture.source}"]`).waitFor();
  await page.evaluate(() => window.__app.openAI());
}
async function api(fixture, path, method = 'GET', data, allowError = false) {
  const response = await fetch(fixture.origin + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!allowError) assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return allowError ? { status: response.status, result } : result;
}
const runPath = requestId => `/api/requests/${requestId}/ai`;
const runSnapshot = (fixture, requestId) => api(fixture, runPath(requestId));
async function stateIs(fixture, requestId, status, output) {
  return eventual(async () => {
    const snapshot = await runSnapshot(fixture, requestId);
    assert.equal(snapshot.status, status);
    if (output !== undefined) assert.equal(snapshot.output, output);
    return snapshot;
  });
}
async function history(fixture, requestId) {
  const request = await api(fixture, `/api/requests/${requestId}`);
  return api(fixture, `/api/conversations/${request.conversationId}?limit=100&offset=0`);
}
async function refresh(fixture) {
  await fixture.page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function aiText(fixture) {
  return (await fixture.page.locator('#ai-messages, #ai-runtime').allTextContents()).join('\n');
}
async function visibleText(fixture, text) {
  await eventual(async () => assert.ok((await aiText(fixture)).includes(text), `visible response: ${text}`));
}
async function visibleState(fixture, requestId, status) {
  await fixture.page.locator(`[data-ai-request="${requestId}"][data-ai-status="${status}"]`).waitFor();
}
async function reload(fixture) {
  await fixture.page.reload();
  await fixture.page.locator(`[data-card="${fixture.source}"]`).waitFor();
  await fixture.page.evaluate(() => window.__app.openAI());
  await fixture.page.locator('#conversation-title').waitFor();
}
async function send(fixture, question) {
  await fixture.page.locator('#ai-input').fill(question);
  await fixture.page.locator('[data-action="ai-send"]').click();
  await visibleText(fixture, question);
  await eventual(async () => assert.equal(await fixture.page.locator('[data-action="ai-send"]').isEnabled(), true));
  const request = fixture.service.store.list('request').find(item => item.question === question);
  assert.ok(request, `question persisted: ${question}`);
  return request;
}
async function start(fixture, requestId, plan = {}) {
  const count = fixture.provider.calls.length;
  fixture.provider.queue(plan);
  await fixture.page.locator(`[data-action="ai-run-start"][data-id="${requestId}"]`).click();
  await eventual(() => assert.equal(fixture.provider.calls.length, count + 1));
  return fixture.provider.calls.at(-1);
}
async function newConversation(fixture) {
  await fixture.page.locator('[data-action="conversation-new"]').click();
  await eventual(async () => assert.equal(await fixture.page.locator('#ai-input').inputValue(), ''));
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  const disabled = await createFixture('disabled');
  await disabled.page.evaluate(id => window.__app.attach([id]), disabled.source);
  const queued = await send(disabled, '默认只保存到手动处理队列');
  await reload(disabled); await visibleText(disabled, queued.question);
  assert.equal(disabled.provider.calls.length, 0, 'send and reload never invoke the disabled provider');
  assert.equal(await disabled.page.locator(`[data-action="ai-run-start"][data-id="${queued.id}"]:enabled`).count(), 0);
  const denied = await api(disabled, runPath(queued.id) + '/start', 'POST', {}, true);
  assert.ok(denied.status >= 400, 'disabled execution is rejected server-side');
  assert.equal(disabled.provider.calls.length, 0);
  await api(disabled, `/api/requests/${queued.id}/answer`, 'POST', { answer: '手动工作者仍能回答已保存的问题。', evidenceIds: [disabled.source] });
  await refresh(disabled); await visibleText(disabled, '手动工作者仍能回答已保存的问题。');
  assert.equal((await history(disabled, queued.id)).messages.filter(message => message.role === 'assistant').length, 1);
  passed('default-disabled adapter makes zero provider calls; manual queue remains usable');

  const enabled = await createFixture('enabled', true);
  await enabled.page.evaluate(id => window.__app.attach([id]), enabled.source);
  const first = await send(enabled, '明确点击后才开始流式回答');
  assert.equal(enabled.provider.calls.length, 0, 'saving a question is not consent to invoke a model');
  await enabled.page.locator(`[data-action="ai-run-start"][data-id="${first.id}"]`).waitFor();
  const idleStarted = gate(), idleRelease = gate();
  let idleDelayed = false;
  const firstPattern = enabled.origin + runPath(first.id);
  await enabled.page.route(firstPattern, async route => {
    if (route.request().method() !== 'GET' || idleDelayed) return route.continue();
    idleDelayed = true;
    const response = await route.fetch();
    assert.equal((await response.json()).status, 'idle');
    idleStarted.release(); await idleRelease.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  await refresh(enabled); await waitForGate(idleStarted, 'pre-start idle snapshot');
  enabled.provider.queue();
  await enabled.page.locator(`[data-action="ai-run-start"][data-id="${first.id}"]`).evaluate(button => { button.click(); button.click(); });
  await eventual(() => assert.equal(enabled.provider.calls.length, 1));
  const running = await stateIs(enabled, first.id, 'running');
  const repeated = await api(enabled, runPath(first.id) + '/start', 'POST', {});
  assert.equal(repeated.status, 'running');
  assert.equal(repeated.startedAt, running.startedAt);
  assert.equal(enabled.provider.calls.length, 1, 'repeat start cannot issue a second provider request');
  passed('explicit start and repeated click/API start issue exactly one provider invocation');

  const firstCall = enabled.provider.calls[0];
  const firstContext = JSON.parse(firstCall.body.input);
  assert.equal(firstContext.question, first.question);
  assert.equal(firstContext.sourceExcerpts[0].cardId, enabled.source);
  assert.equal(firstContext.sourceExcerpts[0].title, '流式回答的原始卡片');
  const firstPartial = '逐字保存的中文片段 🌱。';
  firstCall.delta(firstPartial);
  await stateIs(enabled, first.id, 'running', firstPartial);
  await visibleText(enabled, firstPartial); await visibleState(enabled, first.id, 'running');
  const idleResponse = enabled.page.waitForResponse(response => response.url() === firstPattern && response.request().method() === 'GET');
  idleRelease.release(); await (await idleResponse).finished();
  await enabled.page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await enabled.page.locator(`[data-ai-request="${first.id}"]`).getAttribute('data-ai-status'), 'running');
  assert.ok((await aiText(enabled)).includes(firstPartial), 'late idle reply must not erase already streamed text');
  assert.equal(await enabled.page.locator(`[data-action="ai-run-start"][data-id="${first.id}"]`).count(), 0);
  await enabled.page.unroute(firstPattern);
  passed('late pre-start idle snapshot cannot reset active stream, partial text, or cancellation controls');
  const availabilityPattern = enabled.origin + '/api/ai';
  await enabled.page.route(availabilityPattern, route => route.abort('failed'));
  await refresh(enabled); await visibleText(enabled, 'AI 状态暂时无法读取');
  assert.ok((await aiText(enabled)).includes(firstPartial), 'read failure must retain the already rendered partial');
  assert.equal(await enabled.page.locator(`[data-ai-request="${first.id}"]`).getAttribute('data-ai-status'), 'running');
  assert.equal(await enabled.page.locator(`[data-action="ai-run-cancel"][data-id="${first.id}"]`).count(), 1);
  await enabled.page.unroute(availabilityPattern); await refresh(enabled);
  await eventual(async () => assert.ok(!(await aiText(enabled)).includes('AI 状态暂时无法读取')));
  assert.equal(enabled.provider.calls.length, 1);
  passed('temporary status-read failure preserves partial output and controls, then reconnects without provider retry');
  const draft = '刷新前尚未提交的后续草稿';
  await enabled.page.locator('#ai-input').fill(draft);
  await reload(enabled); await visibleText(enabled, firstPartial);
  assert.equal(await enabled.page.locator('#ai-input').inputValue(), draft);
  assert.equal(enabled.provider.calls.length, 1, 'reload reads the existing run without resubmitting');
  const suffix = '\n完整回答保留原始卡片。<img src="https://untrusted.invalid/ai-stream" onerror="window.__AI_EXECUTED__=true">';
  firstCall.delta(suffix); firstCall.complete();
  const completed = await stateIs(enabled, first.id, 'completed', firstPartial + suffix);
  assert.equal(completed.usage.totalTokens, 20);
  await refresh(enabled); await visibleText(enabled, firstPartial + suffix);
  await reload(enabled); await visibleText(enabled, firstPartial + suffix);
  const completedHistory = await history(enabled, first.id);
  const answers = completedHistory.messages.filter(message => message.role === 'assistant' && message.requestId === first.id);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].text, firstPartial + suffix);
  assert.equal(await enabled.page.locator('#ai-messages .message').filter({ hasText: firstPartial }).count(), 1);
  await api(enabled, runPath(first.id) + '/start', 'POST', {});
  assert.equal(enabled.provider.calls.length, 1, 'completed start is sticky and idempotent');
  assert.equal(await enabled.page.evaluate(() => !!window.__AI_EXECUTED__), false);
  passed('fragmented UTF-8 SSE streams persist across reload and complete as one escaped history answer');

  await newConversation(enabled);
  const cancellation = await send(enabled, '取消时保留收到的片段');
  const cancelledCall = await start(enabled, cancellation.id);
  const cancelledPartial = '取消前已经收到并保存的内容。';
  cancelledCall.delta(cancelledPartial);
  await visibleText(enabled, cancelledPartial);
  for (let index = 1; index <= 6; index++) await send(enabled, `同一对话后续排队问题 ${index}，不启动模型`);
  await reload(enabled); await visibleText(enabled, cancelledPartial);
  await visibleState(enabled, cancellation.id, 'running');
  assert.equal(enabled.provider.calls.length, 2, 'newer queued questions do not invoke a provider or hide the existing run');
  await enabled.page.locator(`[data-action="ai-run-cancel"][data-id="${cancellation.id}"]`).click();
  await stateIs(enabled, cancellation.id, 'cancelled', cancelledPartial);
  await visibleState(enabled, cancellation.id, 'cancelled');
  assert.equal(cancelledCall.aborted, true);
  const afterCancelCount = enabled.provider.calls.length;
  await reload(enabled); await visibleText(enabled, cancelledPartial); await refresh(enabled);
  assert.equal((await runSnapshot(enabled, cancellation.id)).status, 'cancelled');
  const cancelledRepeat = await api(enabled, runPath(cancellation.id) + '/start', 'POST', {});
  assert.equal(cancelledRepeat.status, 'cancelled');
  assert.equal(enabled.provider.calls.length, afterCancelCount);
  assert.equal((await history(enabled, cancellation.id)).messages.filter(message => message.role === 'assistant').length, 0, 'cancelled partial is not misrepresented as a completed answer');
  passed('older running request remains visible and cancellable after six newer questions and reload; partial survives without rerun');

  await newConversation(enabled);
  const failed = await send(enabled, '提供方失败后不要自动重试');
  await start(enabled, failed.id, { status: 429, body: `private-upstream-trace ${fixtureCredential}` });
  const failedSnapshot = await stateIs(enabled, failed.id, 'failed');
  assert.ok(failedSnapshot.error, 'terminal failure exposes an actionable public error');
  assert.ok(!JSON.stringify(failedSnapshot).includes(fixtureCredential));
  assert.ok(!JSON.stringify(failedSnapshot).includes('private-upstream-trace'));
  const afterFailureCount = enabled.provider.calls.length;
  await reload(enabled); await refresh(enabled);
  await visibleText(enabled, failedSnapshot.error.message); await visibleState(enabled, failed.id, 'failed');
  assert.equal((await api(enabled, runPath(failed.id) + '/start', 'POST', {})).status, 'failed');
  assert.equal(enabled.provider.calls.length, afterFailureCount, '429 is never automatically retried');
  assert.equal((await api(enabled, `/api/requests/${failed.id}`)).status, 'pending', 'failed run retains the manual request');
  passed('provider failure is sanitized and visible, with no automatic retry and manual queue retained');

  // Delay a snapshot requested for the old view, then finish its provider while
  // the user opens a different conversation and edits an unrelated draft.
  await newConversation(enabled);
  const old = await send(enabled, '旧对话的慢速回答');
  const oldCall = await start(enabled, old.id);
  oldCall.delta('旧对话暂存片段。');
  await visibleText(enabled, oldCall.output);
  const oldStarted = gate(), oldRelease = gate();
  let delayed = false;
  const oldPattern = enabled.origin + runPath(old.id);
  await enabled.page.route(oldPattern, async route => {
    if (route.request().method() !== 'GET' || delayed) return route.continue();
    delayed = true;
    const response = await route.fetch(); oldStarted.release();
    await oldRelease.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  await refresh(enabled); await waitForGate(oldStarted, 'old run snapshot');
  await newConversation(enabled);
  const newer = await send(enabled, '后来打开的独立对话');
  const newDraft = '新对话中独立编辑的草稿';
  await enabled.page.locator('#ai-input').fill(newDraft);
  await visibleState(enabled, newer.id, 'idle');
  oldCall.delta('旧对话随后完成。'); oldCall.complete();
  await stateIs(enabled, old.id, 'completed');
  const delayedResponse = enabled.page.waitForResponse(response => response.url() === oldPattern && response.request().method() === 'GET');
  oldRelease.release(); await (await delayedResponse).finished();
  await enabled.page.evaluate(() => new Promise(requestAnimationFrame));
  await visibleText(enabled, newer.question);
  assert.equal(await enabled.page.locator('#ai-input').inputValue(), newDraft);
  assert.ok(!(await aiText(enabled)).includes(old.question));
  assert.ok(!(await aiText(enabled)).includes(oldCall.output));
  await enabled.page.unroute(oldPattern);
  const oldHistory = await history(enabled, old.id);
  assert.equal(oldHistory.messages.filter(message => message.role === 'assistant').length, 1);
  passed('delayed old-conversation run response cannot replace newer history or draft');

  const interrupted = await createFixture('interrupted', true);
  const unfinished = await send(interrupted, '服务重启后只恢复片段不重跑');
  const interruptedCall = await start(interrupted, unfinished.id);
  interruptedCall.delta('服务重启前持久化的片段。');
  await stateIs(interrupted, unfinished.id, 'running', interruptedCall.output);
  await visibleText(interrupted, interruptedCall.output);
  const restartPort = interrupted.server.address().port;
  await interrupted.page.goto('about:blank');
  interrupted.server.closeAllConnections();
  await new Promise(resolve => interrupted.server.close(resolve)); interrupted.server = null;
  await interrupted.service.close(); interrupted.service = null;
  // Persisted output must remain readable even if an operator disables the
  // provider during downtime. Recovery is not conditional on billing readiness.
  const restartConfig = ConfigSchema.parse({ ...interrupted.config, ai: { ...interrupted.config.ai, enabled: false } });
  interrupted.service = new Service(restartConfig, interrupted.options);
  interrupted.server = await startHttp(interrupted.service, { port: restartPort, token });
  await login(interrupted); await visibleText(interrupted, interruptedCall.output);
  await stateIs(interrupted, unfinished.id, 'interrupted', interruptedCall.output);
  await visibleState(interrupted, unfinished.id, 'interrupted');
  await reload(interrupted); await visibleText(interrupted, interruptedCall.output);
  assert.equal((await api(interrupted, runPath(unfinished.id) + '/start', 'POST', {})).status, 'interrupted');
  assert.equal(interrupted.provider.calls.length, 1, 'restart and reconnect never create a new provider invocation');
  assert.equal((await history(interrupted, unfinished.id)).messages.filter(message => message.role === 'assistant').length, 0);
  passed('service restart restores interrupted partial output even with provider disabled, without rerunning or inventing a completed answer');

  page = enabled.page;
  await enabled.page.evaluate(id => window.__app.action('conversation-open', id), cancellation.conversationId);
  await visibleText(enabled, cancelledPartial);
  await page.screenshot({ path: join(artifacts, 'ai-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390px run UI does not overflow');
  await page.screenshot({ path: join(artifacts, 'ai-mobile.png'), fullPage: true, animations: 'disabled' });
  for (const fixture of fixtures) {
    const browserState = await fixture.page.evaluate(() => JSON.stringify({ html: document.documentElement.outerHTML, local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.ok(!browserState.includes(fixtureCredential), 'provider credentials never reach browser DOM or storage');
  }
  assert.equal(disabled.provider.calls.length, 0, 'the disabled fixture stayed inactive throughout the entire journey');
  assert.equal(enabled.provider.calls.length, 4, 'only the four explicitly started runs contacted the fake provider');
  assert.equal(interrupted.provider.calls.length, 1);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, [], 'browser never contacts the provider or another external service');
  passed('390px controls remain usable with no page errors, leaked fixture credential, or external browser traffic');
  console.log('PASS F05 explicit AI execution browser + HTTP + SQLite + fake Responses SSE journey');
} catch (error) {
  failure = error;
  if (page) await page.screenshot({ path: join(artifacts, 'ai-failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  throw error;
} finally {
  for (const release of releaseGates) release();
  await writeFile(join(artifacts, 'ai-browser.json'), JSON.stringify({
    status: failure ? 'FAIL' : 'PASS', checks, pageErrors, externalRequests,
    providerInvocations: Object.fromEntries(fixtures.map(fixture => [fixture.name, fixture.provider.calls.length])),
    ...(failure ? { error: failure.stack || failure.message } : {}),
    scope: 'Real standalone browser, authenticated HTTP, SQLite, and production Responses parser using in-memory fake SSE. No actual provider API, credentials, cost, or native-host installation.',
  }, null, 2));
  await browser?.close();
  for (const fixture of fixtures) {
    fixture.provider.cleanup();
    fixture.server?.closeAllConnections();
    if (fixture.server?.listening) await new Promise(resolve => fixture.server.close(resolve));
    await fixture.service?.close();
  }
  await rm(directory, { recursive: true, force: true });
}
