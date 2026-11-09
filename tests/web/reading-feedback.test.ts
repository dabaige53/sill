/** Synthetic reading fixtures; no real workspace or service writes. */
import assert from "node:assert/strict";

import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs, installTimers } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {flushReadingRefresh} from './apps/web/interactions/reading-feedback.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ReadingTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM(
		'<!doctype html><dialog open><div class="preview-sheet"><div class="sheet-scroll"><div id="reader-end"></div></div></div></dialog>',
		{ url: "http://reading.test", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.structuredClone = structuredClone;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	installReactBrowserAPIs(w);
	const clock = installTimers(w);
	w.eval(bundle);
	const { AppController, Store } = w.ReadingTest;
	Store.state = {
		cards: [{ id: "read-test", type: "article", title: "Synthetic text", body: "Text" }],
		items: {},
		preferences: {},
	};
	Store.save = () => {};
	const app = Object.create(AppController.prototype);
	app.dialog = w.document.querySelector("dialog");
	app.currentId = "read-test";
	app.modalToken = 1;
	app.gestures = { bindPush() {} };
	let refreshes = 0;
	app.refreshCard = () => {
		refreshes++;
	};
	const scroll = app.dialog.querySelector(".sheet-scroll");
	let height = 2000;
	Object.defineProperty(scroll, "scrollHeight", { get: () => height });
	Object.defineProperty(scroll, "clientHeight", { get: () => 600 });
	return {
		dom,
		w,
		app,
		Store,
		scroll,
		clock,
		height(value: number) {
			height = value;
		},
		refreshes: () => refreshes,
	};
}
// @wu-test type=behavior | scope=reading completion | protects=Mark content read at the end and preserve the open detail | debt=impl-detail
test("reaching bottom updates immediately and does not repeatedly patch or redraw", () => {
	const f = fixture();
	try {
		f.scroll.scrollTop = 700;
		f.app.updateReading("read-test", f.scroll);
		assert.equal(f.Store.item("read-test").read, false);
		assert.equal(f.refreshes(), 0);
		f.scroll.scrollTop = 1394;
		f.app.updateReading("read-test", f.scroll);
		assert.equal(f.Store.item("read-test").read, true);
		assert.equal(f.Store.item("read-test").progress, 1);
		assert.equal(f.refreshes(), 0, "the mounted detail keeps background membership stable");
		f.app.updateReading("read-test", f.scroll);
		f.w.ReadingTest.flushReadingRefresh(f.app);
		assert.equal(f.refreshes(), 1);
		f.w.ReadingTest.flushReadingRefresh(f.app);
		assert.equal(f.refreshes(), 1, "closing applies the pending list update only once");
	} finally {
		f.dom.window.close();
	}
});
// @wu-test type=behavior | scope=mail reading completion | protects=Keep mail unread until its bottom is reached
test("mail without an end marker stays unread while scrolling and completes at bottom", () => {
	const f = fixture();
	try {
		f.Store.state.cards[0].type = "mail";
		f.scroll.querySelector("#reader-end").remove();
		f.scroll.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 });
		let writes = 0;
		f.Store.save = () => writes++;
		for (let i = 0; i < 5; i++) {
			f.scroll.scrollTop = 70;
			f.app.updateReading("read-test", f.scroll);
			assert.equal(f.Store.item("read-test").read, false);
		}
		assert.equal(writes, 0);
		f.scroll.scrollTop = 1400;
		f.app.updateReading("read-test", f.scroll);
		assert.equal(f.Store.item("read-test").read, true);
		assert.equal(writes, 1);
	} finally {
		f.dom.window.close();
	}
});
// @wu-test type=boundary | scope=reading completion threshold | protects=Mark content read when its actual end is visible
test("visible content end completes before trailing padding", () => {
	const f = fixture();
	try {
		f.scroll.scrollTop = 1100;
		f.scroll.getBoundingClientRect = () => ({ top: 100, bottom: 700, height: 600 });
		f.scroll.querySelector("#reader-end").getBoundingClientRect = () => ({ top: 680, bottom: 690 });
		f.app.updateReading("read-test", f.scroll);
		assert.equal(f.Store.item("read-test").read, true);
	} finally {
		f.dom.window.close();
	}
});
// @wu-test type=regression | scope=preview reading tracking | protects=Continue tracking reading after initially short content grows
test("initially short preview still tracks scrolling after content grows", () => {
	const f = fixture();
	try {
		f.height(600);
		f.app.bindPreview("read-test");
		assert.equal(f.Store.item("read-test").read, false);
		f.height(2000);
		f.scroll.scrollTop = 1400;
		f.scroll.dispatchEvent(new f.w.Event("scroll"));
		assert.equal(f.Store.item("read-test").read, true);
	} finally {
		f.dom.window.close();
	}
});
// @wu-test type=behavior | scope=short-content reading completion | protects=Require visible dwell and cancel completion after switching cards
test("short content needs 1200ms of dwell, and switching cancels the old completion", () => {
	const f = fixture();
	try {
		f.height(600);
		f.app.bindPreview("read-test");
		assert.equal(f.Store.item("read-test").read, false);
		f.app.modalToken++;
		f.clock.advance(1200);
		assert.equal(f.Store.item("read-test").read, false);
		f.app.bindPreview("read-test");
		f.clock.advance(1199);
		assert.equal(f.Store.item("read-test").read, false);
		f.clock.advance(1);
		assert.equal(f.Store.item("read-test").read, true);
	} finally {
		f.dom.window.close();
	}
});
// @wu-test type=boundary | scope=short-content visible dwell | protects=Avoid marking hidden content as read
test("hidden short content does not count as visible dwell", () => {
	const f = fixture();
	try {
		f.height(600);
		f.app.bindPreview("read-test");
		Object.defineProperty(f.w.document, "hidden", { value: true, configurable: true });
		f.w.document.dispatchEvent(new f.w.Event("visibilitychange"));
		Object.defineProperty(f.w.document, "hidden", { value: false, configurable: true });
		f.clock.advance(1200);
		assert.equal(f.Store.item("read-test").read, false);
	} finally {
		f.dom.window.close();
	}
});
