import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(root, 'scripts/modules.json');
const publicId = 'virtual:quiet-glass';
const resolvedId = '\0' + publicId;
const styleManifest = path.join(root, 'src/styles/styles.json');
const publicStyleId = 'virtual:quiet-glass/styles.css';
const resolvedStyleId = '\0' + publicStyleId;

// These names are local to the preview module. Storybook's own scheduler is
// deliberately untouched when a specimen is unmounted or its args change.
const scheduler = `
const storyTimeouts = new Set(), storyIntervals = new Set(), storyFrames = new Set();
function setTimeout(fn, delay, ...args) {
 const id = globalThis.setTimeout(() => { storyTimeouts.delete(id); fn(...args); }, delay);
 storyTimeouts.add(id); return id;
}
function clearTimeout(id) { storyTimeouts.delete(id); globalThis.clearTimeout(id); }
function setInterval(fn, delay, ...args) {
 const id = globalThis.setInterval(fn, delay, ...args); storyIntervals.add(id); return id;
}
function clearInterval(id) { storyIntervals.delete(id); globalThis.clearInterval(id); }
function requestAnimationFrame(fn) {
 const id = globalThis.requestAnimationFrame(time => { storyFrames.delete(id); fn(time); });
 storyFrames.add(id); return id;
}
function cancelAnimationFrame(id) { storyFrames.delete(id); globalThis.cancelAnimationFrame(id); }
export function cleanupRuntimeTimers() {
 storyTimeouts.forEach(id => globalThis.clearTimeout(id)); storyTimeouts.clear();
 storyIntervals.forEach(id => globalThis.clearInterval(id)); storyIntervals.clear();
 storyFrames.forEach(id => globalThis.cancelAnimationFrame(id)); storyFrames.clear();
}
`;

export function sharedFiles() {
 return JSON.parse(fs.readFileSync(manifest, 'utf8'))
  .filter(file => file !== 'src/index.js').map(file => path.join(root, file));
}

function styleFiles() {
 return JSON.parse(fs.readFileSync(styleManifest, 'utf8')).map(file => path.join(root, file));
}

export function sharedModule() {
 return scheduler + sharedFiles().map(file => `\n/* shared: ${path.relative(root, file)} */\n${fs.readFileSync(file, 'utf8')}`).join('\n') + `
export {
 Glyphs, IconCatalog, icon, esc, button, ring, checkItem, avatars, tagChip, emptyState,
 Assets, SeedCards, FreshCards, CardTypes, CardCatalog, CardPresentation, CardTemplates,
 cardHTML, ComponentCatalog, componentSpecimen, IconsView, CardsView, LibraryView,
 SourcesView, Catalog, Sources, Store, FeedPolicy, MotionEngine, Panels, AIView,
 DemoAI, AppController, FeedLayout, DragManager
};
`;
}

export function quietGlassSource() {
 return {
  name: 'quiet-glass-shared-source',
  resolveId(id) {
   if (id === publicId) return resolvedId;
   if (id === publicStyleId) return resolvedStyleId;
  },
  load(id) {
   if (id === resolvedStyleId) {
    [styleManifest, ...styleFiles()].forEach(file => this.addWatchFile(file));
    return styleFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n\n');
   }
   if (id !== resolvedId) return;
   [manifest, ...sharedFiles()].forEach(file => this.addWatchFile(file));
   return sharedModule();
  },
  handleHotUpdate(context) {
   if (![manifest, styleManifest, ...sharedFiles(), ...styleFiles()].includes(context.file)) return;
   for (const id of [resolvedId, resolvedStyleId]) {
    const module = context.server.moduleGraph.getModuleById(id);
    if (module) context.server.moduleGraph.invalidateModule(module);
   }
   context.server.ws.send({ type: 'full-reload' });
   return [];
  }
 };
}
