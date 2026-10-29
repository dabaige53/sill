/** Native scrolling and mouse release in a synthetic DOM; no browser or image requests. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const source = buildSync({
	stdin: {
		contents: `import {createElement as h} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {PhotoCarousel} from './apps/web/cards/photo-carousel.tsx';
export function mount(host, selected) {const root=createRoot(host);let index=0;const render=()=>flushSync(()=>root.render(h(PhotoCarousel,{card:{id:'photo',type:'photo',title:'Photo',images:['coast','mountain','city']},index,onSelect:next=>{selected.push(next);index=next;render()}})));render();return {choose:next=>{index=next;render()},close:()=>flushSync(()=>root.unmount())};}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "CarouselTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://photo.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	let captures = 0;
	w.HTMLElement.prototype.setPointerCapture = () => captures++;
	Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { get: () => 300 });
	const requests: any[] = [];
	w.HTMLElement.prototype.scrollTo = function (options: any) {
		requests.push(options);
		if (options.behavior === "instant") this.scrollLeft = options.left;
	};
	w.eval(source);
	const selected: number[] = [];
	const api = w.CarouselTest.mount(w.document.querySelector("#root"), selected);
	const viewport = w.document.querySelector(".photo-carousel");
	let left = 0;
	Object.defineProperty(viewport, "scrollLeft", {
		get: () => left,
		set: (value) => {
			left = Math.max(0, Math.min(600, value));
		},
	});
	const emit = (type: string, x: number, time: number, pointerType = "mouse") => {
		const event = new w.MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: 100,
			button: 0,
		});
		Object.defineProperties(event, {
			pointerId: { value: 1 },
			timeStamp: { value: time },
			pointerType: { value: pointerType },
		});
		viewport.dispatchEvent(event);
		return event;
	};
	const scroll = (value: number, end = false) => {
		viewport.scrollLeft = value;
		viewport.dispatchEvent(new w.Event("scroll"));
		if (end) viewport.dispatchEvent(new w.Event("scrollend"));
	};
	return { dom, w, api, viewport, selected, requests, emit, scroll, captures: () => captures };
}

test("touch and trackpad scrolling update the same selected photo without a competing JS snap", () => {
	const f = fixture();
	try {
		assert.equal(f.emit("pointerdown", 200, 0, "touch").defaultPrevented, false);
		assert.equal(f.emit("pointermove", 80, 40, "touch").defaultPrevented, false);
		assert.equal(f.captures(), 0);
		f.scroll(300, true);
		assert.deepEqual(f.selected, [1]);
		assert.equal(f.requests.length, 0, "a native scroll does not trigger another smooth scroll");
		assert.equal(f.viewport.querySelectorAll('[aria-hidden="false"]').length, 1);
		f.scroll(600, true);
		assert.deepEqual(f.selected, [1, 2]);
		assert.equal(f.viewport.querySelector("img").draggable, false);
	} finally {
		f.api.close();
		f.dom.window.close();
	}
});

test("mouse dragging carries recent velocity, restores snapping after arrival, and never wraps", () => {
	const f = fixture();
	try {
		f.emit("pointerdown", 200, 100);
		f.emit("pointermove", 170, 160);
		f.emit("pointerup", 170, 170);
		assert.equal(f.requests.at(-1).left, 300, "a short fast flick advances a page");
		assert.equal(f.viewport.style.scrollSnapType, "none");
		f.scroll(300, true);
		assert.deepEqual(f.selected, [1]);
		assert.equal(f.viewport.style.scrollSnapType, "");
		f.emit("pointerdown", 200, 200);
		f.emit("pointermove", 170, 220);
		f.emit("pointerup", 170, 400);
		assert.equal(f.requests.at(-1).left, 300, "stopping before release removes stale velocity");
		f.scroll(300, true);
		f.emit("pointerdown", 200, 400);
		f.emit("pointermove", -800, 450);
		f.emit("pointerup", -800, 460);
		assert.equal(f.requests.at(-1).left, 600, "a fast long drag clamps to the last photo");
		f.scroll(600, true);
		assert.deepEqual(f.selected, [1, 2]);
	} finally {
		f.api.close();
		f.dom.window.close();
	}
});

test("cancel returns to the starting page and external arrows retarget the native scroller", () => {
	const f = fixture();
	try {
		f.emit("pointerdown", 200, 0);
		f.emit("pointermove", 10, 20);
		f.emit("pointercancel", 10, 30);
		assert.equal(f.requests.at(-1).left, 0);
		f.scroll(0, true);
		assert.deepEqual(f.selected, []);
		f.api.choose(2);
		assert.equal(f.requests.at(-1).left, 600);
		assert.equal(f.requests.at(-1).behavior, "smooth");
		f.scroll(300);
		assert.deepEqual(
			f.selected,
			[],
			"crossing an intermediate photo does not reverse an arrow command",
		);
		f.scroll(600, true);
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.api.choose(0);
		assert.equal(f.requests.at(-1).behavior, "instant");
	} finally {
		f.api.close();
		f.dom.window.close();
	}
});
