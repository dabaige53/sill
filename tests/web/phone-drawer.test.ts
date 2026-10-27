/** Real Vaul in a synthetic DOM; this verifies ownership/lifecycle, not touch feel. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: `export * from './apps/web/interactions/phone-drawer.tsx'; export * from './apps/web/views/react-renderer.ts'; export * from './apps/web/views/phone-preview-stack.ts'; export {createElement} from 'react'; export {flushSync} from 'react-dom'; export {Gestures} from './apps/web/interactions/gestures.ts';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "DrawerTest",
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		'<div id="workspace-background"><main></main></div><dialog id="modal" class="preview" open></dialog>',
		{ url: "http://drawer.test", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
	w.scrollTo = (options: { top?: number }) => {
		w.document.documentElement.scrollTop = options.top || 0;
	};
	w.document.documentElement.scrollTop = 180;
	w.HTMLDialogElement.prototype.close = function () {
		this.removeAttribute("open");
	};
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	w.eval(bundle);
	const api = w.DrawerTest;
	const dialog = w.document.getElementById("modal");
	const app = {
		dialog,
		modalKind: "preview",
		closeModal() {
			app.closed++;
		},
		closed: 0,
		lockedScroll: 180,
		currentId: "parent",
		previewTrail: ["parent"],
		modalToken: 1,
		bindDialog() {},
		bindPreview() {},
		bindSheetChrome() {},
	};
	const el = api.createElement;
	const body = el(
		"div",
		{ className: "preview-sheet" },
		el("button", { className: "sheet-handle" }, "resize"),
		el("h1", { id: "modal-title" }, "Synthetic card"),
		el("div", { className: "sheet-scroll" }, el("button", { id: "task" }, "Task")),
	);
	api.configurePhoneDrawer(app, true);
	api.renderContent(dialog, el("div", null, body));
	return {
		dom,
		w,
		api,
		dialog,
		app,
		body,
		dispose() {
			api.releaseView(dialog);
			dom.window.close();
		},
	};
}

test("Vaul opens without snap points and retains card DOM, scroll and focus", async () => {
	const f = fixture();
	try {
		const drawer = f.dialog.querySelector("[data-vaul-drawer]");
		assert.equal(drawer.style.animationPlayState, "");
		assert.ok(drawer.querySelector("[data-vaul-handle]"));
		const task = f.dialog.querySelector("#task");
		const scroll = f.dialog.querySelector(".sheet-scroll");
		assert.ok(f.dialog.hasAttribute("data-phone-drawer"));
		assert.equal(f.dialog.querySelector("[data-vaul-drawer]").dataset.vaulSnapPoints, "false");
		assert.equal(f.dialog.querySelector(".preview-sheet").classList.contains("is-full"), true);
		scroll.scrollTop = 80;
		task.focus();
		f.api.renderView(f.dialog, f.api.createElement("div", null, f.body));
		assert.equal(f.dialog.querySelector("#task"), task);
		assert.equal(f.w.document.activeElement, task);
		assert.equal(scroll.scrollTop, 80);
	} finally {
		f.dispose();
	}
});

test("unmount cancels a pending close so it cannot close the next card", async () => {
	const f = fixture();
	try {
		let closed = 0;
		f.api.flushSync(() =>
			assert.equal(
				f.api.closePhoneDrawer(f.dialog, () => closed++),
				true,
			),
		);
		// JSDOM does not run CSS exit animations; Presence may remove the content immediately.
		assert.notEqual(f.dialog.querySelector("[data-vaul-drawer]")?.dataset.state, "open");
		f.api.renderContent(f.dialog, f.body);
		await new Promise((resolve) => setTimeout(resolve, 550));
		assert.equal(closed, 0);
		assert.equal(f.dialog.querySelector("[data-vaul-drawer]").dataset.state, "open");
	} finally {
		f.dispose();
	}
});

test("native close waits for Vaul and old pull gestures do not bind", async () => {
	const f = fixture();
	try {
		let bound = 0;
		f.api.Gestures.prototype.bindPullDown.call({
			app: f.app,
			bindPreviewResistance() {
				bound++;
			},
			bindPreviewHandle() {
				bound++;
			},
			bindPreviewExpansion() {
				bound++;
			},
		});
		assert.equal(bound, 0);
		let closed = 0;
		f.api.flushSync(() => f.api.closePhoneDrawer(f.dialog, () => closed++));
		assert.equal(closed, 0);
		await new Promise((resolve) => setTimeout(resolve, 550));
		assert.equal(closed, 1);
	} finally {
		f.dispose();
	}
});

test("the scale target includes the page chrome and restores page geometry on unmount", () => {
	const f = fixture();
	try {
		const background = f.w.document.querySelector("#workspace-background");
		assert.equal(f.w.document.querySelector("[data-vaul-drawer-wrapper]"), background);
		assert.equal(background.classList.contains("is-drawer-background"), true);
		assert.equal(background.querySelector("main").style.translate, "0 0px");
		f.api.releaseView(f.dialog);
		assert.equal(background.hasAttribute("data-vaul-drawer-wrapper"), false);
		assert.equal(background.classList.contains("is-drawer-background"), false);
		assert.equal(f.w.document.body.style.minHeight, "");
		assert.equal(f.w.document.documentElement.scrollTop, 180);
	} finally {
		f.dispose();
	}
});

test("linked phone previews retain the mounted parent and restore its scroll on close", async () => {
	const f = fixture();
	try {
		const parent = f.dialog;
		const scroll = parent.querySelector(".sheet-scroll");
		scroll.scrollTop = 123;
		f.api.pushPhonePreview(f.app);
		assert.equal(parent.isConnected, true);
		assert.equal(parent.classList.contains("phone-layer"), true);
		const child = f.app.dialog;
		f.app.currentId = "child";
		f.api.configurePhoneDrawer(f.app, true);
		f.api.renderContent(child, f.body);
		assert.equal(
			f.w.document.querySelector("[data-vaul-drawer-wrapper]").id,
			"workspace-background",
		);
		assert.match(parent.querySelector("[data-vaul-drawer]").style.transform, /scale.*-16px/);
		f.api.flushSync(() => assert.equal(f.api.restorePhonePreview(f.app, "parent"), true));
		await new Promise((resolve) => setTimeout(resolve, 550));
		assert.equal(f.app.dialog, parent);
		assert.equal(child.isConnected, false);
		assert.equal(parent.querySelector(".sheet-scroll"), scroll);
		assert.equal(scroll.scrollTop, 123);
		assert.equal(parent.id, "modal");
		assert.equal(
			f.w.document.querySelector("[data-vaul-drawer-wrapper]").id,
			"workspace-background",
		);
	} finally {
		f.dispose();
	}
});

test("wheel at the top does not move or close the Vaul drawer", () => {
	const f = fixture();
	try {
		const drawer = f.dialog.querySelector(".phone-drawer");
		const background = f.w.document.querySelector("#workspace-background");
		const transform = background.style.transform;
		const scroll = f.dialog.querySelector(".sheet-scroll");
		f.api.flushSync(() => scroll.dispatchEvent(
			new f.w.WheelEvent("wheel", { deltaY: -400, bubbles: true, cancelable: true }),
		));
		assert.equal(f.app.closed, 0);
		assert.equal(drawer.dataset.state, "open");
		assert.equal(drawer.style.transform, "");
		assert.equal(background.style.transform, transform);
	} finally {
		f.dispose();
	}
});
