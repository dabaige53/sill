import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

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
