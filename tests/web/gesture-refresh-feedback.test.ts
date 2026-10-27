import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("a fast refresh applies its result immediately while loading and the completed check stay readable", async () => {
	const f = fixture({ kind: "desk" });
	try {
		f.w.performance.now = () => 0;
		let applied = false;
		f.app.refresh = () => {
			f.app.refreshes++;
			applied = true;
			return Promise.resolve();
		};
		const done = f.gestures.refresh(),
			ring = f.document.querySelector("#pull-ring");
		assert.equal(f.app.refreshes, 1, "feedback timing never delays the request");
		await done;
		assert.equal(applied, true, "result processing is not delayed by presentation");
		assert.equal(ring.dataset.state, "loading");
		f.flush(undefined, 299);
		assert.equal(ring.dataset.state, "loading");
		f.flush(undefined, 300);
		assert.equal(ring.dataset.state, "success");
		f.flush(undefined, 399);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		assert.equal(
			ring.dataset.state,
			"success",
			"the check enters before the container starts exiting",
		);
		assert.equal(ring.style.opacity, "1");
		assert.equal(
			f.document.querySelector("main").style.translate,
			"",
			"no loading gap is introduced",
		);
		f.flush(undefined, 400);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		assert.equal(ring.dataset.state, "idle");
		assert.equal(ring.style.opacity, "0");
	} finally {
		f.dom.window.close();
	}
});

test("a new pull can interrupt completed-request feedback without an old timer showing success", async () => {
	for (const phase of ["loading", "success"]) {
		const f = fixture({ kind: "desk", phone: true });
		try {
			f.w.performance.now = () => 0;
			await f.gestures.refresh();
			if (phase === "success") f.flush(undefined, 300);
			assert.equal(f.document.querySelector("#pull-ring").dataset.state, phase);
			const target = f.document.querySelector("main p");
			f.fire(target, "touchstart");
			f.fire(target, "touchmove", 120, 240);
			f.flush(f.frames);
			f.flush();
			for (let i = 0; i < 8; i++) await Promise.resolve();
			assert.equal(f.document.querySelector("#pull-ring").dataset.state, "pulling");
			assert.equal(f.app.refreshes, 1, "the unfinished short pull does not submit again");
			f.fire(target, "touchcancel");
		} finally {
			f.dom.window.close();
		}
	}
});
