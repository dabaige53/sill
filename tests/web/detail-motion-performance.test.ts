/** Detail open, resize and reading stay smooth: no covering backdrop, no per-tick list renders, no per-scroll saves. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";
import { fixture } from "./visibility-motion-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const motionAlias = {
	"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
};

function readerDialog(f: ReturnType<typeof fixture>, kind: "reader" | "preview") {
	const dialog = f.w.document.createElement("dialog");
	dialog.open = true;
	dialog.className = kind;
	dialog.dataset.readerResize = "true";
	dialog.innerHTML =
		kind === "reader"
			? '<div class="reader-body"></div>'
			: '<div class="preview-sheet"><div class="preview-body"></div></div>';
	f.w.document.body.append(dialog);
	const surface = kind === "reader" ? dialog : dialog.firstElementChild;
	surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844 });
	let frame: () => void = () => {};
	f.w.requestAnimationFrame = (fn: () => void) => {
		frame = fn;
		return 1;
	};
	f.w.cancelAnimationFrame = () => {};
	return { dialog, frame: () => frame() };
}

test("a reader growing from its preview keeps the preview dim until its surface covers the screen", async () => {
	const f = fixture();
	try {
		f.w.matchMedia = () => ({ matches: true });
		const { dialog, frame } = readerDialog(f, "reader");
		const origin = { left: 0, top: 64, width: 390, height: 780 };
		f.motion.queuePanel(dialog, origin);
		assert.ok("readerGrowing" in dialog.dataset, "the waiting frame must not show the page colour");
		frame();
		assert.ok("readerGrowing" in dialog.dataset, "the growth keeps the dim");
		const growth = f.animations.find((a: any) => String(a.frames[0].transform).includes("scale"));
		assert.ok(growth, "the reader surface grows from the preview");
		growth.finish();
		await growth.finished;
		await Promise.resolve();
		assert.equal("readerGrowing" in dialog.dataset, false);
		assert.equal(dialog.querySelector("[data-reader-resize-surface]"), null);
	} finally {
		f.dom.window.close();
	}
});

test("cancelling a reader growth restores the page backdrop", () => {
	const f = fixture();
	try {
		const { dialog, frame } = readerDialog(f, "reader");
		f.motion.queuePanel(dialog, { left: 400, top: 200, width: 600, height: 400 });
		f.motion.cancelPanel(dialog);
		assert.equal("readerGrowing" in dialog.dataset, false);
		f.motion.queuePanel(dialog, { left: 400, top: 200, width: 600, height: 400 });
		frame();
		f.motion.cancelPanel(dialog);
		assert.equal("readerGrowing" in dialog.dataset, false);
	} finally {
		f.dom.window.close();
	}
});

test("a phone preview shrinking from the reader does not blank its dim for the waiting frame", () => {
	const f = fixture();
	try {
		f.w.matchMedia = () => ({ matches: true });
		const { dialog } = readerDialog(f, "preview");
		f.motion.queuePanel(dialog, { left: 0, top: 0, width: 390, height: 844 });
		assert.equal(
			f.animations.some((a: any) => a.options.pseudoElement === "::backdrop"),
			false,
		);
		assert.equal("readerGrowing" in dialog.dataset, false);
	} finally {
		f.dom.window.close();
	}
});

test("the growing reader backdrop uses the preview dim in the stylesheet", () => {
	const css = readFileSync(path.join(root, "apps/web/styles/preview-media.css"), "utf8");
	assert.match(
		css,
		/:is\(#modal, \.phone-layer\)\.reader\[data-reader-growing\]::backdrop\s*\{\s*background:\s*var\(--dim\);/,
	);
});

const reading = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {flushReadingProgress} from './apps/web/views/app-panels.ts'; export {flushReadingRefresh} from './apps/web/interactions/reading-feedback.ts'; export {Store} from './apps/web/data/store.ts';",
		resolveDir: root,
		loader: "ts",
	},
	bundle: true,
	alias: motionAlias,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ProgressTest",
}).outputFiles[0].text;

function readingFixture() {
	const dom = new JSDOM(
		'<!doctype html><dialog open><div class="preview-sheet"><div class="sheet-scroll"><div id="reader-end"></div></div></div></dialog>',
		{ url: "http://progress.test", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.structuredClone = structuredClone;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	installReactBrowserAPIs(w);
	const timers: (() => void)[] = [];
	w.setTimeout = (fn: () => void) => timers.push(fn);
	w.clearTimeout = () => {};
	w.eval(reading);
	const { AppController, Store, flushReadingProgress, flushReadingRefresh } = w.ProgressTest;
	Store.state = {
		cards: [{ id: "long-read", type: "article", title: "Synthetic text", body: "Text" }],
		items: {},
		preferences: {},
	};
	let saves = 0;
	Store.save = () => {
		saves++;
	};
	const app = Object.create(AppController.prototype);
	app.dialog = w.document.querySelector("dialog");
	let refreshes = 0;
	app.refreshCard = () => refreshes++;
	const scroll = app.dialog.querySelector(".sheet-scroll");
	Object.defineProperty(scroll, "scrollHeight", { get: () => 10600 });
	Object.defineProperty(scroll, "clientHeight", { get: () => 600 });
	return {
		dom,
		app,
		Store,
		scroll,
		flushReadingProgress,
		flushReadingRefresh,
		timers,
		saves: () => saves,
		refreshes: () => refreshes,
	};
}

test("scrolling a long read saves progress once per interval, keeping the furthest point", () => {
	const f = readingFixture();
	try {
		for (const top of [1000, 2000, 3000, 2500, 4000]) {
			f.scroll.scrollTop = top;
			f.app.updateReading("long-read", f.scroll);
		}
		assert.equal(f.saves(), 0, "progress alone must not save the workspace on every scroll event");
		assert.equal(f.timers.length, 1, "one pending write per interval");
		f.timers[0]();
		assert.equal(f.saves(), 1);
		assert.equal(f.Store.item("long-read").progress, 0.4);
		// Scrolling back keeps the stored furthest point and schedules nothing new.
		f.scroll.scrollTop = 1000;
		f.app.updateReading("long-read", f.scroll);
		assert.equal(f.timers.length, 1);
	} finally {
		f.dom.window.close();
	}
});

test("reaching the end saves completion at once and leaving flushes pending progress", () => {
	const f = readingFixture();
	try {
		f.scroll.scrollTop = 5000;
		f.app.updateReading("long-read", f.scroll);
		f.flushReadingProgress();
		assert.equal(f.saves(), 1);
		assert.equal(f.Store.item("long-read").progress, 0.5);
		f.scroll.scrollTop = 10000;
		f.app.updateReading("long-read", f.scroll);
		assert.equal(f.saves(), 2, "completion is written immediately");
		assert.equal(f.Store.item("long-read").read, true);
		assert.equal(f.Store.item("long-read").progress, 1);
	} finally {
		f.dom.window.close();
	}
});

test("phone completion saves immediately and redraws the background only after its exit finishes", async () => {
	const f = readingFixture();
	try {
		const w = f.dom.window as any;
		w.matchMedia = (query: string) => ({ matches: query.includes("max-width") });
		w.CSS = { escape: (value: string) => value };
		const animations: any[] = [];
		w.__motionAnimations = animations;
		f.app.dialog.className = "preview";
		f.app.dialog.close = () => {
			f.app.dialog.open = false;
		};
		f.app.dialog.getAnimations = () => [];
		w.document.body.append(w.document.createElement("button"));
		w.document.body.lastElementChild.id = "account";
		Object.assign(f.app, {
			grid: w.document.createElement("main"),
			modalToken: 1,
			modalKind: "preview",
			currentId: "long-read",
			navKey: "home",
			detailPositions: new Map(),
			updateSelection() {},
		});
		f.scroll.scrollTop = 10000;
		f.app.updateReading("long-read", f.scroll);
		f.app.updateReading("long-read", f.scroll);
		assert.equal(f.Store.item("long-read").read, true);
		assert.equal(f.saves(), 1);
		assert.equal(f.refreshes(), 0, "the feed cannot redraw inside the reading scroll event");
		f.app.closeNative();
		assert.equal(f.refreshes(), 0, "starting the exit must not redraw the feed");
		assert.equal(f.app.dialog.open, true);
		const exit = animations.find((a: any) => a.frames.at(-1)?.transform === "translateY(100%)");
		assert.ok(exit);
		exit.finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(f.app.dialog.open, false);
		assert.equal(f.refreshes(), 0, "the redraw waits until the restored page has settled");
		await new Promise((resolve) => w.setTimeout(resolve, 400));
		assert.equal(f.refreshes(), 1);
		f.flushReadingRefresh(f.app);
		assert.equal(f.refreshes(), 1, "closing a later layer cannot repeat an old refresh");
	} finally {
		f.dom.window.close();
	}
});

test("lifecycle and close paths flush pending reading progress", () => {
	const lifecycle = readFileSync(path.join(root, "apps/web/views/app-lifecycle.ts"), "utf8");
	const surfaces = readFileSync(path.join(root, "apps/web/views/app-surfaces.ts"), "utf8");
	assert.match(lifecycle, /if \(document\.hidden\) \{\s*flushReadingProgress\(\);/);
	assert.match(lifecycle, /"pagehide", \(\) => \{\s*flushReadingProgress\(\);/);
	const close = surfaces.slice(surfaces.indexOf("closeNative(this: AppController"));
	assert.ok(close.indexOf("flushReadingProgress()") < close.indexOf("if (this.skipReturnMotion)"));
});

const media = buildSync({
	stdin: {
		contents: `import {createElement, useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MediaLines} from './apps/web/cards/media-detail.tsx';import {afterDetailMotion} from './apps/web/cards/youtube-player.tsx';
export {afterDetailMotion};
export function mount(host, lines){let set;const seek=()=>{};function Parent(){const [tick,setTick]=useState(0);const [current,setCurrent]=useState(0);set={tick:()=>setTick(tick+1),current:setCurrent};return createElement('div',{'data-tick':tick},createElement(MediaLines,{lines,current,available:true,label:'text',onSeek:seek}));}
const root=createRoot(host);flushSync(()=>root.render(createElement(Parent)));return {tick:()=>flushSync(()=>set.tick()),current:v=>flushSync(()=>set.current(v)),close:()=>flushSync(()=>root.unmount())};}`,
		resolveDir: root,
		loader: "tsx",
	},
	bundle: true,
	alias: motionAlias,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "MediaLinesTest",
}).outputFiles[0].text;

function mediaWindow() {
	const dom = new JSDOM('<!doctype html><div id="root"></div>', {
		url: "https://media.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	installReactBrowserAPIs(w);
	w.eval(media);
	return { dom, w };
}

test("playback ticks do not re-render a long transcript unless the current line changes", () => {
	const { dom, w } = mediaWindow();
	let renders = 0;
	const base = Array.from({ length: 2000 }, (_, i) => ({ start: i * 3, text: `Line ${i}` }));
	// Each render of the list maps the lines once.
	const lines = new Proxy(base, {
		get(target, key, receiver) {
			if (key === "map") renders++;
			return Reflect.get(target, key, receiver);
		},
	});
	const api = w.MediaLinesTest.mount(w.document.querySelector("#root"), lines);
	try {
		assert.equal(renders, 1);
		for (let i = 0; i < 8; i++) api.tick();
		assert.equal(renders, 1, "a position tick alone keeps the rendered lines");
		api.current(5);
		assert.equal(renders, 2);
		assert.equal(w.document.querySelectorAll('[aria-current="true"]').length, 1);
		assert.equal(w.document.querySelectorAll("button")[5].getAttribute("aria-current"), "true");
	} finally {
		api.close();
		dom.window.close();
	}
});

test("the video embed waits for running detail motion, ignores loops and starts at once outside a detail", async () => {
	const { dom, w } = mediaWindow();
	try {
		const { afterDetailMotion } = w.MediaLinesTest;
		const loose = w.document.createElement("div");
		w.document.body.append(loose);
		let settled = false;
		await afterDetailMotion(loose).then(() => {
			settled = true;
		});
		assert.ok(settled, "outside a detail the embed is not delayed");

		const dialog = w.document.createElement("dialog");
		dialog.open = true;
		const host = w.document.createElement("div");
		dialog.append(host);
		w.document.body.append(dialog);
		let finish!: () => void;
		const entry = {
			playState: "running",
			effect: { getComputedTiming: () => ({ endTime: 260 }) },
			finished: new Promise<void>((resolve) => {
				finish = resolve;
			}),
		};
		const loop = {
			playState: "running",
			effect: { getComputedTiming: () => ({ endTime: Infinity }) },
			finished: new Promise<void>(() => {}),
		};
		dialog.getAnimations = () => [entry, loop];
		const frames: (() => void)[] = [];
		w.requestAnimationFrame = (fn: () => void) => frames.push(fn);
		let ready = false;
		const waiting = afterDetailMotion(host, 60_000).then(() => {
			ready = true;
		});
		frames.shift()?.();
		frames.shift()?.();
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(ready, false, "the embed waits for the entry motion");
		finish();
		await waiting;
		assert.equal(ready, true, "an endless loop does not hold the embed back");
	} finally {
		dom.window.close();
	}
});
