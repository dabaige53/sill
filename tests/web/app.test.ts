/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {Panels} from './apps/web/interactions/panels.ts';",
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
	globalName: "ControllerTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM('<main id="feed-grid"></main><dialog id="modal" open></dialog>', {
		url: "https://controller.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	const computed = w.getComputedStyle.bind(w);
	w.getComputedStyle = (el: Element, pseudo?: string) =>
		pseudo === "::before"
			? { transform: el.getAttribute("aria-checked") === "true" ? "translateX(20px)" : "none" }
			: computed(el);
	w.CSS = { escape: (value: string) => value };
	const observers: any[] = [];
	w.ResizeObserver = class {
		nodes = [];
		disconnected = false;
		callback: () => void;
		constructor(callback: () => void) {
			this.callback = callback;
			observers.push(this);
		}
		observe(node: any) {
			this.nodes.push(node);
		}
		disconnect() {
			this.disconnected = true;
		}
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { AppController, Store, Panels } = w.ControllerTest;
	Store.state = {
		cards: [{ id: "mail-one", type: "mail", title: "Synthetic mail", body: [] }],
		items: {},
		preferences: {},
	};
	Store.save = () => {};
	const app = Object.assign(Object.create(AppController.prototype), {
		dialog: w.document.getElementById("modal"),
		grid: w.document.getElementById("feed-grid"),
		modalKind: "",
		settingsGroup: "desk",
		homeSelected: new Set<string>(),
		applyPreferences() {},
		withFeedAnchor() {},
		refreshCard() {},
		announce() {},
	});
	return { dom, w, app, Store, Panels, observers };
}

test("closing photo tags returns to the same photo index", () => {
	const f = fixture();
	try {
		const { app, Store } = f;
		Store.state.cards = [
			{ id: "photo-one", type: "photo", title: "合成照片", photos: ["coast", "mountain"] },
		];
		app.currentId = "photo-one";
		app.modalKind = "lightbox";
		app.photoIndex = 1;
		app.panelReturn = null;
		app.openModal = (html: string, kind: string) => {
			app.dialog.innerHTML = typeof html === "string" ? html : renderToStaticMarkup(html);
			app.modalKind = kind;
		};
		const returned: unknown[] = [];
		app.openCard = (id: string, reading: boolean) => {
			returned.push([id, reading]);
			app.modalKind = "lightbox";
			app.photoIndex = 0;
		};
		app.action = (...args: unknown[]) => returned.push(args);
		app.openPanel("editor", "photo-one");
		assert.equal(typeof app.panelReturn, "function");
		app.closeModal();
		assert.deepEqual(returned, [
			["photo-one", false],
			["photo-go", "photo-one", "1"],
		]);
		assert.equal(app.panelReturn, null);
	} finally {
		f.dom.window.close();
	}
});

test("settings changes preserve focus, scroll, the previous value and unrelated preferences", () => {
	const f = fixture();
	try {
		const { app, Store, Panels, w } = f;
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const main = app.dialog.querySelector(".settings-main");
		main.scrollTop = 83;
		const toggle = app.dialog.querySelector('[data-action="pref-toggle"][data-id="stack"]');
		toggle.focus();
		Store.setPref("theme", "dark");
		let applied = 0,
			anchored = 0;
		app.applyPreferences = () => applied++;
		app.withFeedAnchor = () => anchored++;
		assert.equal(app.setPref("stack", false), true);
		assert.equal(Store.pref("stack"), false);
		assert.equal(Store.pref("theme"), "dark");
		assert.equal(applied, 1);
		assert.equal(anchored, 1);
		assert.equal(app.dialog.querySelector(".settings-main").scrollTop, 83);
		assert.equal(w.document.activeElement.dataset.id, "stack");
		assert.equal(w.document.activeElement.getAttribute("aria-checked"), "false");
	} finally {
		f.dom.window.close();
	}
});

test("action visibility toggles hide and restore only the requested verb", () => {
	const f = fixture();
	try {
		f.Store.setPref("hiddenActions", ["reply"]);
		f.app.action("action-toggle", "bookmark");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), ["reply", "bookmark"]);
		f.app.action("action-toggle", "reply");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), ["bookmark"]);
		f.app.action("action-toggle", "bookmark");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), []);
	} finally {
		f.dom.window.close();
	}
});

test("public action routes refresh, reminder aliases, detail navigation and unknown names", () => {
	const f = fixture();
	try {
		const calls: unknown[] = [];
		f.app.gestures = { refresh: () => calls.push("refresh") };
		f.app.changeReminder = (...args: unknown[]) => calls.push(args);
		f.app.navigate = (route: string) => calls.push(route);
		f.app.action("refresh");
		f.app.action("retry");
		for (const name of ["snooze", "dismiss-reminder", "complete-reminder", "restore-reminder"])
			f.app.action(name, "reminder-one");
		f.app.action("card-open", "mail-one");
		f.app.action("reader", "mail-one");
		assert.deepEqual(calls, [
			"refresh",
			"refresh",
			["reminder-one", "snooze"],
			["reminder-one", "dismiss-reminder"],
			["reminder-one", "complete-reminder"],
			["reminder-one", "restore-reminder"],
			"#card/mail-one",
			"#read/mail-one",
		]);
		for (const name of [
			"unknown",
			"toString",
			"constructor",
			"__proto__",
			new f.w.String("settings"),
			null,
			undefined,
		]) {
			assert.equal(f.app.action(name), undefined);
		}
		assert.equal(calls.length, 8);
	} finally {
		f.dom.window.close();
	}
});

for (const scenario of ["opened", "declined", "account-changed", "disconnected"]) {
	test(`external mail action marks read only after an accepted opening in the same account: ${scenario}`, async () => {
		const f = fixture();
		try {
			let owner = "synthetic-a",
				complete: (opened: boolean) => void,
				opened = 0,
				alerts = 0;
			const pending = new Promise<boolean>((resolve) => {
				complete = resolve;
			});
			f.app.agentScope = () => {
				if (scenario === "disconnected") throw new Error("Synthetic disconnection");
				return { kind: "cloud", owner };
			};
			f.app.alert = () => alerts++;
			f.app.openExternal = () => {
				opened++;
				return pending;
			};
			f.app.action("external", "mail-one");
			assert.equal(f.Store.item("mail-one").read, false);
			if (scenario === "account-changed") owner = "synthetic-b";
			complete(scenario !== "declined");
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(f.Store.item("mail-one").read, scenario === "opened");
			assert.equal(opened, scenario === "disconnected" ? 0 : 1);
			assert.equal(alerts, scenario === "disconnected" ? 1 : 0);
		} finally {
			f.dom.window.close();
		}
	});
}

for (const sourceRow of [true, false]) {
	test(`preview chrome tracks height and close-disc position after resize (${sourceRow ? "source row" : "title fallback"})`, () => {
		const f = fixture();
		try {
			const { app, observers, w } = f;
			app.dialog.innerHTML = `<div class="preview-sheet"><div class="sheet-scroll"><div class="preview-body">${sourceRow ? '<div class="preview-meta">Synthetic source</div>' : ""}<h1 id="modal-title" style="line-height:28px">Synthetic title</h1></div></div></div>`;
			const sheet = app.dialog.querySelector(".preview-sheet"),
				scroll = sheet.querySelector(".sheet-scroll"),
				anchor = sheet.querySelector(sourceRow ? ".preview-meta" : "#modal-title");
			let top = 80,
				height = 400;
			sheet.getBoundingClientRect = () => ({ top: 20 });
			anchor.getBoundingClientRect = () => ({ top, height: 20 });
			Object.defineProperty(sheet, "offsetHeight", { get: () => height });
			let destroyed = 0,
				disconnected = 0;
			app.sheetHide = { destroy: () => destroyed++ };
			app.previewSizeObserver = { disconnect: () => disconnected++ };
			app.bindSheetChrome();
			assert.equal(destroyed, 1);
			assert.equal(disconnected, 1);
			assert.equal(app.dialog.style.getPropertyValue("--preview-height"), "400px");
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				sourceRow ? "48px" : "52px",
			);
			assert.equal(observers[0].nodes.length, 2);
			top = 100;
			height = 500;
			scroll.scrollTop = 20;
			observers[0].callback();
			assert.equal(app.dialog.style.getPropertyValue("--preview-height"), "500px");
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				sourceRow ? "88px" : "92px",
			);
			scroll.dispatchEvent(new w.Event("scroll"));
			assert.equal(sheet.classList.contains("is-scrolled"), true);
			scroll.scrollTop = 0;
			top = 0;
			observers[0].callback();
			assert.equal(sheet.style.getPropertyValue("--preview-title-top"), "4px");
			app.sheetHide.destroy();
			app.previewSizeObserver.disconnect();
		} finally {
			f.dom.window.close();
		}
	});
}

test("toast pauses elapsed time and a replacement cannot inherit the old countdown", () => {
	const f = fixture();
	try {
		const { w, app } = f;
		w.document.body.insertAdjacentHTML(
			"beforeend",
			'<div id="toast" hidden><span id="toast-text"></span><span id="toast-action"></span></div>',
		);
		let now = 0,
			active = true,
			next = 1;
		const timers = new Map<number, { callback: () => void; duration: number }>();
		w.performance.now = () => now;
		w.document.hasFocus = () => active;
		w.setTimeout = (callback: () => void, duration: number) => {
			const id = next++;
			timers.set(id, { callback, duration });
			return id;
		};
		w.clearTimeout = (id: number) => timers.delete(id);
		app.showToast("Notice", false);
		assert.equal(timers.get(app.toastTimer).duration, 3200);
		now = 1200;
		app.toastHover = true;
		app.updateToastClock();
		assert.equal(app.toastRemaining, 2000);
		assert.equal(timers.size, 0);
		now = 9000;
		app.updateToastClock();
		assert.equal(app.toastRemaining, 2000);
		app.toastHover = false;
		app.updateToastClock();
		assert.equal(timers.get(app.toastTimer).duration, 2000);
		now += 300;
		active = false;
		app.updateToastClock(true);
		assert.equal(app.toastRemaining, 1700);
		app.showToast("Replacement", false);
		assert.equal(timers.size, 0);
		active = true;
		app.updateToastClock();
		assert.equal(timers.get(app.toastTimer).duration, 3200);
		app.hideToast();
		assert.equal(timers.size, 0);
		assert.equal(w.document.getElementById("toast").inert, true);
		app.showToast("Failure", true);
		assert.equal(timers.size, 0);
	} finally {
		f.dom.window.close();
	}
});

test("settings toggles animate their knob without fading the panel", () => {
	const f = fixture();
	try {
		const { app, w, Store, Panels } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.setPref("stack", false);
		assert.equal(animations.length, 1);
		assert.equal(animations[0].options.pseudoElement, "::before");
		assert.equal(animations[0].options.duration, 120);
		assert.equal(animations[0].frames[0].transform, "translateX(20px)");
		assert.equal(animations[0].frames[1].transform, "none");
		w.document.documentElement.dataset.inputModality = "keyboard";
		app.setPref("stack", true);
		assert.equal(animations.length, 1);
	} finally {
		f.dom.window.close();
	}
});

test("media opens without body or playback state and ignores obsolete playback actions", () => {
	const f = fixture();
	try {
		const { app, w, Store } = f;
		const card = { id: "media", type: "media", title: "Video", image: "coast", chapterCount: 8 };
		Store.state.cards = [card];
		Store.state.items = { media: { seen: true, read: false, progress: 0.25 } };
		Store.item(card.id);
		const before = JSON.stringify(Store.state);
		Store.patch = () => {
			throw new Error("Preview must not write playback state");
		};
		app.previewTrail = [];
		app.currentId = "";
		app.bindPreview = () => {};
		app.bindSheetChrome = () => {};
		app.gestures = { bindPullDown() {} };
		app.openModal = (content, kind) => {
			app.dialog.innerHTML = renderToStaticMarkup(content);
			app.modalKind = kind;
		};
		w.setInterval = () => {
			throw new Error("Preview must not simulate playback");
		};
		app.openCard("media");
		assert.equal(app.dialog.querySelector("#modal-title").textContent, "Video");
		assert.equal(app.dialog.querySelector(".media-step,.media-controls"), null);
		assert.match(app.dialog.textContent, /章节 · 8/);
		for (const name of ["media-play", "media-next", "media-prev", "podcast-play", "podcast-seek"]) {
			app.action(name, "media");
		}
		assert.equal(JSON.stringify(Store.state), before);
	} finally {
		f.dom.window.close();
	}
});

test("desktop card close keeps the dialog until its exit completes", async () => {
	const f = fixture();
	try {
		const { app, w } = f;
		app.dialog.className = "preview";
		app.dialog.innerHTML = '<div class="preview-sheet"></div><div class="float-bar"></div>';
		app.dialog.close = () => app.dialog.removeAttribute("open");
		app.dialog.getAnimations = () => [];
		app.modalKind = "preview";
		app.modalToken = 1;
		app.navKey = "home";
		app.updateSelection = () => {};
		w.document.body.insertAdjacentHTML("beforeend", '<button id="account">Account</button>');
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.closeNative();
		assert.equal(app.dialog.open, true);
		assert.equal(app.dialog.inert, true);
		const exit = animations.find(
			(animation: any) => animation.frames[1]?.transform === "translateY(10px)",
		);
		assert.ok(exit);
		assert.equal(exit.options.duration, 220);
		exit.finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(app.dialog.open, false);
	} finally {
		f.dom.window.close();
	}
});

test("an open card below the feed top tucks the desktop top bar and AI box until its close begins", async () => {
	const f = fixture();
	try {
		const { app, w } = f;
		const calls: string[] = [];
		app.railHide = {
			hide: (force: boolean) => calls.push(`hide:${force}`),
			show: () => calls.push("show"),
			atTop: () => atTop,
			syncPosition() {},
		};
		let atTop = true;
		app.desktop = () => true;
		app.closeMore = () => {};
		app.dialog.showModal = () => app.dialog.setAttribute("open", "");
		app.dialog.close = () => app.dialog.removeAttribute("open");
		app.dialog.getAnimations = () => [];
		app.openModal(null, "settings");
		assert.deepEqual(calls, [], "a panel is not a card");
		app.dialog.close();
		app.openModal(null, "lightbox");
		assert.deepEqual(calls, [], "at the top of the feed the bars stay");
		app.dialog.close();
		atTop = false;
		app.openModal(null, "lightbox");
		assert.deepEqual(calls, ["hide:true"], "even a focused search field gives way");
		app.modalKind = "preview";
		app.navKey = "home";
		app.updateSelection = () => {};
		w.document.body.insertAdjacentHTML("beforeend", '<button id="account">Account</button>');
		w.__motionAnimations = [];
		app.closeNative();
		assert.equal(app.dialog.open, true, "the card is still leaving");
		assert.deepEqual(calls, ["hide:true", "show"], "the bars return as the close begins");
	} finally {
		f.dom.window.close();
	}
});

test("AI references enter once and stay inert until their removal finishes", async () => {
	const f = fixture();
	try {
		const { app, w } = f;
		w.document.body.insertAdjacentHTML(
			"beforeend",
			'<div id="ai-dock"><div id="ai-dock-context"></div><input id="ai-dock-input"></div>',
		);
		app.aiSelectionIds = ["mail-one"];
		app.aiDraft = "";
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.renderAIDock();
		assert.equal(animations.length, 1);
		app.renderAIDock();
		assert.equal(animations.length, 1);
		app.action("ai-context-remove", "mail-one");
		const node = w.document.querySelector("[data-ai-context]");
		assert.equal(node.inert, true);
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 1);
		animations.at(-1).finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 0);
	} finally {
		f.dom.window.close();
	}
});

test("new cover fades to its read-state opacity and cached covers do not replay", () => {
	const f = fixture();
	try {
		const { app, w } = f;
		w.document.head.innerHTML =
			"<style>.card-image{opacity:0}.card-image.is-loaded{opacity:.66}</style>";
		app.grid.innerHTML = '<img class="card-image" src="https://synthetic.test/cover.png">';
		const image = app.grid.firstElementChild;
		Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } });
		w.requestAnimationFrame = (fn: () => void) => {
			fn();
			return 0;
		};
		app.loadedImages = new Set();
		app.layout = { schedule() {} };
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.revealImages(app.grid);
		assert.equal(animations.length, 1);
		assert.equal(animations[0].frames[1].opacity, "0.66");
		app.revealImages(app.grid);
		assert.equal(animations.length, 1);
	} finally {
		f.dom.window.close();
	}
});
