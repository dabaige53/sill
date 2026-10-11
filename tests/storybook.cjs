/** Exercise the built Storybook and the same components used by the product. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'storybook-static');
const artifacts = path.join(__dirname, 'artifacts');
const load = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright', 'package.json')) : require;
const { chromium } = load('playwright');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(output, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!filename.startsWith(`${output}${path.sep}`)) { res.writeHead(403); return res.end(); }
    const real = fs.realpathSync(filename);
    if (!real.startsWith(`${output}${path.sep}`) || !fs.statSync(real).isFile()) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(real)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(real).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
const results = [];
fs.mkdirSync(artifacts, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(output, 'index.json'), 'utf8'));
const entries = Object.values(index.entries).filter(entry => entry.type === 'story');
const storyIds = new Set(entries.map(entry => entry.id));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const iconNames = Array.from(vm.runInNewContext(`${read('src/atoms/icons.js')}; Object.keys(Glyphs)`));
const cardKeys = Array.from(vm.runInNewContext(`${read('src/data/card-catalog.js')}; CardCatalog.variants.map(item => item.key)`));
const componentKeys = [...read('src/views/library.js').matchAll(/\{key:'([^']+)',title:/g)].map(match => match[1]);
const stateKeys = ['default', 'read', 'bookmarked', 'selected', 'snoozed', 'completed'];
const componentId = key => {
  const matches = entries.filter(entry => entry.id.startsWith('components-') && entry.id.endsWith(`--${key}`));
  assert.equal(matches.length, 1, `exactly one component story is required for ${key}`);
  return matches[0].id;
};
const snapshot = (page, name, options = {}) => page.screenshot({ animations: 'disabled', path: path.join(artifacts, name), ...options });
const ready = async surface => {
  await surface.locator('.qg-story:visible, .sb-errordisplay:visible').first().waitFor({ state: 'visible', timeout: 12000 });
  const error = surface.locator('.sb-errordisplay');
  if (await error.isVisible()) throw new Error(`Storybook render error: ${await error.innerText()}`);
};
const storageSentinel = JSON.stringify({ version: 2, items: { 'article-01': { bookmarked: true, note: 'product data must survive Storybook' } } });

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    async function scenario(name, fn, options = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
      const page = await context.newPage(), errors = [], external = [];
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`) || /^(data:|blob:)/.test(url)) return route.continue();
        external.push(url); return route.abort();
      });
      await context.addInitScript(value => localStorage.setItem('quiet-glass-v1', value), storageSentinel);
      try {
        await fn(page, context);
        assert.deepEqual(errors, [], 'uncaught browser errors');
        assert.deepEqual(external, [], 'the static component library must work without external requests');
        assert.equal(await page.evaluate(() => localStorage.getItem('quiet-glass-v1')), storageSentinel, 'Storybook changed product storage');
        results.push({ name, status: 'PASS' }); console.log('PASS', name);
      } catch (error) {
        const screenshot = `storybook-failure-${results.length + 1}.png`;
        await snapshot(page, screenshot).catch(() => {});
        results.push({ name, status: 'FAIL', error: error.message, screenshot, pageErrors: errors, externalRequests: external });
        console.error('FAIL', name, error.message);
      } finally { await context.close(); }
    }
    const gotoStory = async (page, id, args = '') => {
      assert.ok(storyIds.has(id), `missing story ${id}`);
      await page.goto(`${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${encodeURIComponent(args)}` : ''}`);
      await ready(page);
    };
    await scenario('Story index covers every source icon, card form, state and component', async page => {
      assert.equal(iconNames.length, 38); assert.equal(cardKeys.length, 13); assert.equal(componentKeys.length, 29);
      for (const key of iconNames) assert.ok(storyIds.has(`icons--${key}`), `missing icon ${key}`);
      for (const key of cardKeys) assert.ok(storyIds.has(`cards--${key}`), `missing card ${key}`);
      for (const key of stateKeys) assert.ok(storyIds.has(`card-states--${key}`), `missing state ${key}`);
      for (const key of componentKeys) componentId(key);
      assert.ok(entries.length >= 94, `only ${entries.length} stories registered`);
      await gotoStory(page, 'icons--overview');
    });
    await scenario('Every declared story renders without runtime errors', async page => {
      const failures = [];
      let consecutiveFailures = 0, attempted = 0;
      for (const entry of entries) {
        attempted++;
        try {
          await gotoStory(page, entry.id);
          assert.ok((await page.locator('#storybook-root').innerText()).trim().length > 0, `empty story ${entry.id}`);
          assert.equal(await page.locator('#modal').count() <= 1, true, 'duplicate modal');
          assert.equal(await page.locator('#ai-panel').count() <= 1, true, 'duplicate AI panel');
          assert.equal(await page.locator('.sb-errordisplay').isVisible().catch(() => false), false, 'Storybook render error');
          assert.equal(await page.evaluate(() => localStorage.getItem('quiet-glass-v1')), storageSentinel, `${entry.id} changed product storage`);
          consecutiveFailures = 0;
        } catch (error) {
          failures.push({ id: entry.id, error: error.message });
          await snapshot(page, `storybook-render-${entry.id}.png`).catch(() => {});
          if (++consecutiveFailures >= 3) {
            failures.push({ unexecuted: entries.length - attempted, error: 'Stopped after three consecutive render failures; complete coverage is required to pass.' });
            break;
          }
        }
      }
      assert.deepEqual(failures, [], 'some declared stories failed to render');
    });
    await scenario('Storybook sidebar and Controls edit the real icon and reset on reload', async page => {
      await page.goto(`${origin}/?path=/story/icons--playground`);
      const canvas = page.frameLocator('#storybook-preview-iframe');
      await ready(canvas);
      assert.ok(await page.locator('[data-item-id]').count() >= 5, 'Storybook sidebar is missing');
      const controlsTab = page.getByRole('tab', { name: /^Controls/ });
      if (await controlsTab.count()) await controlsTab.click();
      const size = page.locator('#control-size');
      await size.waitFor({ state: 'visible' });
      const initial = await canvas.locator('.qg-icon-surface svg.icon').getAttribute('width');
      const type = await size.getAttribute('type');
      if (type === 'range') { await size.focus(); await size.press('End'); }
      else { await size.fill('32'); await size.press('Tab'); }
      await page.waitForFunction(value => {
        const icon = document.querySelector('#storybook-preview-iframe')?.contentDocument?.querySelector('.qg-icon-surface svg.icon');
        return icon && icon.getAttribute('width') !== value;
      }, initial);
      await snapshot(page, 'storybook-overview.png');
      await page.goto(`${origin}/?path=/story/icons--playground`);
      await ready(canvas);
      assert.equal(await canvas.locator('.qg-icon-surface svg.icon').getAttribute('width'), initial, 'clean story URL must restore default args');
    });
    await scenario('Icon and state galleries expose the full shared inventory', async page => {
      await gotoStory(page, 'icons--overview');
      const names = await page.locator('[data-icon-name]').evaluateAll(nodes => nodes.map(node => node.dataset.iconName));
      assert.deepEqual(names.sort(), [...iconNames].sort());
      assert.ok(await page.locator('[data-icon-name] svg.icon').count() >= 38);
      await snapshot(page, 'storybook-icons.png', { fullPage: true });
      await gotoStory(page, 'cards--overview');
      const variants = await page.locator('[data-card-variant]').evaluateAll(nodes => nodes.map(node => node.dataset.cardVariant));
      assert.deepEqual(variants.sort(), [...cardKeys].sort());
      assert.equal(new Set(await page.locator('[data-card-type]').evaluateAll(nodes => nodes.map(node => node.dataset.cardType))).size, 10);
      await snapshot(page, 'storybook-cards-all.png', { fullPage: true });
      await gotoStory(page, 'card-states--overview');
      assert.equal(await page.locator('[data-card-state]').count(), 6);
      assert.equal(await page.locator('[data-card-state] [data-action]').count(), 0, 'state specimens must stay passive');
      await snapshot(page, 'storybook-card-states.png', { fullPage: true });
    });
    await scenario('Article preview opens from keyboard and returns focus without marking read', async page => {
      await gotoStory(page, 'cards--article-image');
      await snapshot(page, 'storybook-card.png');
      const title = page.locator('.card-title-button').first();
      await title.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#modal').open);
      assert.equal(await page.evaluate(() => window.__storybookQuietGlass.Store.item('article-01').seen), true);
      assert.equal(await page.evaluate(() => window.__storybookQuietGlass.Store.item('article-01').read), false);
      await snapshot(page, 'storybook-card-preview.png');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#modal').open);
      assert.equal(await title.evaluate(node => node === document.activeElement), true, 'preview lost keyboard focus');
    });
    await scenario('Task and reminder actions use isolated real state and reload cleanly', async page => {
      await gotoStory(page, 'cards--task-active');
      const task = page.locator('[data-action="task"][aria-checked="false"]').first();
      const taskId = await task.getAttribute('data-extra');
      await task.focus(); await page.keyboard.press('Space');
      assert.equal(await page.evaluate(id => window.__storybookQuietGlass.Store.tasks(window.__storybookQuietGlass.Store.card('task-01')).find(item => item.id === id).done, taskId), true);
      assert.equal(await page.locator('#modal').evaluate(node => node.open), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('quiet-glass-v1')), storageSentinel);
      await page.reload(); await ready(page);
      assert.equal(await page.evaluate(id => window.__storybookQuietGlass.Store.tasks(window.__storybookQuietGlass.Store.card('task-01')).find(item => item.id === id).done, taskId), false, 'story interaction survived a reload');
      await gotoStory(page, 'cards--reminder-compact');
      await page.locator('[data-action="complete-reminder"]').first().click();
      assert.equal(await page.evaluate(() => window.__storybookQuietGlass.Store.item('reminder-01').reminderDone), true);
      assert.equal(await page.locator('#modal').evaluate(node => node.open), false);
    });
    await scenario('Checkbox and AI draft specimens preserve the actual interaction boundaries', async page => {
      await gotoStory(page, componentId('checkbox'));
      const checkbox = page.locator('[data-action="catalog-check"]').first();
      assert.equal(await checkbox.getAttribute('aria-checked'), 'false');
      await checkbox.click(); assert.equal(await checkbox.getAttribute('aria-checked'), 'true');
      await gotoStory(page, componentId('ai-compose'));
      const draft = '请整理这些卡片的共同主题';
      await page.getByRole('textbox', { name: 'AI 提问草稿示例' }).fill(draft);
      await page.locator('[data-action="catalog-compose"]').click();
      await page.locator('#ai-panel').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#ai-input').inputValue(), draft);
      assert.equal(await page.evaluate(() => window.__storybookQuietGlass.app.messages.length), 0, 'adding a draft automatically sent it');
      assert.equal(await page.locator('#ai-messages .message').count(), 0);
      await snapshot(page, 'storybook-components.png');
    });
    await scenario('Repeated Controls renders keep a single live controller and no stale state', async page => {
      await page.goto(`${origin}/?path=/story/cards--playground`);
      const canvas = page.frameLocator('#storybook-preview-iframe');
      await ready(canvas);
      const controlsTab = page.getByRole('tab', { name: /^Controls/ });
      if (await controlsTab.count()) await controlsTab.click();
      const titleControl = page.locator('#control-title');
      await titleControl.waitFor({ state: 'visible' });
      for (const title of ['第一次参数修改', '第二次参数修改', '第三次参数修改']) {
        await titleControl.fill(title); await titleControl.press('Tab');
        await canvas.getByRole('button', { name: title, exact: true }).waitFor({ state: 'visible' });
        assert.equal(await canvas.locator('#modal').count(), 1);
        assert.equal(await canvas.locator('#ai-panel').count(), 1);
      }
      await canvas.locator('.card-title-button').click();
      await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('#modal').open);
      const stateControl = page.locator('#control-state');
      await stateControl.selectOption('bookmarked');
      await page.waitForFunction(() => !document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('#modal').open);
      assert.equal(await canvas.locator('#modal').count(), 1);
      assert.equal(await canvas.locator('#ai-panel').count(), 1);
      const frame = page.frames().find(item => item.url().includes('iframe.html'));
      assert.equal(await frame.evaluate(() => window.__storybookQuietGlass.app.messages.length), 0);
      assert.equal(await frame.evaluate(() => window.__storybookQuietGlass.Store.item('article-01').seen), false, 'args changes leaked interaction state');
      await page.locator('[data-item-id="cards--task-active"]').click();
      await canvas.locator('.qg-story[data-story-variant="task-active"]').waitFor({ state: 'visible' });
      const task = canvas.locator('[data-action="task"][aria-checked="false"]').first();
      const taskId = await task.getAttribute('data-extra');
      await task.click();
      await page.locator('[data-item-id="cards--article-image"]').click();
      await canvas.locator('.qg-story[data-story-variant="article-image"]').waitFor({ state: 'visible' });
      assert.equal(await canvas.locator('#modal').count(), 1);
      assert.equal(await canvas.locator('#ai-panel').count(), 1);
      assert.equal(await frame.evaluate(id => window.__storybookQuietGlass.Store.tasks(window.__storybookQuietGlass.Store.card('task-01')).find(item => item.id === id).done, taskId), false, 'switching stories leaked task state');
    });
    for (const width of [390, 320]) await scenario(`${width}px Canvas keeps cards and components within the viewport`, async page => {
      for (const { id } of entries) {
        await gotoStory(page, id);
        const dimensions = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          layout: innerWidth,
          visual: visualViewport.width,
          contentRight: Math.max(...Array.from(document.querySelectorAll('.qg-story, .qg-card-workbench, .qg-component-workbench')).map(node => node.getBoundingClientRect().right)),
        }));
        // Mobile browsers can expand innerWidth to fit overflowing content.
        // Compare against the configured device width, not that expanded value.
        assert.ok(Object.values(dimensions).every(value => value <= width + 1), `${id} overflows at ${width}px: ${JSON.stringify(dimensions)}`);
      }
      await gotoStory(page, 'cards--article-image');
      if (width === 390) await snapshot(page, 'storybook-mobile.png', { fullPage: true });
    }, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const report = { generatedAt: new Date().toISOString(), storyCount: entries.length, coverage: { icons: iconNames.length, cardForms: cardKeys.length, cardStates: stateKeys.length, components: componentKeys.length }, results };
    fs.writeFileSync(path.join(artifacts, 'storybook-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    assert.equal(results.filter(item => item.status === 'FAIL').length, 0, 'Storybook browser checks failed');
    console.log(`Storybook: ${entries.length} stories; ${results.length} browser scenarios passed.`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
