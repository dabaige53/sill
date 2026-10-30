import assert from "node:assert/strict";
import { test } from "node:test";
import tokens from "../../design-system/tokens.json" with { type: "json" };
import { fixture } from "./app-fixture.ts";

function homeFixture(position = 3200) {
	const f = fixture();
	const { w, app } = f;
	let scroll = position;
	const refreshedAt: number[] = [];
	w.document.body.insertAdjacentHTML("beforeend", `<div id="dock">${app.navHTML()}</div>`);
	w.__motionValueAnimations = [];
	Object.defineProperty(w, "scrollY", { get: () => scroll });
	w.scrollTo = ({ top }: { top: number }) => {
		scroll = top;
	};
	app.dialog.open = false;
	app.navKey = "home";
	app.desktop = () => false;
	app.railHide = { show() {}, syncPosition() {} };
	app.gestures = {
		refresh() {
			refreshedAt.push(scroll);
			return Promise.resolve();
		},
	};
	const tap = (at: number, key = "home", detail = 1) => {
		const button = w.document.querySelector(`#nav [data-extra="${key}"]`);
		const event = new w.MouseEvent("click", { bubbles: true, detail });
		Object.defineProperty(event, "timeStamp", { value: at });
		app.action("nav", "", key, button, event);
	};
	return { ...f, tap, refreshedAt, animations: w.__motionValueAnimations, scroll: () => scroll };
}

test("a home tap animates upward; a second tap adds refresh only after reaching the top", () => {
	const f = homeFixture();
	try {
		f.tap(100);
		assert.equal(f.animations.length, 1);
		assert.equal(f.scroll(), 3200, "the first tap does not teleport to the top");
		const travel = f.animations[0];
		travel.target.set(1600);
		const home = f.w.document.querySelector('#nav [data-extra="home"]');
		home.dispatchEvent(new f.w.Event("touchstart", { bubbles: true }));
		f.tap(280);
		f.tap(340);
		assert.equal(f.animations.length, 1, "later home taps keep the current journey");
		assert.equal(f.scroll(), 1600);
		assert.deepEqual(f.refreshedAt, [], "refresh waits for the scroll to finish");
		travel.finish();
		assert.equal(f.scroll(), 0);
		assert.deepEqual(f.refreshedAt, [0], "a burst of taps refreshes once at the top");
	} finally {
		f.dom.window.close();
	}
});

test("a single tap or two slow taps scroll home without refreshing", () => {
	for (const second of [null, tokens.motion.homeReturn.doubleTapMs + 1]) {
		const f = homeFixture();
		try {
			f.tap(100);
			if (second !== null) f.tap(100 + second);
			f.animations[0].finish();
			assert.equal(f.scroll(), 0);
			assert.deepEqual(f.refreshedAt, []);
		} finally {
			f.dom.window.close();
		}
	}
});

test("double tapping while already at the top refreshes without a fake scrolling animation", () => {
	const f = homeFixture(0);
	try {
		f.tap(100);
		assert.deepEqual(f.refreshedAt, []);
		f.tap(250);
		assert.deepEqual(f.refreshedAt, [0]);
		assert.equal(f.animations.length, 0);
	} finally {
		f.dom.window.close();
	}
});

test("long returns have a bounded duration instead of extending with the feed", () => {
	const f = homeFixture(120000);
	try {
		f.tap(100);
		assert.equal(f.animations[0].options.duration, tokens.motion.homeReturn.maxDurationMs);
		f.animations[0].finish();
		assert.equal(f.scroll(), 0);
	} finally {
		f.dom.window.close();
	}
});

test("touching content interrupts the return at its current position and cancels its refresh", () => {
	const f = homeFixture();
	try {
		f.tap(100);
		f.tap(250);
		const travel = f.animations[0];
		travel.target.set(900);
		f.w.document
			.querySelector("main")
			.dispatchEvent(new f.w.Event("touchstart", { bubbles: true }));
		travel.options.onComplete();
		assert.equal(f.scroll(), 900);
		assert.deepEqual(f.refreshedAt, []);
	} finally {
		f.dom.window.close();
	}
});

test("switching pages cancels an armed home refresh and a late completion cannot change the new page", () => {
	const f = homeFixture();
	try {
		f.tap(100);
		f.tap(250);
		const travel = f.animations[0];
		travel.target.set(1200);
		f.app.goTo = (key: string) => {
			f.app.navKey = key;
			f.app.dialog.open = true;
		};
		f.tap(300, "ai");
		travel.options.onComplete();
		assert.equal(f.app.navKey, "ai");
		assert.equal(f.scroll(), 1200);
		assert.deepEqual(f.refreshedAt, []);
	} finally {
		f.dom.window.close();
	}
});

test("a home double tap can start on another page without discarding the restored feed position", () => {
	const f = homeFixture(1600);
	try {
		f.app.dialog.open = true;
		f.app.navKey = "ai";
		f.app.closeNative = () => {
			f.app.dialog.open = false;
		};
		f.tap(100);
		assert.equal(f.app.navKey, "home");
		assert.equal(f.scroll(), 1600);
		f.tap(250);
		assert.equal(f.animations.length, 1);
		f.animations[0].finish();
		assert.deepEqual(f.refreshedAt, [0]);
	} finally {
		f.dom.window.close();
	}
});
