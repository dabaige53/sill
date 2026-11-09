import assert from "node:assert/strict";
import { test } from "node:test";
import { wheelIntent, wheelPixels } from "../../apps/web/interactions/gesture-input.ts";

// @wu-test type=behavior | scope=wheel refresh intent | protects=prevents scroll momentum from triggering refresh while allowing renewed input
test("coasting into an edge cannot arm a refresh, but renewed effort can", () => {
	let time = 0;
	const input = wheelIntent(() => time);
	assert.equal(input.feed(100, false), false);
	time = 16;
	assert.equal(input.feed(80, true), false);
	time = 32;
	assert.equal(input.feed(50, true), false);
	time = 48;
	assert.equal(input.feed(100, true), true);
	input.reset();
	time = 64;
	assert.equal(input.feed(60), false);
	time = 145;
	assert.equal(input.feed(60), true, "a new deliberate sequence need not grow four times");
});

// @wu-test type=behavior | scope=wheel gesture direction | protects=prevents a decaying wheel tail from continuing a pull | debt=impl-detail
test("a declining tail stops increasing a pull and a reversal starts a new sequence", () => {
	const input = wheelIntent(() => 0);
	assert.equal(input.feed(30), true);
	assert.equal(input.feed(40), true);
	assert.equal(input.feed(20), false);
	assert.equal(input.feed(10), false);
	assert.equal(input.feed(-10), true);
});

// @wu-test type=boundary | scope=wheel input units | protects=prevents line and page wheel events from producing incorrect gesture distances
test("wheel pixels honor pixel, line and viewport units", () => {
	assert.equal(wheelPixels({ deltaY: 2, deltaMode: 0 }, 600), 2);
	assert.equal(wheelPixels({ deltaY: 2, deltaMode: 1 }, 600), 32);
	assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }, 600), 600);
});
