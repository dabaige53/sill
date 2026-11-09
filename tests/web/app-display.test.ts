/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./app-fixture.ts";
import { installTimers } from "./react-browser-fixture.ts";

// @wu-test type=behavior | scope=toast visibility | protects=Keep notifications visible for the remaining active time and give replacements a fresh duration
test("toast pauses elapsed time and a replacement cannot inherit the old countdown", async () => {
	const f = fixture();
	try {
		const { w, app } = f;
		w.document.body.insertAdjacentHTML(
			"beforeend",
			'<div id="toast" hidden><span id="toast-text"></span><span id="toast-action"></span></div>',
		);
		let active = true;
		const clock = installTimers(w);
		w.performance.now = clock.now;
		w.document.hasFocus = () => active;
		const toast = w.document.getElementById("toast");
		toast.tabIndex = 0;
		const text = () => w.document.getElementById("toast-text").textContent;
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.showToast("Notice", false);
		clock.advance(1200);
		toast.focus();
		app.updateToastClock();
		clock.advance(7800);
		app.updateToastClock();
		assert.equal(toast.inert, false, "focused notices remain available");
		assert.equal(text(), "Notice");
		toast.blur();
		app.updateToastClock();
		clock.advance(300);
		active = false;
		app.updateToastClock(true);
		clock.advance(10000);
		assert.equal(toast.inert, false, "unfocused windows do not consume notice time");
		app.showToast("Replacement", false);
		clock.advance(10000);
		assert.equal(text(), "Replacement");
		assert.equal(toast.inert, false);
		active = true;
		app.updateToastClock();
		clock.advance(3199);
		assert.equal(toast.inert, false, "replacement gets its entire active duration");
		clock.advance(1);
		assert.equal(toast.inert, true);
		for (const animation of animations) animation.finish();
		await Promise.resolve();
		assert.equal(toast.hidden, true);
		app.showToast("Failure", true);
		clock.advance(10000);
		assert.equal(text(), "Failure");
		assert.equal(toast.hidden, false);
		assert.equal(toast.inert, false, "failure notices require an explicit dismissal");
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=media preview | protects=Open unavailable media without changing saved playback progress
test("unavailable media opens with its saved playback progress unchanged", () => {
	const f = fixture();
	try {
		const { app, w, Store } = f;
		const card = { id: "media", type: "media", title: "Video", images: ["coast"] };
		Store.state.cards = [card];
		Store.state.items = { media: { seen: true, read: false, progress: 0.25 } };
		Store.item(card.id);
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
		assert.equal(Store.item(card.id).progress, 0.25);
		assert.equal(Store.item(card.id).playbackPosition, undefined);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=desktop card dismissal | protects=Keep the closing card visible and inert until dismissal finishes
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
			(animation: any) => animation.target === app.dialog.querySelector(".preview-sheet"),
		);
		assert.ok(exit);
		exit.finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(app.dialog.open, false);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=desktop card and navigation bars | protects=Hide navigation bars while a card is open below the feed top and restore them when closing starts | debt=over-mock
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

// @wu-test type=behavior | scope=AI reference removal | protects=Prevent interaction with a reference while it leaves and remove it after the transition
test("AI references stay inert until removal finishes and preserve the input draft", async () => {
	const f = fixture();
	try {
		const { app, w } = f;
		w.document.body.insertAdjacentHTML(
			"beforeend",
			'<div id="ai-dock"><div id="ai-dock-context"></div><input id="ai-dock-input"></div>',
		);
		app.aiSelectionIds = ["mail-one"];
		app.aiDraft = "Unsent draft";
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.renderAIDock();
		for (const animation of animations) animation.finish();
		await Promise.resolve();
		animations.length = 0;
		app.renderAIDock();
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 1);
		app.action("ai-context-remove", "mail-one");
		const node = w.document.querySelector("[data-ai-context]");
		assert.equal(node.inert, true);
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 1);
		assert.equal(w.document.getElementById("ai-dock-input").value, "Unsent draft");
		assert.ok(animations.some((animation) => animation.target === node));
		for (const animation of animations) animation.finish();
		for (let i = 0; i < 5; i++) await Promise.resolve();
		assert.equal(w.document.querySelectorAll("[data-ai-context]").length, 0);
		assert.equal(w.document.getElementById("ai-dock-input").value, "Unsent draft");
		assert.equal(w.document.activeElement, w.document.getElementById("ai-dock-input"));
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=card cover reveal | protects=Show loaded covers without replaying a visible fade behind an open card | debt=over-mock,impl-detail
test("a cover that loads under a card drawer or off screen shows without a fade", () => {
	const f = fixture();
	try {
		const { app, w } = f;
		w.requestAnimationFrame = (fn: () => void) => {
			fn();
			return 0;
		};
		app.loadedImages = new Set();
		app.layout = { schedule() {} };
		const animations: any[] = [];
		w.__motionAnimations = animations;
		const cover = (src: string, top = 0) => {
			app.grid.innerHTML = `<img class="card-image" src="https://synthetic.test/${src}.png">`;
			const image = app.grid.firstElementChild;
			Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } });
			image.getBoundingClientRect = () => ({ top, bottom: top + 100, height: 100 });
			return image;
		};
		w.document.body.classList.add("is-drawer-scaled");
		const covered = cover("covered");
		app.revealImages(app.grid);
		assert.equal(covered.classList.contains("is-loaded"), true);
		assert.equal(animations.length, 0, "the first card drawer does not blink the covers behind it");
		w.document.body.classList.remove("is-drawer-scaled");
		cover("below", w.innerHeight + 200);
		app.revealImages(app.grid);
		assert.equal(
			animations.length,
			0,
			"a cover loading below the screen is ready when scrolled to",
		);
		cover("visible", 100);
		app.revealImages(app.grid);
		assert.equal(animations.length, 1);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=task completion in card detail | protects=Preserve detail, focus and scroll while toggling a task
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

// @wu-test type=behavior | scope=video card navigation | protects=Open the video preview instead of an unsupported reader
test("a video card has no fullscreen: a reading request opens its preview", () => {
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
		w.requestAnimationFrame = (fn: () => void) => {
			fn();
			return 1;
		};
		app.openCard(card.id, true);
		assert.equal(app.modalKind, "preview");
		assert.ok(dialog.querySelector("[data-video-surface]"));
		assert.equal(dialog.querySelector(".reader-layout"), null);
	} finally {
		w.ControllerTest.renderContent(f.app.dialog, null);
		f.dom.window.close();
	}
});

for (const modality of ["pointer", "keyboard"]) {
	// @wu-test type=behavior | scope=card dismissal focus | protects=Return focus to the trigger after keyboard dismissal
	test(`card dismissal restores focus only for keyboard navigation: ${modality}`, () => {
		const f = fixture();
		try {
			const { app, w } = f;
			w.document.documentElement.dataset.inputModality = modality;
			w.document.body.insertAdjacentHTML(
				"beforeend",
				'<article class="feed-card"><button class="card-action">Open</button></article><button id="account">Account</button>',
			);
			const trigger = w.document.querySelector(".card-action");
			trigger.getClientRects = () => [{ width: 44, height: 44 }];
			trigger.focus();
			app.lastFocus = trigger;
			app.dialog.className = "preview";
			app.dialog.close = () => {
				app.dialog.removeAttribute("open");
				trigger.focus();
			};
			app.dialog.getAnimations = () => [];
			app.modalKind = "preview";
			app.navKey = "home";
			app.updateSelection = () => {};
			app.closeNative(false);
			assert.equal(w.document.activeElement === trigger, modality === "keyboard");
		} finally {
			f.dom.window.close();
		}
	});
}
