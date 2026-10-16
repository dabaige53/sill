/** Bars that tuck away while reading, IME-safe search and quiet search results. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {ChromeAutoHide} from './apps/web/interactions/chrome.ts'; export {Panels} from './apps/web/interactions/panels.ts'; export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ChromeTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		`<!doctype html><div id="scroll"></div><div id="bar"><button id="bar-button">收藏</button></div><div id="edge"></div><span id="filter-result"></span><div id="search-results"></div>`,
		{ url: "http://chrome.test/", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	w.eval(bundle);
	const scroll = w.document.getElementById("scroll");
	let top = 0;
	Object.defineProperty(scroll, "scrollTop", { get: () => top, configurable: true });
	Object.defineProperty(scroll, "scrollHeight", { get: () => 4000, configurable: true });
	Object.defineProperty(scroll, "clientHeight", { get: () => 800, configurable: true });
	const bar = w.document.getElementById("bar"),
		edge = w.document.getElementById("edge");
	const hide = new w.ChromeTest.ChromeAutoHide(scroll, () => [bar, edge]);
	const to = (y: number) => {
		top = y;
		scroll.dispatchEvent(new w.Event("scroll"));
	};
	const tucked = () => bar.classList.contains("is-tucked") && edge.classList.contains("is-tucked");
	return { dom, w, hide, to, tucked, bar };
}

test("bars tuck away completely after steady downward reading, not on a jitter", () => {
	const f = fixture();
	try {
		f.to(20);
		assert.equal(f.tucked(), false, "near the top the bars always show");
		f.to(40);
		assert.equal(f.tucked(), false, "a 20px move is not yet a decision to read on");
		f.to(60);
		assert.equal(f.tucked(), true);
		f.to(55);
		assert.equal(f.tucked(), true, "a 5px jitter back up does not bring the bars back");
		f.to(40);
		assert.equal(f.tucked(), false, "a real turn back brings them back");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("bars come back at the top, at the end, and after a pause", async () => {
	const f = fixture();
	try {
		f.to(400);
		f.to(500);
		assert.equal(f.tucked(), true);
		f.to(10);
		assert.equal(f.tucked(), false, "the top always shows the bars");
		f.to(400);
		f.to(500);
		assert.equal(f.tucked(), true);
		f.to(3190);
		assert.equal(f.tucked(), false, "the end shows the bars, so notes and tags stay reachable");
		f.to(1000);
		f.to(1100);
		assert.equal(f.tucked(), true);
		await new Promise((resolve) => setTimeout(resolve, 760));
		assert.equal(f.tucked(), false, "a pause brings the bars back");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("keyboard focus inside a tucked bar brings it back, and a focused bar never tucks", () => {
	const f = fixture();
	try {
		f.to(400);
		f.to(500);
		assert.equal(f.tucked(), true);
		f.w.document.getElementById("bar-button").focus();
		assert.equal(f.tucked(), false);
		f.to(600);
		f.to(700);
		assert.equal(f.tucked(), false);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("search waits while an input method is composing, then filters on the final text", () => {
	const f = fixture();
	try {
		const app = Object.create(f.w.ChromeTest.AppController.prototype);
		app.filter = { query: "" };
		app.filtered = () => [];
		app.mode = "feed";
		app.renderCurrent = () => {};
		app.updateFilterIndicator = () => {};
		const target = { value: "gong", dataset: { input: "search" }, closest: () => null };
		app.input({ isComposing: true, target });
		assert.equal(app.filter.query, "", "half-typed pinyin is not a query");
		target.value = "工作";
		app.input({ isComposing: false, target });
		assert.equal(app.filter.query, "工作");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("search shows no counts: the total is for screen readers only and groups carry no numbers", () => {
	const f = fixture();
	try {
		const { Panels, Store } = f.w.ChromeTest;
		Store.load();
		const card = { id: "a", type: "note", title: "工作笔记", summary: "工作" };
		const app = {
			filter: { query: "工作", type: "all", status: "", tag: "" },
			filtered: () => [card],
			searchAll: () => ({ desk: [card], shelved: [card] }),
		};
		const field = f.w.document.createElement("div");
		field.innerHTML = Panels.search(app);
		const count = field.querySelector("#filter-result");
		assert.ok(count.classList.contains("sr-only"));
		assert.equal(count.getAttribute("role"), "status");
		const results = f.w.document.createElement("div");
		results.innerHTML = Panels.searchResults(app);
		const labels = [...results.querySelectorAll(".group-label")].map((n: any) => n.textContent);
		assert.deepEqual(labels, ["桌面", "已收起"]);
		assert.equal(results.querySelectorAll(".group-label .num").length, 0);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("the navigation capsule holds home, search, AI and settings; the lens follows the open place", () => {
	const dom = new JSDOM(`<!doctype html><body></body>`, {
		url: "http://chrome.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	try {
		w.matchMedia = () => ({ matches: false, addEventListener() {} });
		w.structuredClone = structuredClone;
		w.eval(bundle);
		const { AppController, Panels, Store } = w.ChromeTest;
		Store.load();
		const app = Object.create(AppController.prototype);
		app.navKey = "home";
		w.document.body.innerHTML = `<div id="dock">${app.navHTML()}</div>`;
		const tabs = [...w.document.querySelectorAll("#nav .nav-tab")].map((n: any) => n.dataset.extra);
		assert.deepEqual(tabs, ["home", "search", "ai", "settings"]);
		assert.equal(
			w.document.querySelectorAll("#nav [data-action=capture]").length,
			0,
			"adding moved to settings",
		);
		assert.equal(w.document.getElementById("account").dataset.extra, "settings");
		assert.match(
			w.document.querySelector('[data-extra="ai"]').getAttribute("aria-label"),
			/即将推出/,
		);
		app.setNav("search");
		assert.equal(w.document.querySelector("#nav [aria-current=page]").dataset.extra, "search");
		assert.equal(w.document.querySelectorAll("#nav [aria-current]").length, 1);
		assert.equal(Panels.settingsGroups[0][0], "add");
		const page = w.document.createElement("div");
		page.innerHTML = Panels.settings(app, "add");
		assert.ok(page.querySelector("#capture-text"));
		assert.ok(page.querySelector('[data-action="capture-save"]'));
		const ai = w.document.createElement("div");
		ai.innerHTML = Panels.ai();
		assert.match(ai.textContent, /即将推出/);
		assert.equal(ai.querySelectorAll(".solid-button").length, 0, "nothing pretends to work");
	} finally {
		dom.window.close();
	}
});
