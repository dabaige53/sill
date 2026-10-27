import assert from "node:assert/strict";
import { test } from "node:test";
import {
	refreshBand,
	refreshConfig,
	refreshUnband,
	refreshWheel,
} from "../../apps/web/interactions/refresh-input.ts";

test("refresh readiness measures visible travel and the curve has no resistance seam", () => {
	const distance = refreshUnband(refreshConfig.threshold);
	assert.ok(distance > 105 && distance < 106);
	assert.equal(refreshBand(distance), 64);
	const before = refreshBand(80) - refreshBand(79),
		after = refreshBand(81) - refreshBand(80);
	assert.ok(Math.abs(before - after) < 0.01, "resistance must not jump at the old 80px seam");
	assert.ok(refreshBand(700) > refreshBand(200));
	assert.ok(refreshBand(2000) < refreshConfig.rubberDimension);
	const caught = 37;
	assert.equal(refreshBand(refreshUnband(caught)), caught, "regrab starts at the drawn position");
});

test("one wheel event only establishes intent and accepted distance is independent of event caps", () => {
	const single = refreshWheel();
	assert.deepEqual(single.feed(240, true), { phase: "start", distance: 0 });
	for (const batches of [
		[30, 30, 30, 30],
		[60, 60],
	]) {
		const wheel = refreshWheel();
		wheel.feed(20, true);
		let distance = 0;
		for (const delta of batches) distance = wheel.feed(delta, true).distance;
		assert.equal(distance, 120, "no per-event truncation changes total travel");
	}
});

test("a single smaller wheel event cannot release, renewed effort resets decay, and tail cannot rearm", () => {
	const wheel = refreshWheel();
	wheel.feed(100, true);
	assert.equal(wheel.feed(80, true).phase, "pull");
	assert.equal(wheel.feed(110, true).phase, "pull", "renewed effort takes ownership");
	assert.equal(wheel.feed(90, true).phase, "pull");
	assert.equal(wheel.feed(70, true).phase, "pull");
	assert.equal(wheel.feed(50, true).phase, "release");
	assert.equal(wheel.feed(30, true).phase, "ignore");
	assert.equal(wheel.feed(10, true).phase, "ignore");
});

test("ordinary scrolling coasting into the top cannot start refresh", () => {
	const wheel = refreshWheel();
	wheel.feed(100, false);
	assert.equal(wheel.feed(80, true).phase, "ignore");
	assert.equal(wheel.feed(60, true).phase, "ignore");
	assert.equal(wheel.feed(120, true).phase, "start", "a new deliberate pull can start");
});
