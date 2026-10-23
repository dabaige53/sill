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
