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

test("desktop edge uses the reference resistance and balanced spring without holding the momentum tail", () => {
	const f = fixture();
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		f.gestures.bindPreviewResistance(f.dialog.querySelector(".preview-sheet"));
		f.scroll.scrollTop = 1000;
		const wheel = (deltaY: number) => {
			const event = new f.w.WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
			f.scroll.dispatchEvent(event);
			return event;
		};
		assert.equal(wheel(300).defaultPrevented, true);
		const expected = -160 * (1 - Math.exp((-300 * 0.15) / 160));
		assert.equal(f.scroll.style.transform, `translate3d(0,${expected.toFixed(3)}px,0)`);
		assert.equal(animations.length, 0);
		wheel(200);
		assert.equal(animations.length, 1, "deceleration starts the spring before wheel silence");
		const release = animations[0];
		assert.equal(release.frames[0].y, expected);
		assert.equal(release.frames[1].y, 0);
		assert.equal(release.options.type, "spring");
		assert.equal(release.options.stiffness, 300);
		assert.equal(release.options.damping, 34);
		assert.equal(release.options.mass, 0.9);
		assert.equal(release.options.restSpeed, 0.5);
		assert.equal(release.options.restDelta, 0.5);
		for (const delta of [100, 50, 20, 5, 1]) wheel(delta);
		f.flush();
		assert.equal(animations.length, 1, "inertia cannot restart or defer the return");
		release.finish();
		assert.equal(f.scroll.style.transform, "");
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});

test("constant wheel input releases after a short idle and read-end gestures retain ownership", () => {
	for (const end of [false, true]) {
		const f = fixture({ end });
		try {
			const animations: any[] = [];
			f.w.__motionAnimations = animations;
			f.gestures.bindPreviewResistance(f.dialog.querySelector(".preview-sheet"));
			f.scroll.scrollTop = 1000;
			const event = new f.w.WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
			f.scroll.dispatchEvent(event);
			if (end) {
				assert.equal(f.scroll.style.transform, "", "read-end ring has its own feedback");
			} else {
				f.flush(undefined, 31);
				assert.equal(animations.length, 0);
				f.flush(undefined, 32);
				assert.equal(animations.length, 1);
			}
		} finally {
			f.dom.window.close();
		}
	}
});
