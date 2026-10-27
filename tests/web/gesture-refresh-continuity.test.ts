import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("regrabbing preserves the drawn offset while the indicator retains its original heading anchor", () => {
	const f = fixture({ kind: "desk" });
	try {
		f.w.__motionValueAnimations = [];
		const target = f.document.querySelector("main p"),
			main = f.document.querySelector("main"),
			ring = f.document.querySelector("#pull-ring");
		const heading = f.document.createElement("div");
		heading.className = "home-heading";
		heading.getBoundingClientRect = () => ({ top: 18, height: 60, left: 24, width: 320 });
		f.document.body.append(heading);
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 280);
		f.flush(f.frames);
		f.fire(target, "touchcancel");
		const returning = f.w.__motionValueAnimations.find(
			(animation) => animation.destination === 0 && animation.target.get() > 0,
		);
		assert.ok(returning);
		returning.target.set(32);
		assert.equal(main.style.translate, "0 32px");
		assert.equal(
			ring.style.translate,
			"0 0",
			"the indicator stays at its original heading position",
		);
		assert.equal(ring.classList.contains("in-home-heading"), true);
		assert.equal(ring.style.top, "48px");
		assert.equal(ring.style.left, "184px");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 210);
		f.flush(f.frames);
		const caught = main.style.translate;
		const offset = parseFloat(caught.split(" ")[1]);
		assert.ok(
			offset > 32 && offset < 40,
			"a short regrab continues from 32px instead of restarting",
		);
		returning.finish();
		assert.equal(main.style.translate, caught, "old return cannot overwrite the new gesture");
		f.fire(target, "touchcancel");
	} finally {
		f.dom.window.close();
	}
});

test("release preserves velocity and restores content while the real request controls only the indicator", async () => {
	const f = fixture({ kind: "desk", phone: true });
	try {
		f.w.__motionValueAnimations = [];
		let now = 0,
			resolve: () => void;
		f.w.performance.now = () => now;
		f.app.refresh = () => {
			f.app.refreshes++;
			return new Promise<void>((done) => (resolve = done));
		};
		const target = f.document.querySelector("main p"),
			ring = f.document.querySelector("#pull-ring");
		f.fire(target, "touchstart");
		now = 20;
		f.fire(target, "touchmove", 120, 240);
		now = 80;
		f.fire(target, "touchmove", 120, 320);
		f.fire(target, "touchend", 120, 320);
		assert.equal(f.app.refreshes, 1);
		const settling = f.w.__motionValueAnimations.find(
			(animation) => animation.destination === 0 && animation.options.velocity > 0,
		);
		assert.ok(settling, "release hands the sampled px/s velocity to the spring");
		assert.equal(settling.options.visualDuration, 0.35);
		assert.equal(settling.options.bounce, 0);
		assert.equal(
			settling.options.stiffness,
			undefined,
			"the default physical spring must not override it",
		);
		settling.finish();
		assert.equal(f.document.querySelector("main").style.translate, "");
		f.flush();
		assert.equal(ring.dataset.state, "loading", "timers cannot end the real loading state");
		resolve();
		for (let i = 0; i < 8; i++) await Promise.resolve();
		f.flush(undefined, 300);
		f.flush(undefined, 400);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		assert.equal(f.document.querySelector("main").style.translate, "");
		assert.equal(ring.style.opacity, "0", "return frames cannot revive the finished result fade");
	} finally {
		f.dom.window.close();
	}
});
