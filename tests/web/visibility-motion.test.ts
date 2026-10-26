import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { fixture } from "./visibility-motion-fixture.ts";

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
test("desktop header restores and retargets after scrolling without opacity tracks", async () => {
	const f = fixture();
	try {
		f.el.hidden = false;
		f.el.id = "home-top";
		f.el.classList.add("is-tucked");
		f.w.matchMedia = () => ({ matches: true });
		const style = f.w.document.createElement("style");
		style.textContent =
			":root { --dur-open:280ms; --dur-tuck:240ms } #home-top { opacity:1; transform:translateY(0px) } #home-top.is-tucked { transform:translateY(-86px); visibility:hidden }";
		f.w.document.head.append(style);
		f.motion.change(f.el, () => f.el.classList.remove("is-tucked"));
		assert.equal(f.animations.length, 1);
		assert.equal(f.animations[0].frames[0].transform, "translateY(-86px)");
		assert.equal(f.animations[0].options.duration, 280);
		// Reverse before restoration completes; the old completion must not hide the header.
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

test("direct phone FLIP cancels old layout motion without starting reflow or width fades", () => {
	const f = fixture();
	try {
		for (const width of [650, 390]) {
			f.w.innerWidth = width;
			let cancelled = false;
			f.motion.layoutAnimations.set(f.el, { cancel: () => (cancelled = true) });
			f.motion.flip(f.el, { left: 120, top: 40, width: 200 }, { left: 20, top: 10, width: 300 });
			assert.equal(cancelled, true);
			assert.equal(f.motion.layoutAnimations.has(f.el), false);
			assert.equal(f.animations.length, 0);
		}
		f.motion.drop(f.el);
		assert.equal(f.animations.length, 1, "independent arrival motion remains available on phones");
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
