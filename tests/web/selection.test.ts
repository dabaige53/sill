import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { registerMenuGestureTests } from "./selection-menu-gestures.ts";
import { registerToolbarContextTests } from "./selection-toolbar-context.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export {DragManager} from './apps/web/interactions/drag.ts'; export {Gestures} from './apps/web/interactions/gestures.ts'; export {Store} from './apps/web/data/store.ts'; export {AppController} from './apps/web/views/app.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SelectionTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		`<!doctype html><main><div id="feed-grid">${["one", "two", "three"].map((id) => `<article class="feed-card" data-card="${id}" tabindex="0"><div class="card-body"><p class="card-summary">${id} summary stays visible</p><h2 class="card-title"><button id="title-${id}" class="card-title-button" data-action="card-open" data-id="${id}" aria-describedby="summary-${id}">${id}</button></h2><span id="summary-${id}">Structured content</span></div></article>`).join("")}</div></main><div id="selection-bar"><span class="selection-count"></span><button data-action="selected-bookmark">收藏</button><button data-action="selected-later">稍后看</button><button data-action="selected-tag">标签</button><button data-action="clear-selection">取消选择</button></div><dialog id="modal"></dialog><div id="toast"></div>`,
		{
			url: "http://selection.test/",
			runScripts: "outside-only",
			pretendToBeVisual: true,
		},
	);
	const w = dom.window as any,
		document = w.document;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	w.HTMLDialogElement.prototype.showModal = function () {
		this.setAttribute("open", "");
	};
	w.HTMLDialogElement.prototype.close = function () {
		this.removeAttribute("open");
	};
	const timers = new Map<number, () => void>();
	let timerId = 0;
	w.setTimeout = (fn: () => void) => {
		const id = ++timerId;
		timers.set(id, fn);
		return id;
	};
	w.clearTimeout = (id: number) => timers.delete(id);
	w.localStorage.setItem(
		"sill-v1",
		JSON.stringify({
			version: 4,
			cards: ["one", "two", "three"].map((id) => ({ id, type: "article", title: id, body: id })),
			items: {},
		}),
	);
	w.eval(bundle);
	const { Store, AppController, DragManager, Gestures } = w.SelectionTest;
	Store.load();
	const app = new AppController();
	app.grid = document.getElementById("feed-grid");
	app.dialog = document.getElementById("modal");
	app.announce = () => {};
	app.refreshCard = () => {};
	app.toast = () => {};
	app.hideDock = () => {};
	app.openPanel = (kind: string, id: string) => {
		app.openedPanel = { kind, id };
	};
	app.refreshCount = 0;
	app.refresh = () => {
		app.refreshCount++;
		return Promise.resolve();
	};
	app.drag = new DragManager(app);
	for (const id of ["one", "two", "three"]) Store.item(id);
	Store.save();
	const selected = () => Array.from(app.selected).sort();
	const state = () =>
		JSON.stringify({
			cards: Store.state.cards,
			items: Store.state.items,
			stored: w.localStorage.getItem("sill-v1"),
		});
	const selectTwo = () => {
		app.select("one", { add: true });
		app.select("two", { add: true });
	};
	const fire = (type: string, target: any = document, options: any = {}) => {
		const event = new w.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, options);
		target.dispatchEvent(event);
		return event;
	};
	const source = () => app.grid.querySelector('[data-card="one"] p');
	const start = () => fire("touchstart", source(), { touches: [{ clientX: 120, clientY: 200 }] });
	const hold = () => {
		const callbacks = [...timers.values()];
		timers.clear();
		callbacks.forEach((fn) => {
			fn();
		});
	};
	const move = () => fire("touchmove", source(), { touches: [{ clientX: 150, clientY: 270 }] });
	const release = () =>
		fire("touchend", source(), { touches: [], changedTouches: [{ clientX: 150, clientY: 270 }] });
	const key = (value: string, shiftKey = false) =>
		document.activeElement.dispatchEvent(
			new w.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }),
		);
	return {
		dom,
		w,
		document,
		Store,
		app,
		Gestures,
		selected,
		state,
		selectTwo,
		fire,
		source,
		start,
		hold,
		move,
		release,
		key,
	};
}
await registerMenuGestureTests({ fixture });

await registerToolbarContextTests({ fixture });
