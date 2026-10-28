/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "./app-fixture.ts";

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

test("settings toggles share one progress animation without fading the panel", () => {
	const f = fixture();
	try {
		const { app, w, Store } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.repaintSettings();
		const animations: any[] = [];
		w.__motionValueAnimations = animations;
		app.setPref("stack", false);
		assert.equal(animations.length, 1);
		assert.equal(animations[0].destination, 0);
		assert.equal(animations[0].options.visualDuration, 0.3);
		assert.equal(animations[0].options.bounce, 0.25);
		animations[0].finish();
		const toggle = app.dialog.querySelector('[data-id="stack"]');
		assert.equal(toggle.querySelector(".toggle-fill").style.opacity, "0");
		assert.equal(toggle.querySelector(".toggle-knob").style.transform, "translateX(0px) scaleX(1)");
		w.document.documentElement.dataset.inputModality = "keyboard";
		app.setPref("stack", true);
		assert.equal(animations.length, 1);
		assert.equal(toggle.querySelector(".toggle-fill").style.opacity, "1");
	} finally {
		f.dom.window.close();
	}
});

test("media opens without body or playback state and ignores obsolete playback actions", () => {
	const f = fixture();
	try {
		const { app, w, Store } = f;
		const card = { id: "media", type: "media", title: "Video", images: ["coast"] };
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
			w.ControllerTest.renderContent(app.dialog, content);
			app.modalKind = kind;
		};
		w.setInterval = () => {
			throw new Error("Preview must not simulate playback");
		};
		app.openCard("media");
		assert.equal(app.dialog.querySelector("#modal-title").textContent, "Video");
		assert.equal(app.dialog.querySelector(".media-step,.media-controls"), null);
		assert.ok(app.dialog.querySelector(".unavailable-video button[disabled]"));
		assert.doesNotMatch(app.dialog.textContent, /章节 · 8/);
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
			show: (withCard: boolean) => calls.push(withCard ? "show" : "show:alone"),
			atTop: () => atTop,
			syncPosition() {},
		};
		let atTop = true;
		app.desktop = () => true;
		app.modalToken = 1;
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
		assert.deepEqual(calls, ["hide:true", "show"], "the bars return with the card's first frame");
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
		assert.equal(animations.length, 2);
		app.renderAIDock();
		assert.equal(animations.length, 2);
		app.action("ai-context-remove", "mail-one");
		const node = w.document.querySelector("[data-ai-context]");
		assert.equal(node.inert, true);
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 1);
		assert.equal(animations[0].options.duration, 500);
		assert.equal(animations[1].options.duration, 180);
		assert.equal(animations.at(-2).options.duration, 220);
		assert.equal(animations.at(-1).options.duration, 140);
		animations.at(-1).finish();
		await Promise.resolve();
		assert.equal(
			w.document.querySelectorAll("[data-ai-context]").length,
			1,
			"fade alone cannot remove a traveling reference",
		);
		animations.at(-2).finish();
		for (let i = 0; i < 5; i++) await Promise.resolve();
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

test("task completion retains the detail, toolbar, checklist focus and scroll", () => {
	const f = fixture();
	try {
		const card = {
			id: "task-one",
			type: "task",
			title: "Tasks",
			tasks: [
				{ id: "first", text: "First" },
				{ id: "second", text: "Second" },
			],
		};
		f.Store.state.cards = [card];
		f.app.currentId = card.id;
		f.app.modalKind = "preview";
		f.app.checkReminders = () => {};
		const { PanelViews, renderContent } = f.w.ControllerTest;
		renderContent(f.app.dialog, PanelViews.preview(f.app, card));
		const sheet = f.app.dialog.querySelector(".preview-sheet");
		const bar = f.app.dialog.querySelector(".float-bar");
		const scroll = f.app.dialog.querySelector(".sheet-scroll");
		const button = f.app.dialog.querySelector('[data-action="task"]');
		scroll.scrollTop = 80;
		button.focus();
		f.app.toggleTask(card.id, "first");
		assert.equal(f.app.dialog.querySelector(".preview-sheet"), sheet);
		assert.equal(f.app.dialog.querySelector(".float-bar"), bar);
		assert.equal(f.w.document.activeElement, button);
		assert.equal(scroll.scrollTop, 80);
		assert.equal(button.getAttribute("aria-checked"), "true");
		f.app.toggleTask(card.id, "first");
		assert.equal(button.getAttribute("aria-checked"), "false");
	} finally {
		f.dom.window.close();
	}
});

test("the controller keeps the video iframe through preview/fullscreen in both directions", async () => {
	const f = fixture();
	const { w, Store } = f;
	const app = new w.ControllerTest.AppController();
	try {
		const card = {
			id: "video-one",
			type: "media",
			media: "video",
			title: "Video",
			url: "https://youtu.be/abcdefghijk",
			duration: 120,
		};
		Store.state.cards = [card];
		Store.item(card.id).seen = true;
		const dialog = f.app.dialog;
		dialog.open = false;
		dialog.showModal = () => {
			dialog.open = true;
		};
		dialog.close = () => {
			dialog.open = false;
		};
		app.dialog = dialog;
		app.grid = f.app.grid;
		app.desktop = () => true;
		app.refreshCard = () => {};
		app.bindReader = () => {};
		app.bindPreview = () => {};
		app.bindSheetChrome = () => {};
		app.railHide = { atTop: () => true };
		app.gestures = { bindPullDown() {} };
		w.document.documentElement.dataset.inputModality = "keyboard";
		w.requestAnimationFrame = (fn: () => void) => {
			fn();
			return 1;
		};
		let created = 0,
			destroyed = 0;
		w.YT = {
			Player: class {
				constructor() {
					created++;
				}
				destroy() {
					destroyed++;
				}
			},
		};
		app.openCard(card.id);
		await new Promise((resolve) => setImmediate(resolve));
		const frame = dialog.querySelector("iframe");
		assert.ok(frame);
		app.openCard(card.id, true);
		assert.equal(dialog.querySelector("iframe") === frame, true);
		app.openCard(card.id, false);
		assert.equal(dialog.querySelector("iframe") === frame, true);
		assert.equal(created, 1);
		assert.equal(destroyed, 0);
	} finally {
		w.ControllerTest.renderContent(f.app.dialog, null);
		f.dom.window.close();
	}
});
