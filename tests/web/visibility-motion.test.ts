import assert from "node:assert/strict";
import fs from "node:fs";
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
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "MotionTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM("<!doctype html><button hidden>Notice</button>", {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false });
	w.eval(bundle);
	const el = w.document.querySelector("button");
	const animations: any[] = [];
	w.__motionAnimations = animations;
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

test("Web styles leave all animation playback to Motion", () => {
	const directory = path.resolve(import.meta.dirname, "../../apps/web/styles");
	for (const name of fs.readdirSync(directory).filter((name) => name.endsWith(".css"))) {
		const css = fs
			.readFileSync(path.join(directory, name), "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "");
		assert.doesNotMatch(
			css,
			/@(?:-webkit-)?keyframes\b|(?:^|[;{])\s*(?:animation|transition)(?:-[\w-]+)?\s*:/m,
			name,
		);
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
test("keyboard state changes remain immediate", async () => {
	const f = fixture();
	try {
		f.motion.visibility(f.el, true);
		f.animations[0].finish();
		await Promise.resolve();
		f.w.document.documentElement.dataset.inputModality = "keyboard";
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
	} finally {
		f.dom.window.close();
	}
});
