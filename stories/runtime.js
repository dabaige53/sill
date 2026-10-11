/** Storybook adapter: product renderers, isolated in-memory state, owned lifecycle. */
import {
  Glyphs, IconCatalog, icon, esc, button, ring, SeedCards, FreshCards,
  CardTypes, CardCatalog, cardHTML, ComponentCatalog, componentSpecimen,
  Sources, Store, FeedPolicy, MotionEngine, Panels, AIView, AppController,
  cleanupRuntimeTimers,
} from 'virtual:quiet-glass';

let currentStory = null;
const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, Number(value) || fallback));
const element = (html) => { const node = document.createElement('div'); node.innerHTML = html; return node.firstElementChild; };
const frameWidth = (width, fallback = 440) => bounded(width, fallback, 240, 1400);

function resetMemory() {
  Store.state = {
    cards: structuredClone(SeedCards), items: {}, seconds: 0,
    demoStartedAt: Date.now(), freshIds: [],
    preferences: { reduceTransparency: false, sort: 'priority' }, storageAvailable: true,
  };
}

// This Store instance belongs to the virtual Storybook module only. Product
// source remains unchanged, including its original persistence implementation.
Store.save = () => {};
Store.load = () => { resetMemory(); return Store.state; };

export function cleanupStory() {
  const live = currentStory;
  currentStory = null;
  if (live) {
    live.events.abort();
    live.app.aiVersion = (live.app.aiVersion || 0) + 1;
    live.app.aiBusy = false;
    live.app.pauseMedia();
    ['toastTimer', 'dockTimer', 'searchTimer', 'readTicker', 'mediaTimer'].forEach(key => {
      clearTimeout(live.app[key]); clearInterval(live.app[key]);
    });
    MotionEngine.cancelPanel(live.app.dialog);
    if (live.app.dialog.open) live.app.dialog.close();
    live.root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    live.toast.getAnimations().forEach(animation => animation.cancel());
    live.toast.remove();
    live.root.remove();
    document.body.classList.toggle('opaque', live.previousOpaque);
    document.body.classList.remove('is-dragging', 'qg-storybook');
    if (live.previousView === undefined) delete document.body.dataset.view;
    else document.body.dataset.view = live.previousView;
    document.documentElement.style.overflow = live.previousOverflow;
  }
  cleanupRuntimeTimers();
  MotionEngine.clearReturns();
  delete window.__storybookQuietGlass;
}

function shell() {
  return `<div class="qg-story-shell">
    <div id="dock"><div class="dock-tools" role="group" aria-label="预览工具">${button('filter', '打开筛选预览', 'filter')}${button('info', '当前预览说明', 'settings')}</div><button type="button" id="orb" class="icon-button glass" data-action="ai" aria-label="打开本地 AI 交互预览" aria-expanded="false">${icon('sparkles', 24)}</button><button id="new-count" class="glass" data-action="show-new" hidden></button></div>
    <div id="selection-bar" class="glass" hidden><span class="selection-count"></span>${button('sparkles','将选中的卡片加入 AI','selected-ai')}${button('bookmark','收藏选中的卡片','selected-bookmark')}${button('x','取消选择','clear-selection')}</div>
    <div id="drop-targets" hidden></div>${AIView.shell()}<dialog id="modal" aria-labelledby="modal-title"></dialog>
    <div id="toast" role="status" aria-live="polite" hidden><span id="toast-text"></span><span id="toast-action"></span></div>
    <div id="announcer" class="sr-only" aria-live="polite"></div>
  </div>`;
}

function createStory({ kind, title, description, source, content, interactive = true }) {
  cleanupStory();
  resetMemory();
  const root = element(`<section class="qg-story" data-story-kind="${esc(kind)}">
    <header class="qg-story-heading"><span class="qg-story-eyebrow">QUIET GLASS / DESIGN SYSTEM</span><h1 id="page-title">${esc(title)}</h1><p>${esc(description)}</p></header>
    <div class="feed-grid is-catalog qg-story-canvas" id="feed-grid">${typeof content === 'function' ? content() : content}</div>
    <footer class="qg-story-note"><span>${icon('layers', 15)} 与产品共享源码</span><code>${esc(source)}</code><p>Controls 与页面操作仅改变当前预览。保存设计请修改源文件或 Story 参数，并提交 Git。</p></footer>
    ${shell()}</section>`);
  root.classList.toggle('qg-static-story', !interactive);
  const app = new AppController();
  const events = new AbortController();
  const live = {
    root, app, events, toast: root.querySelector('#toast'),
    previousOpaque: document.body.classList.contains('opaque'),
    previousView: document.body.dataset.view,
    previousOverflow: document.documentElement.style.overflow,
  };
  currentStory = live;
  document.body.classList.remove('opaque');
  document.body.classList.add('qg-storybook');
  document.body.dataset.view = 'storybook';
  app.mode = 'storybook'; app.baseMode = 'storybook';
  app.grid = root.querySelector('#feed-grid');
  app.dialog = root.querySelector('#modal');
  app.layout = { layout() {}, schedule() {} };
  app.drag = { active: null, suppressUntil: 0 };
  app.updateSelection = () => {
    app.grid.querySelectorAll('[data-card]').forEach(node => node.classList.toggle('is-selected', app.selected.has(node.dataset.card)));
    const bar = root.querySelector('#selection-bar');
    bar.hidden = app.selected.size === 0;
    bar.querySelector('.selection-count').textContent = `${app.selected.size} 张`;
  };
  app.renderCurrent = () => app.updateSelection();
  app.route = () => {};
  app.navigate = hash => {
    const match = /^#(card|read)\/(.+)$/.exec(hash);
    if (match) app.showPreview(match[2], match[1] === 'read');
    else app.toast('请使用左侧 Storybook 目录切换组件。');
  };
  app.closeModal = () => {
    if (app.panelReturn) { const back = app.panelReturn; app.panelReturn = null; app.showPreview(back.id, back.reading); }
    else if (app.modalKind === 'reader') app.showPreview(app.currentId, false);
    else app.closeNative();
  };
  // Reader scroll listeners belong to this Canvas, not to the product router.
  app.showPreview = (id, reading = false) => {
    const card = Store.card(id); if (!card || currentStory !== live) return;
    const sourceCard = app.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
    const origin = MotionEngine.capture(app.dialog.open && app.currentId === id ? app.dialog : sourceCard);
    app.currentId = id; Store.patch(id, { seen: true }); app.refreshCard(id);
    app.openModal(Panels.preview(app, card, reading), reading ? 'reader' : 'preview', origin);
    if (reading) {
      const scroll = app.dialog.querySelector('#reader-scroll');
      const saved = Store.item(id).progress;
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * (saved >= .98 ? 0 : saved);
      scroll.addEventListener('scroll', () => app.updateReading(id, scroll), { passive: true, signal: events.signal });
    } else if (card.type === 'media') { app.mediaIndex = Math.min(3, Math.floor(Store.item(id).progress * 4)); app.paintMedia(); }
  };
  app.openAI = () => {
    const panel = root.querySelector('#ai-panel'), hidden = panel.hidden;
    panel.hidden = false; app.paintAI();
    if (hidden) MotionEngine.enter(panel);
    root.querySelector('#ai-input').focus({ preventScroll: true }); app.hideDock();
  };
  app.attach = ids => {
    ids.filter(id => Store.card(id)).forEach(id => { if (!app.contexts.includes(id)) app.contexts.push(id); });
    app.closeNative(); app.openAI(); app.selected.clear(); app.updateSelection();
    app.announce(`已加入 ${ids.length} 张卡片，尚未发送。`);
  };
  app.withFeedAnchor = change => { change(); app.grid.querySelectorAll('[data-card]').forEach(node => app.refreshCard(node.dataset.card)); app.updateSelection(); };
  app.changeReminder = (id, action) => {
    const card = Store.card(id); if (!card || !FeedPolicy.supports(card)) return;
    const before = { ...Store.item(id) };
    const patch = action === 'snooze' ? { snoozedUntil: Date.now() + 600000, dismissed: false, reminderDone: false }
      : action === 'dismiss-reminder' ? { dismissed: true, snoozedUntil: 0 }
      : action === 'complete-reminder' ? { reminderDone: true, snoozedUntil: 0 }
      : { snoozedUntil: 0, dismissed: false, reminderDone: false };
    Store.patch(id, patch); app.closeNative(false); app.refreshCard(id);
    app.toast(({ snooze: '已延后十分钟', 'dismiss-reminder': '已忽略此提醒', 'complete-reminder': '提醒已完成', 'restore-reminder': '已恢复提醒' })[action], () => { Store.patch(id, before); app.refreshCard(id); });
  };
  app.refresh = () => {
    const fresh = FreshCards.find(card => !Store.card(card.id) && !app.pendingCards.some(item => item.id === card.id));
    if (fresh) app.pendingCards.push(structuredClone(fresh));
    app.paintPending(); app.toast(fresh ? '演示内容已进入等待队列，点击入口旁的数字查看。' : '已经是最新的演示内容');
  };
  app.showNew = () => { const count = Store.insert(app.pendingCards); app.pendingCards = []; app.paintPending(); app.toast(`已加入 ${count} 张演示卡片；当前组件保持原位。`); };
  const productOpenPanel = app.openPanel.bind(app);
  app.openPanel = (kind, id = '') => {
    productOpenPanel(kind, id);
    if (kind === 'editor') app.dialog.querySelector('.panel-footer p').textContent = '仅保留在本次 Story 预览';
    if (kind === 'settings') {
      const notes = app.dialog.querySelectorAll('.settings-note');
      if (notes[0]) notes[0].textContent = '这里使用真实组件与交互。在 Storybook 中点击卡片上的 AI 入口加入引用；拖动操作请在产品信息流体验。';
      if (notes[1]) notes[1].textContent = 'Enter 打开卡片。Esc 关闭浮层。Cmd/Ctrl + K 搜索。关闭预览后回到当前 Canvas，页面操作不会改写 Storybook 地址。';
    }
  };
  const productAction = app.action.bind(app);
  app.action = (name, id = '', extra = '', target = null, event = null) => {
    if (name.startsWith('view-')) { app.closeNative(); app.toast('请使用左侧 Storybook 目录打开对应的组件或资料。'); return; }
    if (name === 'apply-filter') { const count = app.filtered().length; app.closeNative(); app.toast(`找到 ${count} 张演示卡片 · 当前组件保持原位`); return; }
    if (name === 'clear-filter') { app.filter = { type: 'all', status: 'all', tag: '', query: '' }; if (app.modalKind === 'filter') app.repaintFilter(); else app.toast('筛选已清空'); return; }
    productAction(name, id, extra, target, event);
    if (name === 'save-note') app.toast('标签与备注已保存到本次预览');
  };
  const on = (target, name, listener, options = {}) => target.addEventListener(name, listener, { ...options, signal: events.signal });
  const owns = target => root.contains(target) || live.toast.contains(target);
  on(document, 'click', event => { if (root.isConnected && owns(event.target)) app.click(event); });
  on(document, 'input', event => { if (root.isConnected && owns(event.target)) app.input(event); });
  on(document, 'keydown', event => { if (root.isConnected && (owns(event.target) || event.target === document.body)) app.key(event); });
  on(document, 'focusin', event => { if (!root.isConnected) return; const menu = app.grid.querySelector('.card-more-menu'); if (menu && !menu.contains(event.target) && !event.target.closest?.('[data-action="card-more"]')) app.closeMore(); });
  on(app.dialog, 'cancel', event => { event.preventDefault(); app.closeModal(); });
  on(app.dialog, 'click', event => { if (event.target !== app.dialog) return; const rect = app.dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) app.closeModal(); });
  const dock = root.querySelector('#dock');
  on(dock, 'pointerenter', () => app.openDock()); on(dock, 'pointerleave', () => app.hideDock());
  on(dock, 'focusin', () => app.openDock());
  on(dock, 'focusout', event => { if (!dock.contains(event.relatedTarget)) app.hideDock(); });
  window.__storybookQuietGlass = { app, Store, root };
  return root;
}

export function renderIcon({ name = 'sparkles', size = 32, color = '#496656', disabled = false } = {}) {
  const key = Object.hasOwn(Glyphs, name) ? name : 'sparkles';
  const meta = IconCatalog.icons[key] || { name: key, purpose: '共享图标' };
  const root = createStory({ kind: 'icon', title: meta.name, description: meta.purpose, source: 'src/atoms/icons.js · icon(name, size)', content: `<div class="qg-icon-workbench"><div class="qg-icon-surface"><button type="button" class="qg-icon-button" data-action="lab-icon" data-extra="${esc(key)}" aria-label="${esc(meta.name)}" ${disabled ? 'disabled' : ''}>${icon(key, bounded(size, 32, 12, 96))}</button></div><div class="qg-icon-details"><code>${esc(key)}</code><p>24 × 24 viewBox · 1.65 px 描边<br>使用 currentColor，与所在控件保持一致。</p><div class="qg-icon-scale">${[18, 24, 32].map(n => `<span>${icon(key, n)}<small>${n} px</small></span>`).join('')}</div></div></div>` });
  root.querySelector('.qg-icon-workbench').style.color = color;
  return root;
}

export function renderIcons({ size = 28, color = '#496656' } = {}) {
  const root = createStory({ kind: 'icons', title: '图标目录', description: `${Object.keys(Glyphs).length} 个共享 SVG 图标。每个图形来自产品的同一份路径，可在 Controls 调整尺寸与颜色。`, source: 'src/atoms/icons.js · src/data/icon-catalog.js', content: () => IconCatalog.groups.map(group => {
    const keys = Object.keys(Glyphs).filter(key => (IconCatalog.icons[key]?.group || 'uncategorized') === group.key);
    if (!keys.length) return '';
    return `<section class="catalog-section"><div class="catalog-section-head"><div><span class="qg-story-eyebrow">${esc(group.key)} / ${keys.length}</span><h2>${esc(group.title)}</h2></div><p>${esc(group.description)}</p></div><div class="catalog-grid icon-catalog-grid">${keys.map(key => { const meta = IconCatalog.icons[key] || { name: key, purpose: '' }; return `<article class="icon-tile" data-icon-name="${esc(key)}"><div class="icon-tile-preview"><button type="button" class="qg-icon-button" data-action="lab-icon" data-extra="${esc(key)}" aria-label="${esc(meta.name)}">${icon(key, bounded(size, 28, 12, 64))}</button></div><div class="icon-tile-meta"><h3>${esc(meta.name)}</h3><code class="catalog-code">${esc(key)}</code><p>${esc(meta.purpose)}</p></div></article>`; }).join('')}</div></section>`;
  }).join('') });
  root.querySelectorAll('.icon-tile-preview').forEach(node => { node.style.color = color; });
  return root;
}

function applyCardState(card, state) {
  const values = typeof state === 'object' && state ? { ...state } : { ...(CardCatalog.states().find(item => item.key === state)?.state || {}) };
  if (state === 'completed') {
    if (card.type === 'task') values.taskDone = (card.tasks || []).map(task => task.id);
    else if (card.type === 'reminder') { delete values.taskDone; values.reminderDone = true; }
  }
  Store.patch(card.id, values);
  return values;
}

export function renderCard({ variant = 'article-image', state = 'default', title, summary, width = 440 } = {}) {
  const sample = CardCatalog.variants.find(item => item.key === variant) || CardCatalog.variants[0];
  let selected = false;
  const root = createStory({ kind: 'card', title: sample.title, description: `${sample.anatomy}。${sample.behavior.replace('展示当前浏览器真实状态。', '展示本次预览状态。')}`, source: 'src/cards/templates.js · cardHTML(card) · src/data/card-catalog.js', content: () => {
    const card = Store.card(sample.id);
    if (typeof title === 'string' && title) card.title = title;
    if (typeof summary === 'string' && summary) card.summary = summary;
    selected = !!applyCardState(card, state).selected;
    return `<div class="qg-card-workbench" style="width:${frameWidth(width)}px"><div class="catalog-card-stage">${cardHTML(card)}</div><p class="qg-interaction-hint">${icon('eye', 15)} 点击标题预览 · 卡内直接操作 · 更多动作按需出现</p></div>`;
  } });
  root.dataset.storyVariant = sample.key;
  root.dataset.storyState = typeof state === 'string' ? state : 'custom';
  if (selected) { currentStory.app.selected.add(sample.id); currentStory.app.updateSelection(); }
  return root;
}

export function renderCardStates() {
  return createStory({ kind: 'card-states', title: '状态也是设计的一部分', description: '6 种状态来自同一套卡片渲染器。这里保留并排的静态样本；打开单张卡片 Story 可体验操作。', source: 'src/data/card-catalog.js · CardCatalog.states() · cardHTML(card, { state, passive: true })', interactive: false, content: () => `<div class="catalog-grid catalog-state-grid">${CardCatalog.states().map((sample, index) => `<section class="card-specimen is-passive" data-card-state="${esc(sample.key)}"><header><span class="specimen-kicker">STATE ${String(index + 1).padStart(2, '0')}</span><h3>${esc(sample.title)}</h3></header><div class="catalog-card-stage">${cardHTML(Store.card(sample.id), { state: sample.state, passive: true })}</div><div class="catalog-caption"><p>${esc(sample.caption)}</p></div></section>`).join('')}</div>` });
}

export function renderCards() {
  return createStory({ kind: 'cards', title: '卡片目录', description: '10 种内容，13 种呈现。所有样卡共享产品模板，可以预览、勾选、收藏或加入本地 AI 对话。', source: 'src/cards/templates.js · src/data/card-catalog.js', content: () => `<div class="catalog-grid catalog-card-grid">${CardCatalog.variants.map((sample, index) => `<section class="card-specimen" data-card-type="${esc(sample.type)}" data-card-form="${esc(sample.form)}" data-card-variant="${esc(sample.key)}"><header><span class="specimen-kicker">${String(index + 1).padStart(2, '0')} / ${esc(sample.type)} · ${esc(sample.form)}</span><h3>${esc(sample.title)}</h3></header><div class="catalog-card-stage">${cardHTML(Store.card(sample.id))}</div><div class="catalog-caption"><p>${esc(sample.anatomy)}</p><p>${esc(sample.behavior.replace('展示当前浏览器真实状态。', '展示本次预览状态。'))}</p></div></section>`).join('')}</div>` });
}

function tuneComponent(root, key, { label, disabled, progress }) {
  const preview = root.querySelector('.component-preview');
  if (!preview) return;
  if (disabled) preview.querySelectorAll('button,input,textarea').forEach(node => { node.disabled = true; });
  if (label) {
    const value = String(label);
    if (key === 'icon-button') preview.querySelector('button').setAttribute('aria-label', value);
    else if (key === 'action-button') preview.querySelector('button').textContent = value;
    else if (key === 'checkbox') { const item = preview.querySelector('.check-item'); item.querySelector('span:last-child').textContent = value; item.setAttribute('aria-label', value); }
    else if (['search-field', 'textarea', 'ai-compose'].includes(key)) { const field = preview.querySelector('input,textarea'); field.placeholder = value; field.setAttribute('aria-label', value); }
    else if (key === 'tag-chip') { const chip = preview.querySelector('button'); chip.textContent = value; chip.dataset.extra = value; }
    else if (key === 'toggle') { preview.querySelector('.setting-row>div>span').textContent = value; preview.querySelector('button').setAttribute('aria-label', value); }
  }
  if (key === 'progress-ring' && progress !== undefined) {
    const value = Math.max(0, Math.min(100, Number(progress) || 0));
    preview.querySelector('#lab-rings').innerHTML = [24, 36, 52, 22].map(size => ring(value / 100, size)).join('');
    preview.querySelector('input').value = String(value);
  }
}

export function renderComponent({ component = 'icon-button', width = 720, label = '', disabled, progress = 55 } = {}) {
  const root = createStory({ kind: 'component', title: '组件工作台', description: '体验真实控件、状态与完整面板。所有操作保留在当前 Story，切换故事或参数后恢复初始状态。', source: 'src/views/library.js · ComponentCatalog.sections() · src/atoms/primitives.js', content: () => {
    const items = ComponentCatalog.sections().flatMap(section => section.items);
    const sample = items.find(item => item.key === component) || items[0];
    // Catalog copy describes product persistence; the sandbox uses preview-only state.
    const description = sample.description.replace('在保存后保留于当前浏览器', '在保存后保留于本次预览').replace('实际备注在编辑面板中保存', '本次预览备注可在编辑面板中保存');
    return `<div class="qg-component-workbench" style="width:${frameWidth(width, 720)}px">${componentSpecimen({ ...sample, description })}</div>`;
  } });
  root.dataset.storyComponent = component;
  const specimen = root.querySelector('[data-component]');
  root.querySelector('h1').textContent = specimen.querySelector('h3').textContent;
  tuneComponent(root, specimen.dataset.component, { label, disabled, progress });
  return root;
}

export function renderTokens() {
  const colors = [['--canvas','画布'],['--card','内容表面'],['--ink','正文'],['--muted','次级文字'],['--faint','浅色填充'],['--accent','动作与选中'],['--alert','提醒'],['--line','分割线'],['--glass','轻玻璃'],['--glass-thick','厚玻璃']];
  const metrics = [['--gap','基础间距'],['--card-radius','卡片圆角'],['--image-radius','图像圆角'],['--panel-radius','面板圆角'],['--fast','即时反馈'],['--base','基本过渡'],['--layout','位置过渡']];
  const styles = getComputedStyle(document.documentElement);
  return createStory({ kind: 'tokens', title: '从共同的尺度开始', description: '这些值直接读取产品 CSS 变量。调整一次颜色、留白、圆角或动效节奏，即可统一所有组件。', source: 'src/styles/tokens.css · src/styles/styles.json', interactive: false, content: `<section class="catalog-section"><div class="catalog-section-head"><h2>色彩与材质</h2><p>低对比背景，清晰的内容与操作层。</p></div><div class="qg-token-grid">${colors.map(([name, label]) => `<article class="qg-token"><div class="qg-token-color" style="background:var(${name})"></div><h3>${label}</h3><code>${name}</code><small>${esc(styles.getPropertyValue(name).trim())}</small></article>`).join('')}</div></section><section class="catalog-section"><div class="catalog-section-head"><h2>间距、圆角与节奏</h2></div><div class="qg-metric-grid">${metrics.map(([name, label]) => `<article class="qg-metric"><strong>${esc(styles.getPropertyValue(name).trim())}</strong><span>${label}</span><code>${name}</code></article>`).join('')}</div></section><section class="qg-type-panel"><span class="qg-story-eyebrow">TYPOGRAPHY</span><h2>让内容呼吸，让交互清楚。</h2><p>系统字体负责界面与正文，宋体用于摘录中的节奏。标题、摘要、元信息逐层降低视觉权重。</p><blockquote>界面的安静，来自每一个恰当的决定。</blockquote><code>var(--font) · 系统中文与西文字体</code></section>` });
}

export function renderReferences() {
  return createStory({ kind: 'references', title: '设计参考档案', description: `${Sources.length} 项资料单独维护：参考规则、交互实现和可体验组件。参考目录与产品实现保持明确对应。`, source: 'src/data/sources.js · docs/DESIGN-SYSTEM.md', interactive: false, content: `<div class="source-grid">${Sources.map((item, index) => `<article class="source-card" data-source="${esc(item.id)}"><div class="source-topline"><span class="specimen-caption">${String(index + 1).padStart(2, '0')}</span><span class="source-kind">${esc(item.kind)}</span></div><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><p>${esc(item.note)}</p><a class="source-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(new URL(item.url).hostname)}</span>${icon('external',16)}</a></article>`).join('')}</div>` });
}

export function renderWelcome() {
  return createStory({ kind: 'welcome', title: '安静，有自己的秩序。', description: 'Quiet Glass 设计系统。把图标、卡片与交互组件保存在一个可以浏览、试用和持续维护的地方。', source: 'stories/ · src/ · .storybook/', interactive: false, content: () => `<div class="qg-welcome"><div class="qg-welcome-copy"><span class="qg-status">${icon('check-circle', 16)} 真实组件 · 共享源码</span><h2>看见每个细节，<br>再把它们组合起来。</h2><p>左侧目录是你的组件索引。选择一个 Story，在 Controls 调整内容、尺寸与状态，在 Canvas 体验它的实际行为。</p><div class="qg-welcome-counts"><div><strong>${Object.keys(Glyphs).length}</strong><span>共享图标</span></div><div><strong>${CardCatalog.variants.length}</strong><span>卡片呈现</span></div><div><strong>${ComponentCatalog.sections().flatMap(section => section.items).length}</strong><span>交互组件</span></div></div></div><div class="qg-welcome-art"><div class="qg-welcome-icons">${['sparkles','bookmark','layers','check-circle','quote','calendar'].map(name => `<span>${icon(name, 22)}</span>`).join('')}</div><div class="catalog-card-stage">${cardHTML(Store.card('note-01'), { passive: true })}</div><div class="qg-welcome-material glass">${icon('sparkles', 20)}<span>内容踏实，操作轻盈。</span>${icon('arrow', 18)}</div></div></div><section class="qg-guide-grid"><article><span>01 / 浏览与试用</span><h3>每种状态都有一个位置</h3><p>图标、卡片、组件各自收录；基础变量与网络参考单独存放。组件实例直接调用产品渲染器。</p></article><article><span>02 / 修改与保存</span><h3>把决定写进源码</h3><p>Controls 只改变当前预览，不会自动保存。调整共享组件源文件或 Story 参数，重新构建，并提交 Git。</p></article><article><span>03 / 分享与复用</span><h3>同一份设计，持续演进</h3><p>共享仓库供协作开发；静态 Storybook 可发布成只读组件目录。后续界面继续引用同一份源码。</p></article></section>` });
}

if (import.meta.hot) import.meta.hot.dispose(cleanupStory);
