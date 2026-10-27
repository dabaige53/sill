/** Interrupted gestures never commit actions or change a later panel's state. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./gesture-fixture.ts";

test("touchcancel resets desk pull, sheet drag, reader swipes, toast and read-end push without actions", () => {
	const scenarios = [
		{ kind: "desk", selector: "main p", x: 120, y: 280 },
		{ kind: "preview", selector: ".sheet-scroll p", x: 120, y: 280 },
		{ kind: "reader", selector: ".reader-scroll p", x: 200, y: 200 },
		{ kind: "reader", selector: ".reader-scroll p", x: 120, y: 280 },
		{ kind: "desk", selector: "#toast", x: 120, y: 250 },
		{ kind: "preview", selector: ".sheet-scroll p", x: 120, y: 120, end: true },
	];
	for (const scenario of scenarios) {
		const f = fixture(scenario);
		try {
			const before = f.w.localStorage.getItem("sill-v1"),
				target = f.document.querySelector(scenario.selector);
			f.fire(target, "touchstart");
			f.fire(target, "touchmove", scenario.x, scenario.y);
			f.fire(target, "touchcancel", scenario.x, scenario.y);
			f.fire(target, "touchend", scenario.x, scenario.y);
			f.flush();
			assert.equal(f.app.refreshes, 0, `${scenario.selector}: canceled gesture refreshed`);
			assert.equal(f.app.closed, 0, `${scenario.kind}: canceled gesture closed a panel`);
			assert.equal(f.w.localStorage.getItem("sill-v1"), before);
			assert.equal(f.document.querySelector(".is-drag, .is-pulling"), null);
			assert.equal(f.dialog.style.getPropertyValue("--backdrop"), "");
			for (const node of f.document.querySelectorAll(
				"main, .preview-sheet, .sheet-scroll, #modal, #toast, .float-bar",
			)) {
				assert.equal(node.style.translate, "", `${node.className}: leftover gesture offset`);
			}
			assert.equal(f.document.getElementById("toast").hidden, false);
			assert.equal(f.document.getElementById("toast").style.opacity, "");
			assert.equal(f.dialog.querySelector(".float-bar").style.opacity, "");
			if (scenario.end) assert.equal(f.dialog.querySelector(".push-ring").style.opacity, "0");
		} finally {
			f.dom.window.close();
		}
	}
});

test("a preview pulled down from its top closes once on release, even full screen", async () => {
	for (const full of [false, true]) {
		const f = fixture({ phone: true });
		try {
			const sheet = f.dialog.querySelector(".preview-sheet"),
				target = f.scroll.querySelector("p");
			sheet.classList.toggle("is-full", full);
			f.fire(target, "touchstart", 120, 200);
			f.fire(target, "touchmove", 120, 300);
			f.fire(target, "touchmove", 120, 450);
			assert.equal(f.frames.size, 1, "moves share one frame");
			f.flush(f.frames);
			assert.equal(sheet.style.translate, "0 250px", "the sheet follows the finger");
			assert.equal(f.app.closed, 0, "pulling past the line is not itself a close");
			f.fire(target, "touchend", 120, 450);
			f.flush();
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(f.app.closed, 1, `full=${full}: one pull closes`);
		} finally {
			f.dom.window.close();
		}
	}
});

test("a short pull on a full preview glides back and keeps it full", () => {
	const f = fixture({ phone: true });
	try {
		const sheet = f.dialog.querySelector(".preview-sheet"),
			target = f.scroll.querySelector("p");
		sheet.classList.add("is-full");
		f.fire(target, "touchstart", 120, 200);
		f.fire(target, "touchmove", 120, 280);
		f.w.performance.now = (() => {
			const later = f.w.performance.now() + 1000;
			return () => later;
		})();
		f.fire(target, "touchend", 120, 280);
		f.flush();
		assert.equal(f.app.closed, 0);
		assert.equal(sheet.style.translate, "");
		assert.equal(sheet.classList.contains("is-full"), true);
	} finally {
		f.dom.window.close();
	}
});

test("pushing on at the end of a stacked preview folds back one card, not the desk", () => {
	const f = fixture({ end: true });
	try {
		let desk = 0;
		Object.assign(f.app, {
			modalKind: "preview",
			closeToDesk() {
				desk++;
			},
		});
		const target = f.scroll.querySelector("p");
		f.fire(target, "touchstart", 120, 500);
		f.fire(target, "touchmove", 120, 300);
		f.fire(target, "touchend", 120, 300);
		assert.equal(f.Store.item("article").read, true);
		f.flush();
		// The card is redrawn first; the detail leaves two frames later, on a clean frame.
		f.flush(f.frames);
		f.flush(f.frames);
		assert.equal(f.app.closed, 1);
		assert.equal(desk, 0);
	} finally {
		f.dom.window.close();
	}
});

test("read-end success badge disappears even when navigation changes before closing", () => {
	const f = fixture({ end: true });
	try {
		const target = f.scroll.querySelector("p");
		f.fire(target, "touchstart", 120, 500);
		f.fire(target, "touchmove", 120, 300);
		f.fire(target, "touchend", 120, 300);
		assert.equal(f.dialog.querySelectorAll(".push-ring.is-done").length, 1);
		f.app.modalToken++;
		f.flush(f.frames);
		assert.equal(f.dialog.querySelector(".push-ring"), null);
		assert.equal(f.app.closed, 0);
	} finally {
		f.dom.window.close();
	}
});

test("a delayed gesture close cannot close a later panel or alter its return motion", async () => {
	const f = fixture();
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		f.gestures.exitSurface(f.dialog, () => f.app.closeModal());
		f.app.modalToken++;
		// A replacement surface resets the exit lock, as openModal does.
		f.app.sheetLeaving = false;
		f.dialog.inert = false;
		f.dialog.style.removeProperty("--backdrop");
		animations.at(-1).finish();
		await Promise.resolve();
		f.flush();
		assert.equal(f.dialog.open, true);
		assert.equal(f.app.closed, 0);
		assert.equal(f.app.skipReturnMotion, false);
		assert.equal(f.dialog.style.getPropertyValue("--backdrop"), "");
		f.gestures.exitSurface(f.dialog, () => f.app.closeModal());
		animations.at(-1).finish();
		await Promise.resolve();
		f.flush();
		assert.equal(f.app.closed, 1, "the current panel still closes normally");
	} finally {
		f.dom.window.close();
	}
});

test("text selection and field scrolling do not dismiss a reader or finish its card", () => {
	for (const end of [false, true]) {
		const f = fixture({ kind: "reader", end });
		try {
			const field = f.document.createElement("textarea");
			field.readOnly = true;
			f.scroll.appendChild(field);
			const before = f.w.localStorage.getItem("sill-v1");
			for (const [x, y] of [
				[400, 200],
				[120, 500],
				[120, 0],
			]) {
				f.fire(field, "touchstart");
				f.fire(field, "touchmove", x, y);
				f.fire(field, "touchend", x, y);
			}
			for (let n = 0; n < 12; n++)
				field.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY: end ? 80 : -80 }));
			f.flush();
			assert.equal(f.app.closed, 0);
			assert.equal(f.document.querySelector(".is-drag"), null);
			assert.equal(f.w.localStorage.getItem("sill-v1"), before);
		} finally {
			f.dom.window.close();
		}
	}
});

test("phone navigation pages are not draggable sheets", () => {
	const f = fixture({ kind: "panel page", phone: true });
	try {
		const target = f.scroll.querySelector("p");
		f.fire(target, "touchstart");
		f.fire(target, "touchmove", 120, 500);
		f.fire(target, "touchend", 120, 500);
		f.flush();
		assert.equal(f.app.closed, 0);
		assert.equal(f.document.querySelector(".is-drag"), null);
		assert.equal(f.dialog.querySelector(".sheet").style.translate, "");
	} finally {
		f.dom.window.close();
	}
});

test("a canceled phone opening cannot revive the exiting sheet or its toolbar", () => {
	const f = fixture({ phone: true });
	try {
		const sheet = f.dialog.querySelector(".preview-sheet"),
			bar = f.dialog.querySelector(".float-bar");
		f.MotionEngine.openPanel(f.dialog);
		f.MotionEngine.cancelPanel(f.dialog);
		sheet.classList.add("is-off");
		f.flush(f.frames);
		f.flush();
		assert.equal(sheet.classList.contains("is-off"), true);
		assert.equal(f.MotionEngine.panelAnimations.has(f.dialog), false);
		assert.equal(bar.style.transform, "");
	} finally {
		f.dom.window.close();
	}
});

test("a toast swipe completion cannot hide a newer result", async () => {
	const f = fixture({ kind: "desk" });
	try {
		const toast = f.document.getElementById("toast");
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		f.fire(toast, "touchstart");
		f.fire(toast, "touchmove", 120, 250);
		f.fire(toast, "touchend", 120, 250);
		f.app.toastSeq++;
		toast.textContent = "后来的结果";
		animations.at(-1).finish();
		await Promise.resolve();
		assert.equal(toast.hidden, false);
		assert.equal(toast.textContent, "后来的结果");
	} finally {
		f.dom.window.close();
	}
});

test("read-end touch progress coalesces frames and commits once before release", () => {
	const f = fixture({ end: true });
	try {
		const target = f.scroll.querySelector("p");
		let refreshes = 0;
		f.app.refreshCard = () => refreshes++;
		f.fire(target, "touchstart", 120, 500);
		f.fire(target, "touchmove", 120, 460);
		f.fire(target, "touchmove", 120, 440);
		assert.equal(f.frames.size, 1);
		assert.equal(Boolean(f.Store.item("article").read), false);
		f.fire(target, "touchmove", 120, 300);
		assert.equal(f.frames.size, 0, "the check waits for the hand to let go");
		assert.equal(f.Store.item("article").read, true);
		assert.equal(f.dialog.querySelectorAll(".push-ring.is-done").length, 1);
		assert.equal(refreshes, 0, "feed rendering waits until confirmation has been visible");
		f.fire(target, "touchend", 120, 300);
		f.flush();
		f.flush(f.frames);
		f.flush(f.frames);
		assert.equal(f.app.closed, 1);
		assert.equal(refreshes, 1);
	} finally {
		f.dom.window.close();
	}
});

test("read-end wheel threshold completes without waiting for the stream to stop", () => {
	const f = fixture({ end: true });
	try {
		let writes = 0;
		const patch = f.Store.patch.bind(f.Store);
		f.Store.patch = (...args: any[]) => {
			writes++;
			return patch(...args);
		};
		for (let i = 0; i < 20; i++)
			f.scroll.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
		assert.equal(f.Store.item("article").read, true);
		assert.equal(f.dialog.querySelectorAll(".push-ring.is-done").length, 1);
		assert.equal(writes, 1);
		assert.equal(f.app.closed, 0, "confirmation is visible before the layer closes");
		f.flush();
		f.flush(f.frames);
		f.flush(f.frames);
		assert.equal(f.app.closed, 1);
	} finally {
		f.dom.window.close();
	}
});

test("read-end wheel push fills from spaced mouse notches and an uneven trackpad hand", async () => {
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const arc = (f: any) =>
		Number(
			f.dialog.querySelector(".push-ring .arc circle:last-child").getAttribute("stroke-dashoffset"),
		);
	for (const deltas of [
		// Mouse: one notch every 120ms, far apart for a 40ms idle.
		[100, 100, 100, 100, 100, 100, 100],
		// Trackpad: a steady push whose size wobbles by more than 10%.
		[30, 24, 30, 20, 28, 18, 26, 22, 30, 20, 28, 24, 30, 26, 22, 30],
	]) {
		const f = fixture({ end: true });
		try {
			const gap = deltas[0] === 100 ? 120 : 16;
			let last = arc(f);
			for (const deltaY of deltas) {
				f.scroll.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY }));
				if (f.dialog.querySelector(".push-ring.is-done")) break;
				f.flush(f.frames);
				assert.ok(arc(f) <= last, "the ring never falls back while the hand keeps pushing");
				last = arc(f);
				await wait(gap);
				// Timers that would have run within the gap run now.
				f.flush(undefined, gap);
				f.flush(f.frames);
			}
			assert.equal(f.dialog.querySelectorAll(".push-ring.is-done").length, 1);
			assert.equal(f.Store.item("article").read, true);
		} finally {
			f.dom.window.close();
		}
	}
});

test("read-end wheel push returns once the hand stops; arriving momentum cannot start one", async () => {
	const f = fixture({ end: true });
	try {
		f.scroll.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
		f.flush(f.frames);
		const ring = f.dialog.querySelector(".push-ring");
		assert.ok(Number(ring.style.opacity) > 0);
		f.flush(undefined, 120);
		assert.ok(Number(ring.style.opacity) > 0, "the ring holds between notches");
		f.flush();
		f.flush(f.frames);
		assert.equal(Number(ring.style.opacity), 0, "a stopped hand lets the ring go");
		// Momentum: a decaying tail with no fresh effort.
		for (const deltaY of [20, 16, 12]) {
			f.scroll.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY }));
			f.flush(f.frames);
		}
		assert.equal(Number(ring.style.opacity), 0, "a shrinking tail does not begin a push");
		assert.equal(Boolean(f.Store.item("article").read), false);
	} finally {
		f.dom.window.close();
	}
});

test("desktop pull fades from the release position; phone keeps its downward slide", async () => {
	for (const phone of [false, true]) {
		const f = fixture({ phone });
		try {
			const sheet = f.dialog.querySelector(".preview-sheet");
			sheet.style.translate = "0 140px";
			sheet.getBoundingClientRect = () => ({ top: 240, left: 0, height: 400, width: 400 });
			const animations: any[] = [];
			f.w.__motionAnimations = animations;
			f.gestures.exitSurface(sheet, () => f.app.closeModal());
			const exit = animations.at(-1);
			assert.match(exit.frames[0].transform, /translateY\(140px\)/);
			assert.equal(exit.options.duration, phone ? 260 : 220);
			if (!phone) {
				assert.match(exit.frames[1].transform, /translateY\(150px\)/);
				assert.equal(exit.frames[1].opacity, 0);
			} else {
				assert.notEqual(exit.frames[1].opacity, 0);
				assert.ok(parseFloat(exit.frames[1].transform.match(/translateY\(([^)]+)\)/)[1]) > 140);
			}
			assert.equal(f.app.closed, 0);
			assert.equal(f.dialog.inert, true);
			const count = animations.length;
			f.gestures.exitSurface(sheet, () => f.app.closeModal());
			assert.equal(animations.length, count, "a second dismissal cannot replace the active exit");
			exit.finish();
			await Promise.resolve();
			assert.equal(f.app.closed, 1);
		} finally {
			f.dom.window.close();
		}
	}
});

test("a fast phone release hands its last touch position to the exit before a drawing frame", async () => {
	const f = fixture({ phone: true });
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		const target = f.scroll.querySelector("p");
		f.fire(target, "touchstart", 120, 200);
		f.fire(target, "touchmove", 120, 450);
		assert.equal(f.frames.size, 1);
		f.fire(target, "touchend", 120, 450);
		assert.equal(f.frames.size, 0);
		const exit = animations.findLast((a: any) =>
			a.frames[0]?.transform?.includes("translateY(250px)"),
		);
		assert.ok(
			exit,
			"exit must start from the final touch position, not the previous painted frame",
		);
		assert.equal(f.app.closed, 0);
		exit.finish();
		await Promise.resolve();
		assert.equal(f.app.closed, 1);
	} finally {
		f.dom.window.close();
	}
});

test("desktop downward wheel and touch never close previews or readers", () => {
	for (const kind of ["preview", "reader"]) {
		const f = fixture({ kind });
		try {
			f.gestures.bindPullDown();
			const target = f.scroll.querySelector("p");
			for (let i = 0; i < 20; i++)
				target.dispatchEvent(new f.w.WheelEvent("wheel", { bubbles: true, deltaY: -40 }));
			f.fire(target, "touchstart", 120, 100);
			f.fire(target, "touchmove", 120, 500);
			f.fire(target, "touchend", 120, 500);
			f.flush();
			assert.equal(f.app.closed, 0);
			assert.equal(f.dialog.querySelector(".is-drag"), null);
		} finally {
			f.dom.window.close();
		}
	}
});

test("completed reading keeps tools hidden through the close handoff on phone and desktop", () => {
	for (const kind of ["preview", "reader"])
		for (const phone of [false, true]) {
			const f = fixture({ kind, phone, end: true });
			try {
				const bar = f.dialog.querySelector(".float-bar") as HTMLElement;
				let closed = false;
				const close = () => {
					assert.equal(bar.style.opacity, "0");
					assert.equal(bar.style.visibility, "hidden");
					assert.equal(
						f.scroll.style.translate,
						"0 -72px",
						"completion closes from its current position without rebounding",
					);
					closed = true;
				};
				Object.assign(f.app, { modalKind: kind, closeModal: close, closeToDesk: close });
				const target = f.scroll.querySelector("p");
				f.fire(target, "touchstart", 120, 500);
				f.fire(target, "touchmove", 120, 300);
				assert.equal(bar.style.visibility, "hidden");
				// A pending toolbar animation cannot reveal a completion-owned surface.
				bar.style.opacity = "1";
				assert.equal(f.w.getComputedStyle(bar).visibility, "hidden");
				bar.style.opacity = "0";
				f.flush();
				f.flush(f.frames);
				f.flush(f.frames);
				assert.equal(closed, false, "the check waits for the hand to let go");
				f.fire(target, "touchend", 120, 300);
				f.flush(f.frames);
				f.flush(f.frames);
				assert.equal(closed, true);
				assert.equal(bar.style.visibility, "hidden");
			} finally {
				f.dom.window.close();
			}
		}
});
