import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

// @wu-test type=boundary | scope=desktop preview wheel input | protects=prevents custom rebound from intercepting native preview scrolling
test("desktop preview edges leave wheel input to native scrolling without a custom return", () => {
	const f = fixture();
	try {
		const content = f.document.createElement("div");
		content.className = "gesture-content";
		content.append(...f.scroll.childNodes);
		f.scroll.append(content);
		const moves: any[] = [];
		f.MotionEngine.move = (...args: any[]) => moves.push(args);
		f.gestures.bindPullDown();
		f.scroll.scrollTop = 1000;
		for (const deltaY of [100, 80, 40, 15, 5, 1, -100]) {
			const event = new f.w.WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
			f.scroll.dispatchEvent(event);
			assert.equal(event.defaultPrevented, false, "the browser keeps the entire wheel sequence");
		}
		f.flush();
		assert.equal(
			moves.length,
			0,
			"no custom offset or delayed return competes with native scrolling",
		);
		assert.equal(content.style.translate, "");
		assert.equal(f.scroll.style.translate, "");
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=wheel input after closing | protects=prevents old momentum from affecting the next surface without blocking new input | debt=impl-detail
test("a closing operation shields only the old declining tail and immediately yields to new input", () => {
	const f = fixture();
	try {
		const wheel = (deltaY: number) => {
			const event = new f.w.WheelEvent("wheel", { deltaY, cancelable: true });
			f.w.dispatchEvent(event);
			return event.defaultPrevented;
		};
		f.w.GestureTest.shieldWheelTail(100);
		assert.equal(wheel(80), true);
		assert.equal(wheel(40), true);
		assert.equal(wheel(100), false, "renewed effort is not an old tail");
		f.w.GestureTest.shieldWheelTail(100);
		f.w.dispatchEvent(new f.w.Event("pointerdown"));
		assert.equal(wheel(40), false);
		f.w.GestureTest.shieldWheelTail(100);
		f.flush(undefined, 40);
		assert.equal(wheel(40), false, "no fixed multi-second scroll lock remains");
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=phone content rebound | protects=prevents content from remaining displaced after a touch ends | debt=over-mock,impl-detail
test("phone content follows a real touch and releases immediately at touchend", () => {
	const f = fixture({ phone: true });
	try {
		const calls: any[] = [];
		f.MotionEngine.move = (...args: any[]) => {
			calls.push(args);
			args[0].style.translate = args[1];
		};
		f.scroll.scrollTop = 1000;
		f.gestures.bindPreviewResistance(f.dialog.querySelector(".preview-sheet"));
		f.fire(f.scroll, "touchstart", 120, 500);
		f.fire(f.scroll, "touchmove", 120, 200);
		assert.ok(Number.parseFloat(f.scroll.style.translate.split(" ")[1]) < -39);
		f.fire(f.scroll, "touchend", 120, 200);
		assert.equal(calls.at(-1)[1], "");
		assert.equal(calls.at(-1)[3].spring.stiffness, 600);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=content rebound release | protects=prevents a stationary release from pushing content outward again | debt=over-mock,impl-detail
test("holding still at the content edge expires release velocity instead of replaying the last movement", () => {
	const f = fixture();
	try {
		let now = 0;
		Object.defineProperty(f.w.performance, "now", { value: () => now });
		const calls: any[] = [];
		f.MotionEngine.move = (...args: any[]) => {
			calls.push(args);
			args[0].style.translate = args[1];
		};
		const track = f.w.GestureTest.reboundTrack(f.scroll);
		track.begin();
		now = 16;
		track.pull(-300);
		now = 200;
		track.release();
		assert.equal(
			calls.at(-1)[3].velocity.y,
			0,
			"a stationary release must not add another outward push",
		);
		assert.equal(calls.at(-1)[1], "");
	} finally {
		f.dom.window.close();
	}
});
