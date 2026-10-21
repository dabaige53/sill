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
		f.flush();
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

test("mouse refresh follows the next frame, holds without loading, and commits once on release", () => {
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
		f.flush(undefined, 300);
		await settle();
		assert.equal(f.app.refreshes, 2);
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "success");
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
		assert.equal(f.document.querySelector("main").style.translate, "0 36px", "held while loading");
		assert.equal(f.document.querySelector("#pull-ring").textContent, "");
		assert.equal(
			f.document.querySelector("#pull-ring").dataset.state,
			"loading",
			"fast requests retain visible feedback",
		);
		f.flush(undefined, 300);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		assert.equal(f.document.querySelector("#pull-ring").dataset.state, "success");
		assert.equal(
			f.document.querySelector("main").style.translate,
			"0 36px",
			"held under the check",
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
		assert.equal(f.frames.size, 0);
		assert.equal(f.Store.item("article").read, true);
		assert.equal(f.dialog.querySelectorAll(".push-ring.is-done").length, 1);
		assert.equal(refreshes, 0, "feed rendering waits until confirmation has been visible");
		f.fire(target, "touchend", 120, 300);
		f.flush();
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
		assert.equal(f.app.closed, 1);
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

test("desktop completed reading keeps tools hidden through the close handoff", () => {
	for (const kind of ["preview", "reader"]) {
		const f = fixture({ kind, end: true });
		try {
			const bar = f.dialog.querySelector(".float-bar") as HTMLElement;
			let closed = false;
			const close = () => {
				assert.equal(bar.style.opacity, "0");
				assert.equal(bar.style.visibility, "hidden");
				assert.equal(
					f.scroll.style.translate,
					"0 -42px",
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
			assert.equal(closed, true);
			assert.equal(bar.style.visibility, "hidden");
		} finally {
			f.dom.window.close();
		}
	}
});
