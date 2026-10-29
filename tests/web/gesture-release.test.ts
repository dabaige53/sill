import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {Gestures} from './apps/web/interactions/gestures.ts'; export {Store} from './apps/web/data/store.ts'; export {MotionEngine} from './apps/web/interactions/motion.ts';",
		resolveDir: process.cwd(),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	globalName: "ReleaseTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		'<main></main><dialog id="modal" class="preview" open><div class="sheet preview-sheet"><div class="sheet-scroll"><p>正文</p><div id="reader-end"></div></div></div></dialog><div id="toast"></div>',
		{ runScripts: "outside-only", url: "https://gesture.test", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false });
	w.structuredClone = structuredClone;
	let now = 0;
	Object.defineProperty(w.performance, "now", { value: () => now });
	w.eval(bundle);
	const { Gestures, Store, MotionEngine } = w.ReleaseTest;
	Store.state = Store.fresh();
	Store.state.cards = [{ id: "a", type: "article", title: "标题", body: "正文" }];
	const dialog = w.document.querySelector("dialog");
	const app = {
		dialog,
		modalToken: 1,
		modalKind: "preview",
		selected: new Set(),
		refreshCard() {},
		closeModal() {},
		toastSeq: 1,
	};
	const gestures = new Gestures(app);
	const scroll = dialog.querySelector(".sheet-scroll");
	Object.defineProperties(scroll, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
	const fire = (type: string, y: number) => {
		const event = new w.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, {
			touches: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: 100, clientY: y }],
			changedTouches: [{ clientX: 100, clientY: y }],
		});
		scroll.dispatchEvent(event);
	};
	return {
		dom,
		w,
		gestures,
		Store,
		MotionEngine,
		scroll,
		fire,
		time: (value: number) => {
			now = value;
		},
	};
}

test("read-end cancels below threshold and completes at threshold without release", () => {
	const f = fixture();
	try {
		f.scroll.scrollTop = 800;
		f.gestures.bindPush("a", f.scroll);
		f.fire("touchstart", 500);
		f.fire("touchmove", 400);
		assert.equal(Boolean(f.Store.item("a").read), false);
		f.fire("touchcancel", 400);
		assert.equal(Boolean(f.Store.item("a").read), false);
		f.fire("touchstart", 500);
		f.fire("touchmove", 250);
		assert.equal(f.Store.item("a").read, true);
		assert.equal(
			f.scroll.closest("dialog").querySelector(".push-ring").classList.contains("is-done"),
			true,
		);
		f.fire("touchcancel", 250);
		assert.equal(f.Store.item("a").read, true);
		f.fire("touchend", 250);
		assert.equal(f.Store.item("a").read, true);
	} finally {
		f.dom.window.close();
	}
});

test("holding before a flick does not dilute release speed; holding after it cancels the flick", () => {
	const f = fixture();
	try {
		const velocity = f.gestures.velocity(0);
		f.time(1000);
		velocity.feed(0);
		f.time(1060);
		velocity.feed(60);
		assert.equal(f.gestures.flick(60, velocity.read()), true);
		f.time(1300);
		assert.equal(f.gestures.flick(60, velocity.read()), false);
	} finally {
		f.dom.window.close();
	}
});

test("a repeated content update starts at the currently visible opacity", () => {
	const f = fixture();
	try {
		const el = f.w.document.querySelector("p");
		const calls: any[] = [];
		f.w.__motionAnimations = calls;
		f.MotionEngine.fade(el);
		el.style.opacity = "0.45";
		f.MotionEngine.fade(el);
		assert.equal(calls[0].frames[0].opacity, 0);
		assert.equal(Number(calls[1].frames[0].opacity), 0.45);
	} finally {
		f.dom.window.close();
	}
});

test("cancelled toast exit does not hide a toast grabbed again", async () => {
	const f = fixture();
	try {
		const toast = f.w.document.getElementById("toast");
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const fire = (type: string, y: number) => {
			const event = new f.w.Event(type, { bubbles: true, cancelable: true });
			Object.assign(event, {
				touches: type === "touchend" ? [] : [{ clientX: 50, clientY: y }],
				changedTouches: [{ clientX: 50, clientY: y }],
			});
			toast.dispatchEvent(event);
		};
		fire("touchstart", 100);
		fire("touchmove", 150);
		fire("touchend", 150);
		fire("touchstart", 150);
		for (const animation of animations) animation.finish();
		await Promise.resolve();
		assert.equal(toast.hidden, false);
	} finally {
		f.dom.window.close();
	}
});
