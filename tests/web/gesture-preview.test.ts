import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

// @wu-test type=behavior | scope=phone preview scrolling | protects=prevents scrolling from losing position or closing the preview during expansion
test("reading expands during finger scrolling, preserving the scroll offset", () => {
	const f = fixture({ phone: true });
	try {
		f.gestures.bindPullDown();
		const sheet = f.dialog.querySelector(".preview-sheet");
		f.scroll.scrollTop = 10;
		f.fire(f.scroll, "touchstart");
		f.fire(f.scroll, "touchend");
		f.flush();
		assert.equal(sheet.classList.contains("is-full"), false, "a tap cannot undo a collapsed sheet");
		f.fire(f.scroll, "touchstart");
		f.scroll.scrollTop = 80;
		f.scroll.dispatchEvent(new f.w.Event("scroll"));
		f.scroll.dispatchEvent(new f.w.Event("scrollend"));
		f.flush();
		assert.equal(
			sheet.classList.contains("is-full"),
			true,
			"scrolling starts expansion before finger release",
		);
		f.fire(f.scroll, "touchend");
		assert.equal(sheet.classList.contains("is-full"), true);
		assert.equal(f.scroll.scrollTop, 80);
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=boundary | scope=phone preview gesture interruption | protects=prevents interrupted or stale touches from expanding a later or closing preview
test("cancelled, multi-touch, stale and closing previews cannot expand later", () => {
	for (const interruption of ["cancel", "multi", "replacement", "closing"]) {
		const f = fixture({ phone: true });
		try {
			f.gestures.bindPullDown();
			const sheet = f.dialog.querySelector(".preview-sheet");
			f.scroll.scrollTop = 10;
			f.fire(f.scroll, "touchstart");
			f.scroll.scrollTop = 80;
			if (interruption === "cancel") f.fire(f.scroll, "touchcancel");
			if (interruption === "multi") {
				const event = new f.w.Event("touchstart", { bubbles: true });
				Object.assign(event, {
					touches: [
						{ clientX: 100, clientY: 200 },
						{ clientX: 200, clientY: 200 },
					],
				});
				f.scroll.dispatchEvent(event);
			}
			if (interruption === "replacement") f.app.modalToken++;
			if (interruption === "closing") f.app.sheetLeaving = true;
			f.scroll.dispatchEvent(new f.w.Event("scroll"));
			f.fire(f.scroll, "touchend");
			f.scroll.dispatchEvent(new f.w.Event("scrollend"));
			f.flush();
			assert.equal(sheet.classList.contains("is-full"), false, interruption);
			assert.equal(f.app.closed, 0);
		} finally {
			f.dom.window.close();
		}
	}
});

// @wu-test type=behavior | scope=phone preview scroll delivery | protects=prevents a delayed scroll event from leaving the preview collapsed or losing position
test("a scroll event delivered after finger release expands without waiting for inertia", () => {
	const f = fixture({ phone: true });
	try {
		f.gestures.bindPullDown();
		f.fire(f.scroll, "touchstart");
		f.fire(f.scroll, "touchend");
		f.scroll.scrollTop = 80;
		f.scroll.dispatchEvent(new f.w.Event("scroll"));
		assert.equal(f.dialog.querySelector(".preview-sheet").classList.contains("is-full"), true);
		assert.equal(f.scroll.scrollTop, 80);
	} finally {
		f.dom.window.close();
	}
});
