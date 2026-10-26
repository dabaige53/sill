import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("the reference curve moves inner content and preserves the measured release velocity", () => {
	const f = fixture();
	try {
		const content = f.document.createElement("div");
		content.className = "gesture-content";
		content.append(...f.scroll.childNodes);
		f.scroll.append(content);
		let now = 0;
		Object.defineProperty(f.w.performance, "now", { value: () => now });
		const calls: any[] = [];
		f.MotionEngine.move = (...args: any[]) => {
			calls.push(args);
			args[0].style.translate = args[1];
		};
		const track = f.w.GestureTest.reboundTrack(content);
		track.begin();
		now = 16;
		track.pull(-300, true);
		const expected = -160 * (1 - Math.exp((-300 * 0.15) / 160));
		assert.equal(Number.parseFloat(content.style.translate.split(" ")[1]), expected);
		assert.equal(f.scroll.style.translate, "", "the viewport never moves");
		track.release();
		const [element, destination, direct, options] = calls.at(-1);
		assert.equal(element, content);
		assert.equal(destination, "");
		assert.equal(direct, false);
		assert.deepEqual(JSON.parse(JSON.stringify(options.spring)), {
			stiffness: 300,
			damping: 34,
			mass: 0.9,
			restSpeed: 0.5,
			restDelta: 0.5,
		});
		assert.equal(options.velocity.y, -750, "fast release keeps velocity with the reference cap");
	} finally {
		f.dom.window.close();
	}
});

test("one return starts on wheel deceleration and old tail events cannot pull it again", () => {
	const f = fixture();
	try {
		const content = f.document.createElement("div");
		content.className = "gesture-content";
		content.append(...f.scroll.childNodes);
		f.scroll.append(content);
		const returns: any[] = [];
		f.MotionEngine.move = (
			node: HTMLElement,
			destination: string,
			direct: boolean,
			options: any,
		) => {
			if (!direct) returns.push(options);
			node.style.translate = destination;
		};
		f.gestures.bindPreviewResistance(f.dialog.querySelector(".preview-sheet"));
		f.scroll.scrollTop = 1000;
		const wheel = (deltaY: number) =>
			f.scroll.dispatchEvent(
				new f.w.WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }),
			);
		wheel(100);
		wheel(80);
		assert.equal(returns.length, 1, "deceleration releases without waiting for an idle timer");
		f.flush(undefined, 40);
		for (const d of [40, 15, 5, 1]) wheel(d);
		f.flush();
		assert.equal(returns.length, 1);
		assert.equal(content.style.translate, "");
		assert.equal(f.scroll.style.translate, "");
	} finally {
		f.dom.window.close();
	}
});

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
		assert.equal(calls.at(-1)[3].spring.stiffness, 300);
	} finally {
		f.dom.window.close();
	}
});
