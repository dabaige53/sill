/** Refresh gestures preserve input ownership and commit once on release. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("page startup keeps the disabled refresh ring invisible until a pull begins", () => {
	const f = fixture({ kind: "desk" });
	try {
		const style = f.document.createElement("style");
		// Reproduce the generic disabled-button rule overriding the ring class.
		style.textContent = "button:disabled { opacity: 0.4 } .pull-ring { opacity: 0 }";
		f.document.head.append(style);
		const ring = f.document.querySelector("#pull-ring");
		assert.equal(ring.dataset.state, "idle");
		assert.equal(f.w.getComputedStyle(ring).opacity, "0");
		f.flush(f.frames);
		assert.equal(f.w.getComputedStyle(ring).opacity, "0");
		assert.equal(f.app.refreshes, 0);
		const target = f.document.querySelector("main p");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 250);
		f.flush(f.frames);
		assert.equal(ring.dataset.state, "pulling");
		assert.ok(Number(f.w.getComputedStyle(ring).opacity) > 0);
	} finally {
		f.dom.window.close();
	}
});

test("desk pull coalesces moves into one frame and measures only at gesture start", () => {
	const f = fixture({ kind: "desk" });
	try {
		let reads = 0;
		const original = f.w.getComputedStyle;
		f.w.getComputedStyle = (...args: any[]) => {
			reads++;
			return original(...args);
		};
		const target = f.document.querySelector("main p");
		f.fire(target, "touchstart");
		for (let i = 1; i <= 20; i++) f.fire(target, "touchmove", 120, 200 + i * 3);
		assert.equal(reads, 1);
		assert.equal(f.frames.size, 1);
		assert.equal(f.document.querySelector("main").style.translate, "");
		f.flush(f.frames);
		assert.equal(f.document.querySelector("main").style.translate, "0 29px");
		assert.equal(reads, 1, "paint must not read layout after writing translate");
		f.fire(target, "touchcancel");
		assert.equal(f.frames.size, 0);
		assert.equal(f.document.querySelector("main").style.translate, "");
	} finally {
		f.dom.window.close();
	}
});

test("wheel pull claims only a vertical top-edge gesture", () => {
	const f = fixture({ kind: "desk" });
	try {
		const wheel = (deltaY: number, deltaX = 0) => {
			const event = new f.w.WheelEvent("wheel", { deltaY, deltaX, cancelable: true });
			f.w.dispatchEvent(event);
			return event.defaultPrevented;
		};
		assert.equal(wheel(30), false);
		assert.equal(wheel(-30, 50), false);
		assert.equal(wheel(-30), true);
		f.dialog.open = true;
		assert.equal(wheel(-30), false);
	} finally {
		f.dom.window.close();
	}
});

function mousePull(
	f: ReturnType<typeof fixture>,
	type: string,
	y = 200,
	target = f.document.querySelector("main p"),
) {
	const event = new f.w.MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 120,
		clientY: y,
		button: 0,
		buttons: type === "pointerup" ? 0 : 1,
	});
	Object.assign(event, { pointerType: "mouse", pointerId: 7 });
	target.dispatchEvent(event);
}

test("mouse refresh follows the next frame, holds without loading, and commits once on release", async () => {
	const f = fixture({ kind: "desk" });
	try {
		mousePull(f, "pointerdown");
		mousePull(f, "pointermove", 280);
		f.flush(f.frames);
		assert.equal(f.document.querySelector("main").style.translate, "0 39px");
		assert.equal(f.document.querySelector("#pull-ring").hasAttribute("data-ready"), true);
		f.w.dispatchEvent(new f.w.WheelEvent("wheel", { deltaY: -180, buttons: 1, cancelable: true }));
		f.flush();
		assert.equal(f.app.refreshes, 0, "a stationary held mouse must never load");
		mousePull(f, "pointerup", 280);
		assert.equal(f.app.refreshes, 1);
		mousePull(f, "pointerup", 280);
		assert.equal(f.app.refreshes, 1);
		for (let i = 0; i < 8; i++) await Promise.resolve();
	} finally {
		f.dom.window.close();
	}
});

test("mouse refresh cancels short pulls, interruptions, and movement back below threshold", () => {
	for (const interruption of ["short", "reverse", "pointercancel", "blur", "dialog"]) {
		const f = fixture({ kind: "desk" });
		try {
			mousePull(f, "pointerdown");
			mousePull(f, "pointermove", interruption === "short" ? 220 : 280);
			if (interruption === "reverse") mousePull(f, "pointermove", 220);
			if (interruption === "pointercancel") mousePull(f, "pointercancel");
			if (interruption === "blur") f.w.dispatchEvent(new f.w.Event("blur"));
			if (interruption === "dialog") f.dialog.open = true;
			mousePull(f, "pointerup", 280);
			f.flush(f.frames);
			f.flush();
			assert.equal(f.app.refreshes, 0, interruption);
			assert.equal(f.document.querySelector("main").style.translate, "", interruption);
		} finally {
			f.dom.window.close();
		}
	}
});

test("mouse refresh leaves cards, controls and phone input to their existing handlers", () => {
	for (const excluded of ["card", "button", "phone"]) {
		const f = fixture({ kind: "desk", phone: excluded === "phone" });
		try {
			const target = f.document.querySelector("main p");
			if (excluded === "card") target.dataset.card = "article";
			if (excluded === "button") target.setAttribute("role", "button");
			mousePull(f, "pointerdown");
			mousePull(f, "pointermove", 280);
			mousePull(f, "pointerup", 280);
			f.flush(f.frames);
			f.flush();
			assert.equal(f.app.refreshes, 0, excluded);
		} finally {
			f.dom.window.close();
		}
	}
});

test("a slow refresh keeps feedback and its lock until completion, then offers retry on rejection", async () => {
	const f = fixture({ kind: "desk" });
	try {
		let reject: (reason?: any) => void;
		f.app.refresh = () => {
			f.app.refreshes++;
			return new Promise((_resolve, no) => {
				reject = no;
			});
		};
		const target = f.document.querySelector("main p");
		const pull = () => {
			f.fire(target, "touchstart");
			f.fire(target, "touchmove", 120, 360);
			f.fire(target, "touchend", 120, 360);
		};
		const settle = async () => {
			for (let i = 0; i < 8; i++) await Promise.resolve();
		};
		pull();
		await settle();
		f.flush();
		await settle();
		f.flush();
		await settle();
		assert.ok(f.document.querySelector(".is-spinning"));
		assert.equal(
			f.document.querySelector("main").style.translate,
			"",
			"a slow request lets the cards back after the hold",
		);
		pull();
		await settle();
		assert.equal(f.app.refreshes, 1);
		reject!(new Error("synthetic refresh failure"));
		await settle();
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "error");
		assert.equal(f.document.querySelector("#pull-ring").disabled, false);
		assert.equal(f.document.querySelector("main").style.translate, "");
		f.app.refresh = () => {
			f.app.refreshes++;
			return Promise.resolve();
		};
		f.document.querySelector("#pull-ring").click();
		assert.equal(f.document.querySelector("main").style.translate, "", "retry never moves cards");
		await settle();
		assert.equal(f.app.refreshes, 2);
		f.flush();
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "idle");
	} finally {
		f.dom.window.close();
	}
});

test("browser-owned noncancelable touch does not start a second refresh animation", () => {
	const f = fixture({ kind: "desk" });
	try {
		const target = f.document.querySelector("main p");
		f.fire(target, "touchstart");
		const event = new f.w.Event("touchmove", { bubbles: true, cancelable: false });
		Object.assign(event, { touches: [{ clientX: 120, clientY: 360 }] });
		target.dispatchEvent(event);
		f.fire(target, "touchend", 120, 360);
		f.flush(f.frames);
		assert.equal(f.app.refreshes, 0);
		assert.equal(f.document.querySelector("main").style.translate, "");
		assert.equal(f.document.querySelector(".is-pulling"), null);
	} finally {
		f.dom.window.close();
	}
});

test("short pull cancels, light threshold commits once on release, and long travel is bounded", async () => {
	const f = fixture({ kind: "desk" });
	try {
		const target = f.document.querySelector("main p");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 250);
		f.fire(target, "touchend", 120, 250);
		assert.equal(f.app.refreshes, 0);
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "idle");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 274);
		f.flush(f.frames);
		assert.equal(f.document.querySelector("#pull-ring").hasAttribute("data-ready"), true);
		assert.equal(f.app.refreshes, 0, "crossing threshold is not itself a refresh");
		f.fire(target, "touchmove", 120, 900);
		f.flush(f.frames);
		assert.equal(f.document.querySelector("main").style.translate, "0 54px");
		f.fire(target, "touchend", 120, 900);
		assert.equal(f.app.refreshes, 1);
		assert.equal(
			f.document.querySelector("main").style.translate,
			"",
			"released content does not wait for the request",
		);
		assert.equal(f.document.querySelector("#pull-ring").textContent, "");
		assert.equal(
			f.document.querySelector("#pull-ring").dataset.state,
			"loading",
			"fast requests retain visible feedback",
		);
		f.flush(undefined, 300);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "idle");
		assert.equal(
			f.document.querySelector("main").style.translate,
			"",
			"cards return without a fixed success hold",
		);
		f.flush();
		assert.equal(
			f.document.querySelector("main").style.translate,
			"",
			"glides back after the result",
		);
	} finally {
		f.dom.window.close();
	}
});

test("direct refresh leaves cards in place and ignores repeat activation while busy", () => {
	const f = fixture({ kind: "desk" });
	try {
		f.app.refresh = () => {
			f.app.refreshes++;
			return new Promise(() => {});
		};
		f.gestures.refresh();
		assert.equal(f.document.querySelector("main").style.translate, "");
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "loading");
		f.gestures.refresh();
		assert.equal(f.app.refreshes, 1);
	} finally {
		f.dom.window.close();
	}
});

test("wheel threshold starts one real refresh immediately and leaves Sill visible on phone", async () => {
	for (const phone of [false, true]) {
		const f = fixture({ kind: "desk", phone });
		try {
			const heading = f.document.createElement("div");
			heading.className = "home-heading";
			heading.innerHTML = '<span class="home-mark">Sill</span>';
			f.document.body.append(heading);
			let resolve: () => void;
			f.app.refresh = () => {
				f.app.refreshes++;
				return new Promise<void>((done) => (resolve = done));
			};
			const wheel = (deltaY) =>
				f.w.dispatchEvent(new f.w.WheelEvent("wheel", { deltaY, cancelable: true }));
			wheel(-100);
			assert.equal(
				f.app.refreshes,
				1,
				"request begins in the threshold event, without flushing timers",
			);
			assert.equal(f.document.querySelector("#pull-ring").dataset.state, "loading");
			assert.equal(heading.classList.contains("has-refresh"), false);
			for (const d of [-80, -40, -10]) wheel(d);
			assert.equal(f.app.refreshes, 1);
			resolve();
			for (let i = 0; i < 8; i++) await Promise.resolve();
			assert.equal(f.document.querySelector("#pull-ring").dataset.state, "idle");
		} finally {
			f.dom.window.close();
		}
	}
});

test("a new touch takes the ring over from an unfinished success fade", async () => {
	const f = fixture({ kind: "desk", phone: true });
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		await f.gestures.refresh();
		const ring = f.document.querySelector("#pull-ring");
		assert.equal(ring.dataset.state, "success");
		const fading = animations.findLast(
			(animation) => animation.target === ring && animation.frames.at(-1)?.opacity === 0,
		);
		assert.ok(fading);
		const target = f.document.querySelector("main p");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 212);
		f.flush(f.frames);
		const opacity = ring.style.opacity;
		assert.equal(ring.dataset.state, "pulling");
		assert.ok(Number(opacity) > 0 && Number(opacity) < 1);
		fading.finish();
		for (let i = 0; i < 4; i++) await Promise.resolve();
		assert.equal(ring.dataset.state, "pulling");
		assert.equal(ring.style.opacity, opacity, "old exit cannot overwrite new tracking");
		f.fire(target, "touchcancel");
	} finally {
		f.dom.window.close();
	}
});
