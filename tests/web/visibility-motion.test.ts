import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: "export {MotionEngine} from './apps/web/interactions/motion.ts'",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "MotionTest",
}).outputFiles[0].text;
function fixture(reduced = false) {
	const dom = new JSDOM("<!doctype html><button hidden>Notice</button>", {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: reduced });
	w.eval(bundle);
	const el = w.document.querySelector("button");
	const animations: any[] = [];
	el.animate = (frames: any, options: any) => {
		let resolve: any, reject: any;
		const animation = {
			frames,
			options,
			finished: new Promise((ok, no) => {
				resolve = ok;
				reject = no;
			}),
			cancel() {
				reject(new Error("cancelled"));
			},
			finish() {
				resolve();
			},
		};
		animations.push(animation);
		return animation;
	};
	return { dom, w, el, animations, motion: w.MotionTest.MotionEngine };
}
test("notice fades before hiding and disables clicks from the first frame", async () => {
	const f = fixture();
	try {
		f.motion.visibility(f.el, true);
		assert.equal(f.el.hidden, false);
		assert.equal(f.el.inert, false);
		f.animations[0].finish();
		await Promise.resolve();
		f.motion.visibility(f.el, false);
		assert.equal(f.el.hidden, false);
		assert.equal(f.el.inert, true);
		assert.equal(f.animations[1].frames[1].opacity, 0);
		f.animations[1].finish();
		await Promise.resolve();
		assert.equal(f.el.hidden, true);
	} finally {
		f.dom.window.close();
	}
});
test("fast hide/show cancels stale completion and repeated state does not restart", async () => {
	const f = fixture();
	try {
		f.motion.visibility(f.el, true);
		f.animations[0].finish();
		await Promise.resolve();
		f.motion.visibility(f.el, false);
		f.motion.visibility(f.el, true);
		await Promise.resolve();
		assert.equal(f.el.hidden, false);
		assert.equal(f.el.inert, false);
		f.animations.at(-1).finish();
		await Promise.resolve();
		f.motion.visibility(f.el, true);
		assert.equal(f.animations.length, 3);
		assert.equal(f.el.hidden, false);
	} finally {
		f.dom.window.close();
	}
});
test("reduced motion uses opacity only and missing animation support remains functional", async () => {
	const f = fixture(true);
	try {
		f.motion.visibility(f.el, true);
		assert.ok(f.animations[0].frames.every((frame: any) => !("transform" in frame)));
		f.animations[0].finish();
		await Promise.resolve();
		f.el.animate = undefined;
		f.motion.visibility(f.el, false);
		assert.equal(f.el.hidden, true);
		assert.equal(f.el.inert, true);
	} finally {
		f.dom.window.close();
	}
});

test("layout retargeting animates position without changing width or scaling text", () => {
	const f = fixture();
	try {
		f.motion.flip(f.el, { left: 120, top: 40, width: 200 }, { left: 20, top: 10, width: 300 });
		assert.equal(f.animations.length, 2, "width change fades content and translates its container");
		for (const animation of f.animations) {
			assert.ok(
				animation.frames.every((frame: any) => !("width" in frame) && !("height" in frame)),
			);
			assert.ok(animation.frames.every((frame: any) => !String(frame.transform).includes("scale")));
		}
		assert.match(f.animations.at(-1).frames[0].transform, /translate\(100px,30px\)/);
	} finally {
		f.dom.window.close();
	}
});

test("motion durations accept both milliseconds and Vite-minified seconds", () => {
	const f = fixture();
	try {
		const root = f.w.document.documentElement;
		root.style.setProperty("--base", "220ms");
		assert.equal(f.w.MotionTest.MotionEngine.time("base"), 220);
		root.style.setProperty("--base", ".22s");
		assert.equal(f.w.MotionTest.MotionEngine.time("base"), 220);
		root.style.setProperty("--dur-reduced", ".07s");
		assert.equal(f.w.MotionTest.MotionEngine.reducedDuration, 70);
	} finally {
		f.dom.window.close();
	}
});
