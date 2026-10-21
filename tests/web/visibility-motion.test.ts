import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {MotionEngine} from './apps/web/interactions/motion.ts'; export {capsulePose, readCardPose} from './apps/web/interactions/card-transition.ts';",
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
test("task press moves only its mark, resumes from the drawn scale, and cancels without a click", () => {
	const f = fixture();
	try {
		f.el.hidden = false;
		f.el.className = "check-item";
		f.el.innerHTML = '<span class="check-dot"></span><span>Task text</span>';
		const mark = f.el.firstElementChild;
		let clicks = 0;
		f.el.addEventListener("click", () => clicks++);
		f.motion.bind();
		const press = () => {
			const event = new f.w.MouseEvent("pointerdown", { bubbles: true, button: 0 });
			Object.defineProperty(event, "isPrimary", { value: true });
			f.el.lastElementChild.dispatchEvent(event);
		};
		press();
		f.animations.at(-1).finish();
		assert.equal(mark.style.transform, "scale(0.97)");
		assert.equal(f.el.style.transform, "");
		assert.equal(f.el.lastElementChild.style.transform, "");
		f.w.document.dispatchEvent(new f.w.Event("pointerup"));
		mark.style.transform = "scale(0.985)";
		press();
		assert.equal(f.animations.at(-1).frames[0].transform, "scale(0.985)");
		f.w.document.dispatchEvent(new f.w.Event("pointercancel"));
		f.animations.at(-1).finish();
		assert.equal(mark.style.transform, "");
		assert.equal(clicks, 0);
		const count = f.animations.length;
		f.el.disabled = true;
		press();
		assert.equal(f.animations.length, count);
		f.el.disabled = false;
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.el.click();
		assert.equal(clicks, 1);
		assert.equal(f.animations.length, count);
	} finally {
		f.dom.window.close();
	}
});
test("sliding glass chrome does not start an opacity animation and restores visibility", async () => {
	const f = fixture();
	try {
		f.el.hidden = false;
		const style = f.w.document.createElement("style");
		style.textContent =
			"button { opacity:1; transform:translateY(0px) } button.tucked { transform:translateY(-76px); visibility:hidden }";
		f.w.document.head.append(style);
		for (const hidden of [true, false]) {
			f.motion.change(f.el, () => f.el.classList.toggle("tucked", hidden));
			const animation = f.animations.at(-1);
			assert.deepEqual(Object.keys(animation.frames[0]), ["transform"]);
			assert.equal(f.el.style.visibility, "visible");
			animation.finish();
			await Promise.resolve();
			assert.equal(f.el.style.visibility, "");
			assert.equal(f.w.getComputedStyle(f.el).visibility, hidden ? "hidden" : "visible");
		}
	} finally {
		f.dom.window.close();
	}
});
test("desktop header enters and retargets as one transform without opacity tracks", async () => {
	const f = fixture();
	try {
		f.el.hidden = false;
		f.el.id = "home-top";
		f.el.classList.add("is-entering");
		f.w.matchMedia = () => ({ matches: true });
		const style = f.w.document.createElement("style");
		style.textContent = ":root { --dur-open:280ms; --dur-tuck:240ms } #home-top { opacity:1; transform:translateY(0px) } #home-top.is-entering, #home-top.is-tucked { transform:translateY(-86px); visibility:hidden }";
		f.w.document.head.append(style);
		f.motion.change(f.el, () => f.el.classList.remove("is-entering"));
		assert.equal(f.animations.length, 1);
		assert.equal(f.animations[0].frames[0].transform, "translateY(-86px)");
		assert.equal(f.animations[0].options.duration, 280);
		// Reverse before entrance completes; the old completion must not hide the header.
		f.motion.change(f.el, () => f.el.classList.add("is-tucked"));
		assert.equal(f.animations.at(-1).options.duration, 240);
		f.motion.change(f.el, () => f.el.classList.remove("is-tucked"));
		for (const animation of f.animations) {
			assert.deepEqual(Object.keys(animation.frames[0]), ["transform"]);
			animation.finish();
		}
		await Promise.resolve();
		assert.equal(f.el.style.visibility, "");
		assert.equal(f.w.getComputedStyle(f.el).visibility, "visible");
	} finally {
		f.dom.window.close();
	}
});
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
		assert.equal(entry.options.stiffness, 274);
		assert.equal(entry.options.damping, 30);
		assert.ok(entry.frames.every((frame: any) => !("width" in frame) && !("height" in frame)));
		f.motion.matchSource(dialog, f.el);
		assert.equal(f.el.style.visibility, "hidden");
		f.motion.returnSource(dialog);
		assert.equal(f.el.style.visibility, "");
		assert.equal(f.animations.at(-1).options.duration, 100);
		assert.equal(f.animations.at(-1).options.delay, 0.22);
		assert.equal(f.animations.at(-1).options.ease, "linear");
		assert.equal(f.animations.at(-1).frames[0].opacity, 0);
		assert.equal(f.animations.at(-1).frames[1].opacity, 1);
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

test("desktop detail tools start with the surface after layout and cancel together", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.open = true;
		dialog.className = "preview";
		dialog.innerHTML =
			'<div class="preview-sheet"><div class="preview-body"></div><div class="sheet-head-tools"></div></div><div class="float-bar"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		const bar = dialog.querySelector(".float-bar");
		let frame: () => void = () => {};
		f.w.requestAnimationFrame = (fn: () => void) => {
			frame = fn;
			return 1;
		};
		f.w.cancelAnimationFrame = () => {};
		f.motion.queuePanel(dialog, { left: 100, top: 80, width: 300, height: 200 });
		assert.equal(bar.style.opacity, "0");
		frame();
		assert.equal(f.animations[0].options.delay, 0);
		const reveals = f.animations.filter((a: any) => !("transform" in a.frames[0]));
		assert.deepEqual(
			reveals.map((a: any) => a.options.delay),
			[0.1, 0, 0],
		);
		assert.ok(
			reveals.every((a: any) => a.frames[0].opacity === 0 && !("transform" in a.frames[0])),
		);
		assert.equal(bar.inert, true);
		f.motion.cancelPanel(dialog);
		assert.ok(!bar.inert);
		assert.equal(bar.style.opacity, "");
	} finally {
		f.dom.window.close();
	}
});

test("capsule follows the card bottom at source, midpoint and destination without scaling icons", () => {
	const f = fixture();
	try {
		const surface = { left: 400, top: 200, width: 600, height: 400 };
		const tool = { left: 550, top: 520, width: 300, height: 60 };
		for (const p of [0, 0.5, 1]) {
			const pose = { x: -450 * (1 - p), y: -220 * (1 - p), sx: 0.5 + 0.5 * p, sy: 0.5 + 0.5 * p };
			for (const nested of [false, true]) {
				const result = f.w.MotionTest.capsulePose(pose, surface, tool, nested);
				const worldScaleX = result.sx * (nested ? pose.sx : 1);
				const worldScaleY = result.sy * (nested ? pose.sy : 1);
				assert.equal(worldScaleX, 1);
				assert.equal(worldScaleY, 1);
				const center = nested ? 400 + pose.y + (150 + result.y) * pose.sy : 550 + result.y;
				const bottom = 400 + pose.y + 200 * pose.sy;
				assert.ok(
					Math.abs(bottom - (center + 30) - 20) < 0.001,
					"keep the 20px bottom gap throughout the flight",
				);
			}
		}
	} finally {
		f.dom.window.close();
	}
});

test("return content changes inside the opaque surface while the real card stays hidden", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.innerHTML = '<div class="preview-sheet"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		const source = f.w.document.createElement("article");
		source.className = "feed-card";
		source.id = "original";
		source.dataset.card = "a";
		source.innerHTML = '<h2 id="title">Original summary</h2>';
		f.w.document.body.append(source);
		source.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 200 });
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		f.motion.matchSource(dialog, source);
		const handoff = f.motion.prepareReturn(dialog, sheet);
		const face = sheet.querySelector("[data-return-face]");
		assert.ok(face);
		assert.equal(face.textContent, "Original summary");
		assert.equal(face.querySelector("[id]"), null);
		assert.equal(face.hasAttribute("data-card"), false);
		assert.equal(face.inert, true);
		assert.equal(face.style.transform, "scale(2,2)");
		assert.equal(source.style.visibility, "hidden");
		assert.equal(f.animations.at(-1).options.delay, 0.08);
		assert.equal(f.animations.at(-1).options.duration, 140);
		f.animations.at(-1).finish();
		assert.equal(face.style.opacity, "1");
		assert.equal(source.style.visibility, "hidden");
		handoff.cancel();
		assert.equal(sheet.querySelector("[data-return-face]"), null);
		f.motion.releaseSource(dialog);
		assert.equal(source.style.visibility, "");
	} finally {
		f.dom.window.close();
	}
});
