import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

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

test("desktop preview resistance tracks the wheel and returns on the short release timing", async () => {
	const f = fixture();
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const sheet = f.dialog.querySelector(".preview-sheet");
		f.gestures.bindPreviewResistance(sheet);
		f.scroll.scrollTop = 1000;
		let styleReads = 0;
		const computed = f.w.getComputedStyle;
		f.w.getComputedStyle = (node: Element, pseudo?: string) => {
			if (node === f.scroll) styleReads++;
			return computed(node, pseudo);
		};
		const wheel = new f.w.WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true });
		f.scroll.dispatchEvent(wheel);
		assert.equal(wheel.defaultPrevented, true);
		const offset = Number.parseFloat(f.scroll.style.translate.split(" ")[1]);
		assert.ok(offset < 0 && offset > -14, "resistance remains within the original small offset");
		assert.equal(sheet.style.translate, "", "the detail frame remains in place");
		assert.equal(styleReads, 0, "direct wheel tracking does not read computed styles");
		f.flush(undefined, 39);
		assert.equal(animations.length, 0);
		f.flush(undefined, 40);
		const release = animations.findLast((animation) => "translate" in animation.frames[0]);
		assert.ok(release);
		assert.equal(release.options.duration, 140);
		release.finish();
		await Promise.resolve();
		assert.equal(f.scroll.style.translate, "");
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});

test("new wheel input interrupts a return at the drawn offset without restarting the old distance", async () => {
	const f = fixture();
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		f.gestures.bindPreviewResistance(f.dialog.querySelector(".preview-sheet"));
		f.scroll.scrollTop = 1000;
		const wheel = (deltaY: number) =>
			f.scroll.dispatchEvent(
				new f.w.WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }),
			);
		wheel(240);
		f.flush(undefined, 40);
		assert.equal(animations.length, 1);
		const first = animations[0];
		const computed = f.w.getComputedStyle;
		f.w.getComputedStyle = (node: Element, pseudo?: string) =>
			node === f.scroll ? { translate: "0 -4px" } : computed(node, pseudo);
		wheel(1);
		const offset = Number.parseFloat(f.scroll.style.translate.split(" ")[1]);
		assert.ok(offset < -4 && offset > -5, "continue from the current -4px frame");
		first.finish();
		await Promise.resolve();
		assert.equal(Number.parseFloat(f.scroll.style.translate.split(" ")[1]), offset);
		f.flush(undefined, 40);
		assert.equal(animations.length, 2);
		// Repeated wheel end notifications cannot create a third return.
		wheel(-1);
		assert.equal(animations.length, 2);
		animations[1].finish();
		await Promise.resolve();
		assert.equal(f.scroll.style.translate, "");
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});
