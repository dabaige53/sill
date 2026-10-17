/** Synthetic reading fixtures; no real workspace or service writes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {cardHTML} from './apps/web/cards/templates.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
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
	w.eval(bundle);
	const { AppController, Store } = w.ReadingTest;
	Store.state = {
		cards: [{ id: "read-test", type: "article", title: "Synthetic text", body: ["Text"] }],
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
		height(value: number) {
			height = value;
		},
		refreshes: () => refreshes,
	};
}
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
		assert.equal(f.refreshes(), 1);
		f.app.updateReading("read-test", f.scroll);
		assert.equal(f.refreshes(), 1);
	} finally {
		f.dom.window.close();
	}
});
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
test("short content stays unread after dwell, closing and reopening", async () => {
	const f = fixture();
	try {
		f.height(600);
		f.app.bindPreview("read-test");
		assert.equal(f.Store.item("read-test").read, false);
		f.app.modalToken++;
		await new Promise((r) => setTimeout(r, 1300));
		assert.equal(f.Store.item("read-test").read, false);
		f.app.bindPreview("read-test");
		await new Promise((r) => setTimeout(r, 1300));
		assert.equal(f.Store.item("read-test").read, false);
	} finally {
		f.dom.window.close();
	}
});
test("hidden short content stays unread when the page becomes visible", async () => {
	const f = fixture();
	try {
		f.height(600);
		f.app.bindPreview("read-test");
		Object.defineProperty(f.w.document, "hidden", { value: true, configurable: true });
		f.w.document.dispatchEvent(new f.w.Event("visibilitychange"));
		Object.defineProperty(f.w.document, "hidden", { value: false, configurable: true });
		await new Promise((r) => setTimeout(r, 1300));
		assert.equal(f.Store.item("read-test").read, false);
	} finally {
		f.dom.window.close();
	}
});
test("completed reminders receive the completed color class", () => {
	const f = fixture();
	try {
		const card = { id: "done-reminder", type: "reminder", title: "Synthetic reminder", body: [] };
		f.Store.state.cards.push(card);
		f.Store.patch(card.id, { reminderDone: true });
		assert.match(f.w.ReadingTest.cardHTML(card), /is-complete/);
	} finally {
		f.dom.window.close();
	}
});
test("pointer ring suppression leaves keyboard and selection rules intact", () => {
	const css = readFileSync(new URL("../../apps/web/styles/cards.css", import.meta.url), "utf8");
	assert.match(css, /data-input-modality="pointer"/);
	assert.match(css, /\.feed-card:focus-visible\s*\{\s*outline: 2px solid var\(--accent\)/);
	assert.match(css, /\.feed-card.is-selected:after/);
	const readStyles = css.slice(css.indexOf("/* Read, ended"), css.indexOf("/* Stacks:"));
	assert.doesNotMatch(readStyles, /background: var\(--card\)/);
	assert.match(readStyles, /\.feed-card.is-complete/);
});
