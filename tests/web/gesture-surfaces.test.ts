import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("cancelling a phone drag fades its backdrop back from the drawn opacity", () => {
	const f = fixture({ phone: true });
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const target = f.scroll.querySelector("p");
		f.fire(target, "touchstart", 120, 200);
		f.fire(target, "touchmove", 120, 260);
		f.flush(f.frames);
		f.fire(target, "touchcancel", 120, 260);
		const fade = animations.at(-1);
		assert.equal(fade.options.pseudoElement, "::backdrop");
		assert.equal(fade.options.duration, 260);
		assert.ok(Math.abs(fade.frames[0].opacity - 0.93) < 1e-9);
		assert.equal(fade.frames[1].opacity, 1);
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});

test("horizontal content and player buttons do not start reader dismissal", () => {
	const f = fixture({ kind: "reader", phone: true });
	try {
		const pre = f.document.createElement("pre"),
			button = f.document.createElement("button");
		pre.style.overflowX = "auto";
		Object.defineProperties(pre, { scrollWidth: { value: 900 }, clientWidth: { value: 280 } });
		f.scroll.append(pre, button);
		for (const target of [pre, button]) {
			f.fire(target, "touchstart");
			f.fire(target, "touchmove", 500, 200);
			f.fire(target, "touchend", 500, 200);
			f.flush(f.frames);
			f.flush();
			assert.equal(f.app.closed, 0);
			assert.equal(f.dialog.style.translate, "");
			assert.equal(f.dialog.classList.contains("is-drag"), false);
		}
		const text = f.scroll.querySelector("p");
		f.fire(text, "touchstart");
		assert.equal(
			f.dialog.classList.contains("is-drag"),
			false,
			"a tap does not capture the reader",
		);
		for (const x of [140, 160, 180]) f.fire(text, "touchmove", x, 200);
		assert.equal(f.frames.size, 1, "multiple moves paint once");
		f.flush(f.frames);
		assert.equal(f.dialog.style.translate, "60px 0");
		f.fire(text, "touchcancel");
		assert.equal(f.frames.size, 0);
		assert.equal(f.dialog.style.translate, "");
	} finally {
		f.dom.window.close();
	}
});
