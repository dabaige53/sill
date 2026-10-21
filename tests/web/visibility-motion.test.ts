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

test("menu reversal keeps the latest state and keyboard closing is immediate", async () => {
	const f = fixture();
	try {
		f.motion.popover(f.el, true);
		assert.equal(f.el.hidden, false);
		f.motion.popover(f.el, false);
		assert.equal(f.el.inert, true);
		f.motion.popover(f.el, true);
		f.animations[1].finish();
		await Promise.resolve();
		assert.equal(f.el.hidden, false);
		f.animations[2].finish();
		await Promise.resolve();
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.motion.popover(f.el, false);
		assert.equal(f.el.hidden, true);
	} finally {
		f.dom.window.close();
	}
});

test("pseudo-element animation neither cancels nor writes the host transform", async () => {
	const f = fixture();
	try {
		f.motion.animate(f.el, [{ transform: "scale(1)" }, { transform: "scale(.97)" }], {
			fill: "forwards",
		});
		f.motion.animate(f.el, [{ transform: "none" }, { transform: "translateX(20px)" }], {
			pseudoElement: "::before",
		});
		f.animations[1].finish();
		await Promise.resolve();
		assert.equal(f.el.style.transform, "");
		f.animations[0].finish();
		await Promise.resolve();
		assert.equal(f.el.style.transform, "scale(.97)");
	} finally {
		f.dom.window.close();
	}
});

test("search expansion scales only its background and translates text at fixed size", () => {
	const f = fixture();
	try {
		f.el.innerHTML = '<span class="icon"></span><input id="home-search">';
		f.el.getBoundingClientRect = () => ({ width: 480 });
		const computed = f.w.getComputedStyle.bind(f.w);
		f.w.getComputedStyle = (el: Element, pseudo?: string) =>
			pseudo ? { transform: "none" } : computed(el);
		f.motion.searchResize(f.el, 280);
		assert.equal(f.animations.length, 3);
		assert.equal(f.animations[0].options.pseudoElement, "::before");
		assert.match(f.animations[0].frames[0].transform, /scaleX\(0\.583/);
		for (const animation of f.animations.slice(1)) {
			assert.equal(animation.frames[0].transform, "translateX(200px)");
			assert.ok(
				animation.frames.every(
					(frame: any) => !("width" in frame) && !String(frame.transform).includes("scale"),
				),
			);
		}
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.motion.searchResize(f.el, 480);
		assert.equal(f.animations.length, 3);
	} finally {
		f.dom.window.close();
	}
});

test("queued card entry waits for layout and canceled entry never revives", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.open = true;
		dialog.innerHTML = '<div class="preview-sheet"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		const frames = new Map<number, () => void>();
		let id = 0;
		f.w.requestAnimationFrame = (fn: () => void) => {
			frames.set(++id, fn);
			return id;
		};
		f.w.cancelAnimationFrame = (key: number) => frames.delete(key);
		f.motion.queuePanel(dialog);
		assert.equal(sheet.style.opacity, "0");
		assert.equal(f.animations.length, 0);
		f.motion.cancelPanel(dialog);
		assert.equal(sheet.style.opacity, "");
		assert.equal(frames.size, 0);
		f.motion.queuePanel(dialog);
		for (const fn of frames.values()) fn();
		assert.equal(sheet.style.opacity, "");
		assert.equal(f.animations.at(-1).options.duration, f.motion.time("dur-open"));
		assert.equal(f.animations.at(-1).frames[0].transform, "translateY(10px)");
	} finally {
		f.dom.window.close();
	}
});

test("desktop card entry matches its source rect and phone entry keeps its sheet motion", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "preview";
		dialog.innerHTML = '<div class="preview-sheet"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		const source = { left: 100, top: 80, width: 300, height: 200 };
		f.motion.openPanel(dialog, source);
		const entry = f.animations.at(-1);
		assert.equal(entry.frames[0].transform, "translate(-450px,-220px) scale(0.5,0.5)");
		assert.equal(entry.options.stiffness, 190);
		assert.equal(entry.options.damping, 25);
		assert.ok(entry.frames.every((frame: any) => !("width" in frame) && !("height" in frame)));
		f.motion.matchSource(dialog, f.el);
		assert.equal(f.el.style.visibility, "hidden");
		f.motion.releaseSource(dialog);
		assert.equal(f.el.style.visibility, "");
		f.w.matchMedia = () => ({ matches: true });
		f.motion.openPanel(dialog, source);
		assert.equal(f.animations.at(-1).frames[0].transform, "translateY(100%)");
		f.motion.matchSource(dialog, f.el);
		assert.equal(f.el.style.visibility, "");
	} finally {
		f.dom.window.close();
	}
});
