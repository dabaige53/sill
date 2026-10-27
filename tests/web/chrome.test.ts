/** Bars that tuck away while reading, IME-safe search and quiet search results. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export {ChromeAutoHide, toolbarTips} from './apps/web/interactions/chrome.ts'; export {Panels} from './apps/web/interactions/panels.ts'; export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
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
	installReactBrowserAPIs(w);
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
	return {
		dom,
		w,
		hide,
		to,
		tucked,
		bar,
		position: (y: number) => {
			top = y;
		},
	};
}

test("all bars coming back on their own use the shared reveal; with a closing card they share its spring", () => {
	const f = fixture();
	try {
		const bar = f.w.document.getElementById("bar");
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const hide = new f.w.ChromeTest.ChromeAutoHide(
			f.w.document.getElementById("scroll"),
			() => [bar],
			() => false,
		);
		// The tucked state must change something drawn, or no animation is recorded.
		const css = f.w.document.createElement("style");
		css.textContent = "#bar.is-tucked{opacity:0}";
		f.w.document.head.append(css);
		hide.hide(true);
		animations.length = 0;
		hide.show();
		assert.equal(animations.at(-1)?.options.duration, 420);
		assert.deepEqual([...animations.at(-1).options.ease], [0.5, 1, 0.89, 1]);
		hide.hide(true);
		animations.length = 0;
		hide.show(true);
		assert.equal(
			animations.at(-1)?.options.stiffness,
			274,
			"a closing card brings the bars back on its own card spring",
		);
		hide.destroy();
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("bars tuck away completely after steady downward reading, not on a jitter", () => {
	const f = fixture();
	try {
		f.to(20);
		assert.equal(f.tucked(), false, "near the top the bars always show");
		f.to(40);
		assert.equal(f.tucked(), false, "a 20px move is not yet a decision to read on");
		f.to(60);
		assert.equal(f.tucked(), true);
		assert.equal(f.bar.inert, true, "fading controls stop receiving interaction immediately");
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
		await new Promise((resolve) => setTimeout(resolve, 520));
		assert.equal(f.tucked(), false, "a pause brings the bars back");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("locking and restoring the background preserves the bars' reading state", () => {
	const f = fixture();
	try {
		let paused = false;
		f.hide.paused = () => paused;
		f.to(400);
		f.to(500);
		assert.equal(f.tucked(), true);
		paused = true;
		f.to(0);
		assert.equal(f.tucked(), true, "opening a detail does not reveal the hidden bars");
		paused = false;
		f.to(500);
		assert.equal(f.tucked(), true);
		f.hide.show();
		paused = true;
		f.to(0);
		paused = false;
		f.to(500);
		assert.equal(f.tucked(), false, "restoring a detail is not a downward reading gesture");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("restoring a tab's scroll position does not tuck the navigation", () => {
	const f = fixture();
	try {
		f.position(700);
		f.hide.syncPosition();
		f.to(700);
		assert.equal(f.tucked(), false, "the queued restoration scroll is not a gesture");
		f.to(720);
		assert.equal(f.tucked(), false);
		f.to(740);
		assert.equal(f.tucked(), true, "real downward scrolling still tucks the bars");
		f.position(300);
		f.hide.syncPosition();
		f.to(300);
		assert.equal(f.tucked(), true, "position sync also preserves a hidden toolbar");
		f.to(280);
		assert.equal(f.tucked(), false);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("a modal keeps hidden background bars tucked after the rest timer and Tab", async () => {
	const f = fixture();
	try {
		f.to(500);
		f.hide.paused = () => true;
		await new Promise((resolve) => setTimeout(resolve, 760));
		assert.equal(f.tucked(), true, "the pending rest timer respects the active modal");
		f.w.document.body.dispatchEvent(
			new f.w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
		);
		assert.equal(f.tucked(), true, "Tab inside the modal does not reveal background controls");
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("keyboard bounds use the next frame and update on a window resize", () => {
	const f = fixture();
	try {
		const viewport = new f.w.EventTarget();
		viewport.height = f.w.innerHeight;
		viewport.offsetTop = 0;
		Object.defineProperty(f.w, "visualViewport", { value: viewport });
		const frames: (() => void)[] = [];
		f.w.requestAnimationFrame = (callback: () => void) => frames.push(callback);
		f.w.ChromeTest.AppController.prototype.bindKeyboard.call({});
		viewport.dispatchEvent(new f.w.Event("resize"));
		viewport.dispatchEvent(new f.w.Event("scroll"));
		viewport.height -= 300;
		assert.equal(frames.length, 1, "viewport events share one measurement");
		frames.shift()();
		assert.equal(f.w.document.documentElement.style.getPropertyValue("--kb"), "300px");
		assert.equal(f.w.document.body.classList.contains("keyboard-open"), true);
		f.w.dispatchEvent(new f.w.Event("resize"));
		viewport.height = f.w.innerHeight;
		frames.shift()();
		assert.equal(f.w.document.documentElement.style.getPropertyValue("--kb"), "0px");
		assert.equal(f.w.document.body.classList.contains("keyboard-open"), false);
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

test("Tab reveals hidden bars before the dialog focus trap chooses its next target", () => {
	const f = fixture();
	try {
		for (const shiftKey of [false, true]) {
			f.to(400);
			f.to(500);
			assert.equal(f.tucked(), true);
			let hiddenAtFocusSelection = true;
			f.w.document.addEventListener(
				"keydown",
				() => {
					hiddenAtFocusSelection = f.tucked();
				},
				{ once: true },
			);
			const event = new f.w.KeyboardEvent("keydown", {
				key: "Tab",
				shiftKey,
				bubbles: true,
				cancelable: true,
			});
			f.w.document.body.dispatchEvent(event);
			assert.equal(hiddenAtFocusSelection, false);
			assert.equal(event.defaultPrevented, false, "Tab must retain its normal navigation");
		}
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("search waits while an input method is composing, then filters on the final text", () => {
	const f = fixture();
	try {
		const app = Object.create(f.w.ChromeTest.AppController.prototype);
		app.filter = { query: "home" };
		app.searchFilter = { query: "" };
		app.searchAll = () => ({ desk: [], shelved: [] });
		app.mode = "feed";
		app.renderCurrent = () => {};
		app.updateFilterIndicator = () => {};
		const target = { value: "gong", dataset: { input: "search" }, closest: () => null };
		app.input({ isComposing: true, target });
		assert.equal(app.searchFilter.query, "", "half-typed pinyin is not a query");
		target.value = "工作";
		app.input({ isComposing: false, target });
		assert.equal(app.searchFilter.query, "工作");
		assert.equal(app.filter.query, "home");
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
			searchFilter: { query: "工作", type: "all", status: "", tag: "" },
			filtered: () => [card],
			searchAll: () => ({ desk: [card], shelved: [card] }),
			searchText: (q: string) => q,
			searchHash: () => null,
		};
		const field = f.w.document.createElement("div");
		field.innerHTML = Panels.search(app);
		assert.ok(
			field.querySelector('.search-header [data-action="search-reset"]'),
			"the results page closes back to the search home",
		);
		assert.ok(
			field.querySelector('.search-pill [data-action="clear-query"]'),
			"clearing the query remains a separate action",
		);
		const count = field.querySelector("#filter-result");
		assert.ok(count.classList.contains("sr-only"));
		assert.equal(count.getAttribute("role"), "status");
		const results = f.w.document.createElement("div");
		results.innerHTML = Panels.searchResults(app);
		const labels = [...results.querySelectorAll(".group-label")].map((n: any) => n.textContent);
		assert.deepEqual(labels, ["已收起"]);
		assert.equal(results.querySelectorAll(".group-label .num").length, 0);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("three destinations share the capsule; the home avatar opens settings", () => {
	const dom = new JSDOM(`<!doctype html><body></body>`, {
		url: "http://chrome.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	try {
		w.matchMedia = () => ({ matches: false, addEventListener() {} });
		w.structuredClone = structuredClone;
		installReactBrowserAPIs(w);
		w.eval(bundle);
		const { AppController, Panels, Store } = w.ChromeTest;
		Store.load();
		const app = Object.create(AppController.prototype);
		app.navKey = "home";
		w.document.body.innerHTML = `${app.homeTopHTML()}<div id="dock">${app.navHTML()}</div>`;
		const tabs = [...w.document.querySelectorAll("#nav .nav-tab")].map((n: any) => n.dataset.extra);
		assert.deepEqual(tabs, ["home", "ai", "search"]);
		assert.equal(
			w.document.querySelectorAll("#nav [data-action=capture]").length,
			0,
			"adding moved to settings",
		);
		assert.equal(w.document.getElementById("account").dataset.extra, "settings");
		const settings = w.document.getElementById("account");
		assert.equal(settings.getAttribute("aria-label"), "设置");
		assert.equal(settings.querySelectorAll(".account-face,.nav-label,img").length, 0);
		assert.ok(settings.querySelector(".account-wrap > .icon"));
		assert.ok(settings.closest(".home-heading"));
		assert.equal(w.document.querySelector("#nav #account"), null);
		assert.equal(
			settings.querySelector(".account-wrap > .icon").getAttribute("stroke-width"),
			"1.65",
		);
		assert.equal(
			settings.querySelector(".account-wrap > .icon").getAttribute("aria-hidden"),
			"true",
		);

		const settingsIcon = settings.innerHTML;
		w.__SILL_ACCOUNT__ = "Synthetic Account";
		Store.state.preferences.profileName = "Profile Initial";
		app.paintAccount();
		assert.equal(
			settings.innerHTML,
			settingsIcon,
			"account updates never restore a face or initial",
		);
		assert.match(
			w.document.querySelector('[data-extra="ai"]').getAttribute("aria-label"),
			/即将推出/,
		);
		app.setNav("search");
		assert.equal(w.document.querySelector("#nav [aria-current=page]").dataset.extra, "search");
		assert.equal(w.document.querySelectorAll("#nav [aria-current]").length, 1);
		const opened: string[] = [];
		app.openPanel = (kind: string) => opened.push(kind);
		app.dialog = { open: false };
		app.goTo("settings");
		assert.deepEqual(opened, ["settings"]);
		assert.equal(app.navKey, "settings");
		assert.equal(w.document.querySelector("#nav [aria-current=page]").dataset.extra, "home");
		assert.equal(
			Panels.settingsGroups.some(([id]) => id === "add"),
			false,
		);
		const page = w.document.createElement("div");
		page.innerHTML = Panels.settings(app, "desk");
		assert.equal(page.querySelector('#capture-text,[data-action="capture-save"]'), null);
		const ai = w.document.createElement("div");
		ai.innerHTML = Panels.ai();
		assert.doesNotMatch(ai.textContent, /尚未连接 AI|输入不保存/);
		assert.equal(ai.querySelectorAll(".solid-button").length, 0, "nothing pretends to work");
		assert.ok(ai.querySelector(".ai-composer button:disabled"), "AI cannot send");
		w.matchMedia = (q: string) => ({ matches: q.includes("max-width"), addEventListener() {} });
		assert.equal(app.isPage("search"), true, "on a phone, search is a page");
		assert.equal(app.isPage("settings"), true);
		assert.equal(app.isPage("ai"), true);
		assert.equal(app.isPage("capture"), false, "capture stays a sheet");
		w.matchMedia = () => ({ matches: false, addEventListener() {} });
		assert.equal(app.isPage("search"), true, "search owns its page on desktop too");
		w.matchMedia = (q: string) => ({ matches: q.includes("min-width"), addEventListener() {} });
		assert.equal(app.isPage("settings"), false, "desktop settings is a centered sheet");
	} finally {
		dom.window.close();
	}
});

test("AI placeholder shows only selected local context and cannot send or change cards", () => {
	const f = fixture();
	try {
		const { Panels, Store } = f.w.ChromeTest;
		Store.load();
		Store.state.cards = [
			{
				id: "local-one",
				type: "note",
				title: "<script>bad</script>",
				summary: "<img src=x onerror=bad()>",
			},
			{ id: "unselected", type: "note", title: "Should not appear", summary: "Private fixture" },
		];
		const before = JSON.stringify(Store.state);
		const panel = f.w.document.createElement("div");
		panel.innerHTML = Panels.ai({ aiSelectionIds: ["local-one", "local-one", "missing"] });
		assert.equal(panel.querySelectorAll("[data-ai-context]").length, 1);
		assert.equal(panel.querySelector("script, img, form"), null);
		assert.doesNotMatch(panel.textContent, /尚未连接 AI|输入不保存/);
		assert.doesNotMatch(panel.textContent, /Should not appear/);
		assert.equal(panel.querySelector(".ai-composer button").disabled, true);
		assert.equal(panel.querySelectorAll(".ai-composer button:disabled").length, 3);
		assert.equal(panel.querySelector(".ai-composer [data-action]"), null);
		const draft = panel.querySelector("textarea");
		draft.value = "A temporary local draft";
		draft.dispatchEvent(new f.w.Event("input", { bubbles: true }));
		assert.equal(JSON.stringify(Store.state), before);
		assert.equal(Panels.ai({ aiSelectionIds: [] }).includes("data-ai-context="), false);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("adjacent toolbar names skip the first hover delay only after a tooltip was shown", () => {
	const f = fixture();
	try {
		const { w } = f;
		w.document.body.insertAdjacentHTML(
			"beforeend",
			'<div class="float-bar"><button class="icon-button" id="tip-a">A</button><button class="icon-button" id="tip-b">B</button></div>',
		);
		let now = 0,
			pending: (() => void) | null = null;
		w.performance.now = () => now;
		w.setTimeout = (fn: () => void) => {
			pending = fn;
			return 1;
		};
		w.clearTimeout = () => {
			pending = null;
		};
		w.ChromeTest.toolbarTips(w.document);
		const a = w.document.getElementById("tip-a"),
			b = w.document.getElementById("tip-b");
		const pointer = (el: Element, type: string, relatedTarget: Element | null = null) => {
			const event = new w.MouseEvent(type, { bubbles: true, relatedTarget });
			Object.defineProperty(event, "pointerType", { value: "mouse" });
			el.dispatchEvent(event);
		};
		pointer(a, "pointerover");
		assert.equal(a.classList.contains("is-hover-tipping"), false);
		now = 500;
		pending!();
		assert.equal(a.classList.contains("is-hover-tipping"), true);
		pointer(a, "pointerout", b);
		pointer(b, "pointerover", a);
		assert.equal(b.classList.contains("is-instant-tip"), true);
		assert.equal(b.classList.contains("is-hover-tipping"), true);
		pointer(b, "pointerout");
		now = 2000;
		pointer(a, "pointerover");
		assert.equal(a.classList.contains("is-hover-tipping"), false);
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});

test("desktop top recovery is gentler while bottom bars and closing-card timing remain independent", () => {
	const f = fixture();
	try {
		f.w.matchMedia = () => ({ matches: true });
		const top = f.w.document.createElement("div");
		top.id = "home-top";
		f.w.document.body.append(top);
		const css = f.w.document.createElement("style");
		css.textContent = ".is-tucked{opacity:0}";
		f.w.document.head.append(css);
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const hide = new f.w.ChromeTest.ChromeAutoHide(f.w.document.getElementById("scroll"), () => [
			top,
			f.bar,
		]);
		hide.hide(true);
		animations.length = 0;
		hide.show();
		assert.equal(animations.find((animation) => animation.target === top).options.duration, 560);
		assert.equal(animations.find((animation) => animation.target === f.bar).options.duration, 420);
		hide.hide(true);
		animations.length = 0;
		hide.show(true);
		assert.equal(animations.find((animation) => animation.target === top).options.stiffness, 274);
		hide.destroy();
	} finally {
		f.hide.destroy();
		f.dom.window.close();
	}
});
