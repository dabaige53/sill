/** Real Vaul in a synthetic DOM; this verifies ownership/lifecycle, not touch feel. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installTimers } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents: `export * from './apps/web/interactions/phone-drawer.tsx'; export * from './apps/web/views/react-renderer.ts'; export * from './apps/web/views/phone-preview-stack.ts'; export {createElement} from 'react'; export {flushSync} from 'react-dom'; export {Gestures} from './apps/web/interactions/gestures.ts';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
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
	Object.defineProperty(w, "scrollY", {
		get: () => w.document.documentElement.scrollTop,
	});
	w.HTMLDialogElement.prototype.close = function () {
		this.removeAttribute("open");
	};
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	const clock = installTimers(w);
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
		clock,
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

test("unmount cancels a pending close so it cannot close the next card", () => {
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
		f.api.flushSync(() => f.clock.advance(550));
		assert.equal(closed, 0);
		assert.equal(f.dialog.querySelector("[data-vaul-drawer]").dataset.state, "open");
	} finally {
		f.dispose();
	}
});

test("native close waits for Vaul and old pull gestures do not bind", () => {
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
		f.api.flushSync(() => f.clock.advance(550));
		assert.equal(closed, 1);
	} finally {
		f.dispose();
	}
});

test("the scale target includes the page chrome and restores page geometry on unmount", async () => {
	const f = fixture();
	try {
		const background = f.w.document.querySelector("#workspace-background");
		assert.equal(f.w.document.querySelector("[data-vaul-drawer-wrapper]"), background);
		assert.equal(background.classList.contains("is-drawer-background"), true);
		assert.equal(background.querySelector("main").style.translate, "0 -180px");
		assert.equal(f.w.scrollY, 0, "the frozen document cannot block Vaul's downward drag");
		assert.equal(f.w.document.body.style.minHeight, `${f.w.innerHeight}px`);
		f.api.releaseView(f.dialog);
		assert.equal(background.classList.contains("is-drawer-background"), false);
		// The glass returns a frame after the page geometry, never in the same frame.
		assert.equal(background.hasAttribute("data-vaul-drawer-wrapper"), true);
		await new Promise((resolve) => f.w.requestAnimationFrame(resolve));
		assert.equal(background.hasAttribute("data-vaul-drawer-wrapper"), false);
		assert.equal(f.w.document.body.style.minHeight, "");
		assert.equal(f.w.document.documentElement.scrollTop, 180);
	} finally {
		f.dispose();
	}
});

test("linked phone previews retain the mounted parent and restore its scroll on close", () => {
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
		f.api.flushSync(() => f.clock.advance(550));
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

test("a drawer above a scrolled feed accepts a downward drag and closes", async () => {
	const f = fixture();
	try {
		const drawer = f.dialog.querySelector(".phone-drawer");
		Object.defineProperties(f.w.document.documentElement, {
			scrollHeight: { get: () => 2200 },
			clientHeight: { get: () => 768 },
		});
		drawer.getBoundingClientRect = () => ({ height: 600, width: 390, top: 100 });
		drawer.setPointerCapture = () => {};
		const computed = f.w.getComputedStyle.bind(f.w);
		f.w.getComputedStyle = (node: Element) => {
			const style = computed(node);
			if (node === drawer) {
				const distance = drawer.style.transform.match(/translate3d\(0, ([\d.]+)px, 0\)/)?.[1];
				style.transform = distance ? `matrix(1, 0, 0, 1, 0, ${distance})` : "none";
			}
			return style;
		};
		// Complete the library's opening guard without waiting for a physical animation.
		const DateBase = f.w.Date;
		let now = DateBase.now() + 1000;
		f.w.Date = class extends DateBase {
			constructor() {
				super(now);
				now += 20;
			}
		};
		const pointer = (type: string, y: number) => {
			const event = new f.w.MouseEvent(type, { bubbles: true, clientX: 100, clientY: y });
			Object.defineProperties(event, {
				pointerId: { value: 1 },
				pointerType: { value: "touch" },
			});
			f.api.flushSync(() => drawer.dispatchEvent(event));
		};
		pointer("pointerdown", 100);
		pointer("pointermove", 400);
		assert.equal(drawer.style.transform, "translate3d(0, 300px, 0)");
		pointer("pointerup", 400);
		assert.equal(f.app.closed, 1);
		await Promise.resolve();
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
		f.api.flushSync(() =>
			scroll.dispatchEvent(
				new f.w.WheelEvent("wheel", { deltaY: -400, bubbles: true, cancelable: true }),
			),
		);
		assert.equal(f.app.closed, 0);
		assert.equal(drawer.dataset.state, "open");
		assert.equal(drawer.style.transform, "");
		assert.equal(background.style.transform, transform);
	} finally {
		f.dispose();
	}
});

test("presses, focus and Escape in the tags layer leave the card drawer open", () => {
	const f = fixture();
	try {
		const layer = f.w.document.createElement("dialog");
		layer.id = "tag-layer";
		layer.setAttribute("open", "");
		layer.innerHTML =
			'<button id="layer-close">×</button><input id="tag-new"><button id="suggest">工作</button>';
		f.w.document.body.append(layer);
		(f.app as any).editorLayer = layer;
		// Adding a suggested tag redraws the editor during the click, so the pressed chip is gone
		// by the time the drawer judges the press.
		const chip = layer.querySelector("#suggest");
		chip.addEventListener("click", () => chip.remove());
		f.api.flushSync(() => f.clock.advance(10));
		const press = (target: Element) => {
			target.dispatchEvent(new f.w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
			target.dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
		};
		f.api.flushSync(() => press(chip));
		f.api.flushSync(() => f.clock.advance(700));
		f.api.flushSync(() => press(layer.querySelector("#layer-close")));
		f.api.flushSync(() => layer.querySelector("#tag-new").focus());
		f.api.flushSync(() =>
			f.w.document.activeElement.dispatchEvent(
				new f.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
			),
		);
		f.api.flushSync(() => f.clock.advance(700));
		assert.equal(f.app.closed, 0);
		assert.equal(f.dialog.querySelector("[data-vaul-drawer]").dataset.state, "open");
		// With the layer gone, a press outside dismisses the card again, so the check above is live.
		layer.removeAttribute("open");
		layer.remove();
		f.api.flushSync(() => press(f.w.document.querySelector("main")));
		f.api.flushSync(() => f.clock.advance(700));
		assert.equal(f.app.closed, 1);
	} finally {
		f.dispose();
	}
});
