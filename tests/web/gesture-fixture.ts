/** Interrupted gestures never commit actions or change a later panel's state. */
import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {Gestures} from './apps/web/interactions/gestures.ts'; export {MotionEngine} from './apps/web/interactions/motion.ts'; export {Store} from './apps/web/data/store.ts'; export {shieldWheelTail} from './apps/web/interactions/gesture-input.ts'; export {flushReadingRefresh} from './apps/web/interactions/reading-feedback.ts'; export {resistedDistance,reboundTrack} from './apps/web/interactions/gesture-rebound.ts';",
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
	globalName: "GestureTest",
}).outputFiles[0].text;

export function fixture({ kind = "preview", phone = false, end = false } = {}) {
	const reader = kind === "reader";
	const dom = new JSDOM(
		`<!doctype html><main><p>桌面卡片</p></main><dialog id="modal" class="${kind}">${reader ? '<div class="reader-scroll" id="reader-scroll">' : '<div class="sheet preview-sheet"><div class="sheet-scroll">'}<p>卡片正文</p><div id="reader-end"></div></div>${reader ? "" : "</div>"}<div class="float-bar"><button>收藏</button></div></dialog><div id="toast">可撤销操作</div>`,
		{ url: "http://gestures.test/", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any,
		document = w.document;
	w.matchMedia = (query: string) => ({
		matches: query.includes("max-width") && phone,
		addEventListener() {},
	});
	w.structuredClone = structuredClone;
	const timers = new Map<number, () => void>(),
		frames = new Map<number, () => void>();
	let taskId = 0;
	const delays = new Map<number, number>();
	w.setTimeout = (callback: () => void, delay = 0) => {
		const id = ++taskId;
		timers.set(id, callback);
		delays.set(id, delay);
		return id;
	};
	w.clearTimeout = (id: number) => timers.delete(id);
	w.requestAnimationFrame = (callback: () => void) => {
		const id = ++taskId;
		frames.set(id, callback);
		return id;
	};
	w.cancelAnimationFrame = (id: number) => frames.delete(id);
	w.eval(bundle);
	const { Gestures, MotionEngine, Store } = w.GestureTest;
	Store.state = Store.fresh();
	Store.state.cards = [{ id: "article", type: "article", title: "阅读卡片", body: "正文" }];
	Store.item("article");
	Store.save();
	const dialog = document.getElementById("modal"),
		scroll = dialog.querySelector(".sheet-scroll, .reader-scroll");
	dialog.open = kind !== "desk";
	Object.defineProperties(scroll, {
		scrollHeight: { value: 1600 },
		clientHeight: { value: 600 },
	});
	scroll.scrollTop = end ? 1000 : 0;
	Object.defineProperty(dialog.querySelector(".preview-sheet") || dialog, "offsetHeight", {
		value: 600,
	});
	const app = {
		dialog,
		modalToken: 1,
		toastSeq: 1,
		toastTimer: 0,
		selected: new Set(),
		drag: { active: false, menu: { open: false } },
		refreshes: 0,
		closed: 0,
		skipReturnMotion: false,
		sheetLeaving: false,
		refresh() {
			this.refreshes++;
			return Promise.resolve();
		},
		refreshCard() {},
		closeModal() {
			this.closed++;
			dialog.open = false;
			w.GestureTest.flushReadingRefresh(this);
		},
		closeToDesk() {
			this.closeModal();
		},
	};
	const gestures = new Gestures(app);
	if (kind === "reader") gestures.bindPullDown();
	if (end) gestures.bindPush("article", scroll);
	const fire = (target: Element, type: string, x = 120, y = 200) => {
		const event = new w.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, {
			touches: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }],
			changedTouches: [{ clientX: x, clientY: y }],
		});
		target.dispatchEvent(event);
	};
	const flush = (tasks = timers, maximumDelay = Infinity) => {
		for (const [id, callback] of [...tasks]) {
			if (tasks === timers && delays.get(id) > maximumDelay) continue;
			tasks.delete(id);
			callback();
		}
	};
	return {
		dom,
		w,
		document,
		dialog,
		scroll,
		app,
		gestures,
		MotionEngine,
		Store,
		fire,
		flush,
		frames,
	};
}
