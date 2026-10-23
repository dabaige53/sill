/** Synthetic media events only; no browser, audio network or real workspace. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { youtubeID } from "../../apps/web/cards/youtube-player.tsx";

const bundle = buildSync({
	stdin: {
		contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {AudioPlayer} from './apps/web/cards/audio-player.tsx'; export function mount(host,saved){ const controls={current:null}; const root=createRoot(host);flushSync(()=>root.render(createElement(AudioPlayer,{url:'https://media.test/audio.mp3',initialPosition:12,onSave:(...v)=>saved.push(v),onTime:()=>{},controls})));return {controls,close:()=>flushSync(()=>root.unmount())};}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "PlaybackTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
	});
	const w = dom.window as any;
	let pauses = 0;
	w.HTMLMediaElement.prototype.pause = function () {
		pauses++;
	};
	w.eval(bundle);
	const saved: any[] = [];
	const api = w.PlaybackTest.mount(w.document.querySelector("#root"), saved);
	const media = w.document.querySelector("audio");
	let paused = true;
	Object.defineProperties(media, {
		duration: { value: 100 },
		paused: { get: () => paused },
		seeking: { value: false },
	});
	return {
		w,
		media,
		saved,
		api,
		pauses: () => pauses,
		play: () => {
			paused = false;
		},
		emit: (event: string) => media.dispatchEvent(new w.Event(event)),
		close: () => dom.window.close(),
	};
}
test("closing before media loads keeps the saved position", () => {
	const f = fixture();
	f.api.close();
	assert.deepEqual(f.saved, []);
	assert.equal(f.pauses(), 1);
	f.close();
});
test("resume, seek-to-end and close never mark read", () => {
	const f = fixture();
	f.emit("loadedmetadata");
	assert.equal(f.media.currentTime, 12);
	f.api.controls.current.seek(100);
	f.emit("seeking");
	f.emit("ended");
	assert.equal(f.saved.at(-1)[1], false);
	f.api.close();
	assert.equal(f.saved.at(-1)[0], 100);
	assert.equal(f.saved.at(-1)[1], false);
	f.close();
});
test("only actual advancement followed by ended completes playback", () => {
	const f = fixture();
	f.emit("loadedmetadata");
	f.play();
	f.media.currentTime = 13;
	f.emit("timeupdate");
	f.media.currentTime = 100;
	f.emit("ended");
	assert.equal(f.saved.at(-1)[1], true);
	f.api.close();
	f.close();
});
test("YouTube parsing accepts official videos, not lookalike domains or arbitrary pages", () => {
	assert.equal(youtubeID("https://youtu.be/abcdefghijk"), "abcdefghijk");
	assert.equal(youtubeID("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
	assert.equal(youtubeID("https://youtube.com.evil.test/watch?v=abcdefghijk"), null);
	assert.equal(youtubeID("https://www.youtube.com/"), null);
	assert.equal(youtubeID("javascript:alert(1)"), null);
});

test("podcast scroll scrubs all surfaces together and reverses without remounting audio", async () => {
	const js = buildSync({
		stdin: {
			contents: `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MediaDetail} from './apps/web/cards/media-detail.tsx';import {Store} from './apps/web/data/store.ts';export function mount(host){Store.state=Store.fresh();const root=createRoot(host);flushSync(()=>root.render(createElement(MediaDetail,{card:{id:'podcast-motion',type:'media',media:'podcast',title:'Podcast',sources:[],tags:[],transcript:[]}})));return {scroll:el=>flushSync(()=>el.dispatchEvent(new Event('scroll'))),frame:callback=>flushSync(callback),close:()=>flushSync(()=>root.unmount())};}`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		alias: {
			"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
			motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		},
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "PodcastTest",
	}).outputFiles[0].text;
	const dom = new JSDOM('<div class="sheet-scroll"><div id="root"></div></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	let frame: FrameRequestCallback;
	w.requestAnimationFrame = (callback: FrameRequestCallback) => {
		frame = callback;
		return 1;
	};
	w.cancelAnimationFrame = () => {};
	w.eval(js);
	const animations: any[] = [];
	w.__motionAnimations = animations;
	const api = w.PodcastTest.mount(w.document.querySelector("#root"));
	try {
		const scroll = w.document.querySelector(".sheet-scroll");
		const primary = w.document.querySelector(".media-primary");
		const compact = w.document.querySelector(".compact-player");
		const audio = w.document.querySelector("audio");
		assert.equal(w.document.querySelector('[role="alert"]'), null);
		assert.equal(animations.length, 4, "one paused timeline for each player and background");
		Object.defineProperty(compact, "offsetHeight", { value: 68 });
		compact.parentElement.style.top = "64px";
		let bottom = 166;
		primary.getBoundingClientRect = () => ({ bottom });
		const scrollTo = async (value: number) => {
			scroll.scrollTop = value;
			api.scroll(scroll);
			api.frame(() => frame(0));
		};
		await scrollTo(400);
		assert.equal(primary.hasAttribute("inert"), true);
		assert.equal(compact.hasAttribute("inert"), false);
		for (const animation of animations) {
			assert.equal(animation.options.autoplay, false);
			assert.equal(animation.time, 0.5);
		}
		bottom = 183;
		await scrollTo(383);
		for (const animation of animations) assert.equal(animation.time, 0.25);
		assert.equal(compact.hasAttribute("inert"), true);
		bottom = 132;
		await scrollTo(434);
		for (const animation of animations) assert.equal(animation.time, 1);
		await scrollTo(0);
		for (const animation of animations) assert.equal(animation.time, 0);
		assert.equal(animations.length, 4, "scroll reuses the timelines instead of restarting them");
		assert.equal(compact.hasAttribute("inert"), true);
		assert.equal(w.document.querySelector("audio"), audio);
	} finally {
		api.close();
		dom.window.close();
	}
});

test("official iframe sets its own origin-only referrer policy before loading", async () => {
	const js = buildSync({
		stdin: {
			contents: `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {YouTubePlayer} from './apps/web/cards/youtube-player.tsx';export function mount(host){const root=createRoot(host);flushSync(()=>root.render(createElement(YouTubePlayer,{id:'abcdefghijk',initialPosition:12,onSave:()=>{},onTime:()=>{},controls:{current:null}})));return ()=>flushSync(()=>root.unmount());}`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "YTTest",
	}).outputFiles[0].text;
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
	});
	const w = dom.window as any;
	w.YT = {
		Player: class {
			constructor(element: HTMLIFrameElement) {
				assert.equal(element.referrerPolicy, "strict-origin-when-cross-origin");
				assert.equal(element.tagName, "IFRAME");
			}
			destroy() {}
		},
	};
	w.eval(js);
	const close = w.YTTest.mount(w.document.querySelector("#root"));
	await new Promise((resolve) => setImmediate(resolve));
	const iframe = w.document.querySelector("iframe");
	assert.ok(iframe);
	const url = new URL(iframe.src);
	assert.equal(url.hostname, "www.youtube-nocookie.com");
	assert.equal(url.searchParams.get("origin"), "https://sill.test");
	assert.equal(url.searchParams.get("start"), "12");
	close();
	dom.window.close();
});

test("audio failure before metadata preserves resume position and can reload", async () => {
	const f = fixture();
	let loads = 0;
	let error: object | null = {};
	Object.defineProperty(f.media, "error", { get: () => error });
	f.media.load = () => {
		loads++;
		error = null;
	};
	f.media.play = async () => {};
	f.emit("error");
	f.api.controls.current.toggle();
	assert.equal(loads, 1);
	f.emit("loadedmetadata");
	assert.equal(f.media.currentTime, 12);
	f.api.close();
	assert.deepEqual(Array.from(f.saved.at(-1)), [12, false]);
	f.close();
});

test("blocked YouTube API times out, releases its script and retries", async () => {
	const js = buildSync({
		stdin: {
			contents: `export {loadAPI} from './apps/web/cards/youtube-player.tsx';`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "YTTest",
	}).outputFiles[0].text;
	const dom = new JSDOM("", { url: "https://sill.test", runScripts: "outside-only" });
	const w = dom.window as any;
	let timeout: () => void;
	w.setTimeout = (fn: () => void) => {
		timeout = fn;
		return 1;
	};
	w.clearTimeout = () => {};
	w.eval(js);
	const first = w.YTTest.loadAPI();
	const rejection = assert.rejects(first, /player unavailable/);
	timeout!();
	await rejection;
	assert.equal(w.document.querySelectorAll("script").length, 0);
	const second = w.YTTest.loadAPI();
	assert.notEqual(first, second);
	assert.equal(w.document.querySelectorAll("script").length, 1);
	w.YT = { Player: class {} };
	w.onYouTubeIframeAPIReady();
	assert.equal(await second, w.YT);
	dom.window.close();
});

test("YouTube readiness timeout exposes retry and rebuilding preserves resume", async () => {
	const js = buildSync({
		stdin: {
			contents: `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {YouTubePlayer} from './apps/web/cards/youtube-player.tsx';export function mount(host,states){const root=createRoot(host);flushSync(()=>root.render(createElement(YouTubePlayer,{id:'abcdefghijk',initialPosition:12,onSave:()=>{},onTime:s=>states.push(s),controls:{current:null}})));return {flush:fn=>flushSync(fn),close:()=>flushSync(()=>root.unmount())};}`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "YTTest",
	}).outputFiles[0].text;
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
	});
	const w = dom.window as any;
	let timeout: () => void;
	w.setTimeout = (fn: () => void, delay: number) => {
		if (delay === 20000) timeout = fn;
		return 1;
	};
	w.clearTimeout = () => {};
	let created = 0;
	w.YT = {
		Player: class {
			constructor() {
				created++;
			}
			pauseVideo() {}
			destroy() {}
		},
	};
	w.eval(js);
	const states: any[] = [];
	const api = w.YTTest.mount(w.document.querySelector("#root"), states);
	await new Promise((resolve) => setImmediate(resolve));
	api.flush(() => timeout!());
	assert.ok(w.document.querySelector('[role="alert"]'));
	assert.equal(states.at(-1).playing, false);
	assert.equal(states.at(-1).position, 12);
	api.flush(() => w.document.querySelector(".media-failure button").click());
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(created, 2);
	assert.equal(new URL(w.document.querySelector("iframe").src).searchParams.get("start"), "12");
	api.close();
	dom.window.close();
});
