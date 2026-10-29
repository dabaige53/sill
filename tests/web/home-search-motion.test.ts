/** Reference choreography against synthetic geometry; no browser or workspace data. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const source = buildSync({
	stdin: {
		contents: `export * from './apps/web/views/home-search-motion.ts';
export {renderSearchList} from './apps/web/views/home-search-list.ts';
export {HomeHashList} from './apps/web/views/home-search.tsx';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SearchMotion",
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
}).outputFiles[0].text;
function fixture(markup: string) {
	const dom = new JSDOM(markup, {
		url: "https://search.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false });
	installReactBrowserAPIs(w);
	w.eval(source);
	w.__motionAnimations = [];
	return { dom, w, api: w.SearchMotion, animations: w.__motionAnimations as any[] };
}

test("closing retains inert options, and reopening cancels the old exit without removing the list", async () => {
	const f = fixture('<div id="slot"></div>');
	try {
		f.w.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 320 });
		const slot = f.w.document.querySelector("#slot");
		const content = () =>
			f.api.HomeHashList({
				options: [{ extra: "query:Alpha", label: "Alpha", group: "history" }],
				active: 0,
			});
		const list = f.api.renderSearchList(slot, true, content());
		assert.equal(f.animations.at(-1).options.duration, 150);
		f.animations.at(-1).finish();
		await Promise.resolve();
		f.api.renderSearchList(slot, false, null);
		const exit = f.animations.at(-1);
		assert.equal(exit.options.duration, 100);
		assert.equal(list.inert, true);
		assert.equal(list.getAttribute("aria-hidden"), "true");
		assert.equal(list.isConnected, true, "the closing list remains drawn during its exit");
		list.style.opacity = "0.4";
		list.style.transform = "matrix(0.98, 0, 0, 0.98, 0, 0)";
		const reopened = f.api.renderSearchList(slot, true, content());
		assert.equal(reopened, list);
		assert.equal(f.animations.at(-1).frames[0].opacity, "0.4");
		exit.finish();
		await Promise.resolve();
		assert.equal(list.isConnected, true, "a stale exit cannot remove the reopened list");
		assert.equal(list.inert, false);
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.api.renderSearchList(slot, false, null);
		assert.equal(slot.childElementCount, 0);
	} finally {
		f.dom.window.close();
	}
});

test("hover never scrolls the list underneath the pointer; keyboard navigation keeps its row visible", () => {
	const f = fixture(
		'<div id="list"><span class="home-hash-highlight"></span><button id="home-option-1"></button></div>',
	);
	try {
		const list = f.w.document.querySelector("#list"),
			row = list.querySelector("button");
		Object.defineProperty(list, "clientHeight", { value: 120 });
		Object.defineProperties(row, { offsetTop: { value: 200 }, offsetHeight: { value: 48 } });
		list.dataset.options = "same";
		list.scrollTop = 50;
		f.api.syncSearchHighlight(list, "same", 1, false);
		assert.equal(list.scrollTop, 50);
		f.api.syncSearchHighlight(list, "same", 1, true);
		assert.equal(list.scrollTop, 128);
	} finally {
		f.dom.window.close();
	}
});

test("the clear icon leaves in its reserved slot and stops accepting focus immediately", () => {
	const f = fixture(
		'<div id="field"><button class="home-search-clear" hidden>Clear</button></div>',
	);
	try {
		const field = f.w.document.querySelector("#field"),
			clear = field.querySelector("button");
		f.api.syncSearchClear(field, false);
		assert.equal(clear.hidden, false);
		assert.equal(clear.inert, true);
		f.api.syncSearchClear(field, true);
		assert.equal(clear.inert, false);
		assert.equal(f.animations.at(-1).options.duration, 300);
		f.api.syncSearchClear(field, false);
		assert.equal(clear.hidden, false, "the outgoing icon stays mounted until its fade finishes");
		assert.equal(clear.inert, true);
		assert.equal(clear.tabIndex, -1);
		assert.equal(clear.getAttribute("aria-hidden"), "true");
	} finally {
		f.dom.window.close();
	}
});
