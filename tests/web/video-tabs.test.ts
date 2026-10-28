import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

test("video underline keeps moving when the resize observer reports its initial size", () => {
	const js = buildSync({
		stdin: {
			contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {VideoTabs} from './apps/web/cards/video-tabs.tsx'; export function mount(host){const root=createRoot(host); return {render:value=>flushSync(()=>root.render(createElement(VideoTabs,{id:'tabs',value,onChange:()=>{}}))),close:()=>flushSync(()=>root.unmount())};}`,
			resolveDir: path.resolve(import.meta.dirname, "../.."),
			loader: "tsx",
		},
		bundle: true,
		alias: { motion: path.resolve(import.meta.dirname, "motion-fixture.ts") },
		write: false,
		format: "iife",
		platform: "browser",
		globalName: "TabTest",
	}).outputFiles[0].text;
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	const observers: any[] = [];
	w.ResizeObserver = class {
		callback: () => void;
		constructor(callback: () => void) {
			this.callback = callback;
			observers.push(this);
		}
		observe() {}
		disconnect() {}
	};
	Object.defineProperty(w.HTMLElement.prototype, "offsetLeft", {
		get() {
			return this.getAttribute("role") === "tab"
				? Array.from(this.parentElement.children).indexOf(this) * 60
				: 0;
		},
	});
	Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", {
		get() {
			return 60;
		},
	});
	w.__motionValueAnimations = [];
	w.eval(js);
	const component = w.TabTest.mount(w.document.querySelector("#root"));
	component.render("transcript");
	observers.at(-1).callback();
	component.render("summary");
	const animations = w.__motionValueAnimations;
	assert.equal(animations.length, 2);
	// A newly registered observer would immediately cancel the in-flight animation.
	if (observers.length > 1) observers.at(-1).callback();
	// The follow control may also resize the tab list during the transition.
	observers.at(-1).callback();
	assert.equal(animations[0].target.get(), 0);
	animations[0].finish();
	animations[1].finish();
	assert.equal(animations[0].target.get(), 120);
	assert.equal(animations[1].target.get(), 180);
	component.close();
	dom.window.close();
});
