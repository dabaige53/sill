/** Synthetic media events only; no browser, audio network or real workspace. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { youtubeID } from "../../apps/web/cards/youtube-player.tsx";

test("YouTube parsing accepts official videos, not lookalike domains or arbitrary pages", () => {
	assert.equal(youtubeID("https://youtu.be/abcdefghijk"), "abcdefghijk");
	assert.equal(youtubeID("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
	assert.equal(youtubeID("https://youtube.com.evil.test/watch?v=abcdefghijk"), null);
	assert.equal(youtubeID("https://www.youtube.com/"), null);
	assert.equal(youtubeID("javascript:alert(1)"), null);
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

test("video preview and full reading retain the actual iframe and one player instance", async () => {
	const js = buildSync({
		stdin: {
			contents: `import {createElement,Fragment} from 'react';import {PanelViews} from './apps/web/interactions/panels-components.tsx';import {renderView,releaseView} from './apps/web/views/react-renderer.ts';import {Store} from './apps/web/data/store.ts';const card={id:'v',type:'media',media:'video',title:'Video',url:'https://youtu.be/abcdefghijk',duration:120,body:'Notes'};Store.state=Store.fresh();Store.state.cards=[card];Store.save=()=>{};export function show(host,full){renderView(host,createElement(Fragment,null,null,full?PanelViews.reader({},card):PanelViews.preview({},card)));}export function close(host){releaseView(host);}`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "VideoTest",
	}).outputFiles[0].text;
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
	});
	const w = dom.window as any;
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
	w.matchMedia = () => ({ matches: false });
	w.eval(js);
	const host = w.document.querySelector("#root");
	try {
		w.VideoTest.show(host, false);
		await new Promise((resolve) => setImmediate(resolve));
		const frame = host.querySelector("iframe");
		assert.ok(frame);
		w.VideoTest.show(host, true);
		assert.equal(host.querySelector("iframe") === frame, true);
		w.VideoTest.show(host, false);
		assert.equal(host.querySelector("iframe") === frame, true);
		assert.equal(created, 1);
		assert.equal(destroyed, 0);
		assert.equal(host.querySelectorAll("iframe").length, 1);
	} finally {
		w.VideoTest.close(host);
		dom.window.close();
	}
	assert.equal(destroyed, 1);
});
