/** Pointer events in a synthetic DOM; no browser, image requests or real cards. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const source = buildSync({
	stdin: {
		contents: `import {createElement as h} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {PhotoCarousel} from './apps/web/cards/photo-carousel.tsx';
export function mount(host, selected) {const root=createRoot(host);let index=0;const render=()=>flushSync(()=>root.render(h(PhotoCarousel,{card:{id:'photo',type:'photo',title:'Photo',photos:['coast','mountain']},index,onSelect:next=>{selected.push(next);index=next;render()}})));render();return {close:()=>flushSync(()=>root.unmount())};}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "CarouselTest",
	alias: { motion: path.resolve(import.meta.dirname, "motion-fixture.ts") },
}).outputFiles[0].text;

test("horizontal drags snap by page, vertical touch stays native, and the first page never wraps", () => {
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
	w.HTMLElement.prototype.setPointerCapture = () => {};
	Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { get: () => 300 });
	w.eval(source);
	const selected: number[] = [];
	w.__motionAnimations = [];
	w.__recordMotionValues = true;
	const api = w.CarouselTest.mount(w.document.querySelector("#root"), selected);
	try {
		const viewport = w.document.querySelector(".photo-carousel");
		const track = viewport.firstElementChild;
		const emit = (type: string, x: number, y: number, time: number) => {
			const event = new w.MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			});
			Object.defineProperties(event, { pointerId: { value: 1 }, timeStamp: { value: time } });
			viewport.dispatchEvent(event);
		};
		emit("pointerdown", 150, 100, 0);
		emit("pointermove", 130, 160, 150);
		emit("pointerup", 130, 160, 200);
		assert.deepEqual(selected, []);
		emit("pointerdown", 100, 100, 300);
		emit("pointermove", 220, 100, 450);
		emit("pointerup", 220, 100, 500);
		assert.deepEqual(selected, [], "dragging beyond the beginning does not wrap");
		w.document.documentElement.dataset.inputModality = "keyboard";
		emit("pointerdown", 200, 100, 600);
		emit("pointermove", 80, 102, 750);
		assert.match(track.style.transform, /-120px/);
		emit("pointerup", 80, 102, 800);
		assert.deepEqual(selected, [1]);
		assert.equal(viewport.firstElementChild, track, "page changes retain the moving track");
		assert.equal(track.style.transform, "translateX(-300px)");
		const snap = w.__motionAnimations.at(-1);
		assert.equal(snap.options.type, "spring");
		assert.equal(snap.options.velocity, -800, "release carries the latest pointer velocity");
		assert.equal(snap.options.stiffness, 300);
		assert.equal(snap.options.damping, 32);
		assert.equal(snap.options.mass, 1);
		assert.equal(viewport.querySelector("img").draggable, false);
		track.style.transform = "matrix(1, 0, 0, 1, -140, 0)";
		emit("pointerdown", 100, 100, 900);
		emit("pointermove", 150, 100, 1000);
		assert.equal(
			track.style.transform,
			"translateX(-90px)",
			"interruptions continue from the drawn position",
		);
		emit("pointercancel", 150, 100, 1050);
		assert.deepEqual(selected, [1]);
		assert.equal(
			w.__motionAnimations.at(-1).options.velocity,
			0,
			"cancellation settles without carrying momentum",
		);
		emit("pointerdown", 100, 100, 1100);
		emit("pointermove", 110, 100, 1110);
		emit("pointerup", 110, 100, 1350);
		assert.equal(
			w.__motionAnimations.at(-1).options.velocity,
			0,
			"a pause before release drops stale velocity",
		);
		assert.deepEqual(selected, [1]);
		emit("pointerdown", 200, 100, 1400);
		emit("pointermove", 100, 100, 1420);
		emit("pointermove", 140, 100, 1440);
		emit("pointerup", 140, 100, 1450);
		assert.deepEqual(
			selected,
			[1, 0],
			"a fast reversal follows the release direction rather than the total drag",
		);
		assert.equal(w.__motionAnimations.at(-1).options.velocity, 2000);
	} finally {
		api.close();
		dom.window.close();
	}
});
