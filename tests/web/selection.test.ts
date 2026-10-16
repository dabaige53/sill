/** DOM/state regressions complement the real-touch selection browser suite. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {DragManager} from './apps/web/interactions/drag.ts'; export {Gestures} from './apps/web/interactions/gestures.ts'; export {Store} from './apps/web/data/store.ts'; export {AppController} from './apps/web/views/app.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SelectionTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		`<!doctype html><main><div id="feed-grid">${["one", "two", "three"].map((id) => `<article class="feed-card" data-card="${id}" tabindex="0"><div class="card-body"><p class="card-summary">${id} summary stays visible</p><h2 class="card-title"><button id="title-${id}" class="card-title-button" data-action="card-open" data-id="${id}" aria-describedby="summary-${id}">${id}</button></h2><span id="summary-${id}">Structured content</span></div></article>`).join("")}</div></main><div id="selection-bar"><span class="selection-count"></span><button data-action="selection-menu">操作</button></div><dialog id="modal"></dialog><div id="toast"></div>`,
		{
			url: "http://selection.test/",
			runScripts: "outside-only",
			pretendToBeVisual: true,
		},
	);
	const w = dom.window as any,
		document = w.document;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	w.HTMLDialogElement.prototype.showModal = function () {
		this.setAttribute("open", "");
	};
	w.HTMLDialogElement.prototype.close = function () {
		this.removeAttribute("open");
	};
	const timers = new Map<number, () => void>();
	let timerId = 0;
	w.setTimeout = (fn: () => void) => {
		const id = ++timerId;
		timers.set(id, fn);
		return id;
	};
	w.clearTimeout = (id: number) => timers.delete(id);
	w.localStorage.setItem(
		"sill-v1",
		JSON.stringify({
			version: 4,
			cards: ["one", "two", "three"].map((id) => ({ id, type: "article", title: id, body: [id] })),
			items: {},
		}),
	);
	w.eval(bundle);
	const { Store, AppController, DragManager, Gestures } = w.SelectionTest;
	Store.load();
	const app = new AppController();
	app.grid = document.getElementById("feed-grid");
	app.dialog = document.getElementById("modal");
	app.closeMore = () => {};
	app.announce = () => {};
	app.refreshCard = () => {};
	app.toast = () => {};
	app.hideDock = () => {};
	app.openPanel = (kind: string, id: string) => {
		app.openedPanel = { kind, id };
	};
	app.refreshCount = 0;
	app.refresh = () => {
		app.refreshCount++;
		return Promise.resolve();
	};
	app.drag = new DragManager(app);
	for (const id of ["one", "two", "three"]) Store.item(id);
	Store.save();
	const selected = () => Array.from(app.selected).sort();
	const state = () =>
		JSON.stringify({
			cards: Store.state.cards,
			items: Store.state.items,
			stored: w.localStorage.getItem("sill-v1"),
		});
	const selectTwo = () => {
		app.select("one", { add: true });
		app.select("two", { add: true });
	};
	const fire = (type: string, target: any = document, options: any = {}) => {
		const event = new w.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, options);
		target.dispatchEvent(event);
		return event;
	};
	const source = () => app.grid.querySelector('[data-card="one"] p');
	const start = () => fire("touchstart", source(), { touches: [{ clientX: 120, clientY: 200 }] });
	const hold = () => {
		const callbacks = [...timers.values()];
		timers.clear();
		callbacks.forEach((fn) => {
			fn();
		});
	};
	const move = () => fire("touchmove", source(), { touches: [{ clientX: 150, clientY: 270 }] });
	const release = () =>
		fire("touchend", source(), { touches: [], changedTouches: [{ clientX: 150, clientY: 270 }] });
	const open = () => {
		selectTwo();
		app.drag.openMenu(["one", "two"], document.querySelector('[data-action="selection-menu"]'));
	};
	const key = (value: string, shiftKey = false) =>
		document.activeElement.dispatchEvent(
			new w.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }),
		);
	return {
		dom,
		w,
		document,
		Store,
		app,
		Gestures,
		selected,
		state,
		selectTwo,
		fire,
		source,
		start,
		hold,
		move,
		release,
		open,
		key,
	};
}

test("selection: quick touch movement stays a scroll; stationary hold only selects", () => {
	const f = fixture();
	try {
		const before = f.state();
		f.start();
		f.move();
		f.hold();
		f.release();
		assert.deepEqual(f.selected(), []);
		assert.equal(f.app.drag.active, null);
		f.start();
		f.hold();
		assert.deepEqual(f.selected(), ["one"]);
		assert.equal(f.document.querySelector(".selection-stack-count").textContent, "1");
		f.release();
		assert.equal(f.app.drag.menu.open, false);
		assert.equal(f.document.querySelector(".selection-lift"), null);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: moving the held cards opens a grouped menu without dropping an action", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const before = f.state();
		f.start();
		f.hold();
		assert.equal(
			f.document.querySelector(".selection-lift .selection-stack-count").textContent,
			"2",
		);
		assert.equal(f.move().defaultPrevented, true);
		f.release();
		assert.equal(f.app.drag.menu.open, true);
		assert.equal(f.document.querySelector(".selection-lift"), null);
		assert.equal(f.document.querySelectorAll("#selection-menu [role=group]").length, 3);
		assert.deepEqual(
			Array.from(
				f.document.querySelectorAll("[data-selection-action]"),
				(n: any) => n.dataset.selectionAction,
			),
			["bookmark", "later", "tag", "cancel"],
		);
		assert.equal(f.document.activeElement.dataset.selectionAction, "bookmark");
		assert.deepEqual(f.selected(), ["one", "two"]);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: stationary hold of selected cards opens the menu on release", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const before = f.state();
		f.start();
		f.hold();
		assert.equal(f.app.drag.menu.open, false);
		f.release();
		assert.equal(f.app.drag.menu.open, true);
		assert.deepEqual(f.selected(), ["one", "two"]);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: thumbnail clones real card content without IDs, handlers, or interaction hooks", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const source = f.source().closest("article");
		source.insertAdjacentHTML(
			"beforeend",
			`<div id="original-controls" data-drop="bookmark" role="group" aria-labelledby="title-one"><label for="original-input">Task detail</label><input id="original-input" value="Private fixture value" autofocus tabindex="3"><a href="https://example.invalid" onclick="window.__cloneClicked=true" data-action="open" aria-controls="original-controls">Original link label</a><span contenteditable="true" tabindex="0">Editable fixture text</span><img id="original-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="Fixture cover"><div class="card-actions"><button>Hidden original action</button></div></div>`,
		);
		const original = source.innerHTML;
		const before = f.state();
		f.start();
		f.hold();
		f.move();
		const check = (stack: HTMLElement) => {
			assert.equal((stack as any).inert, true);
			assert.equal(stack.getAttribute("aria-hidden"), "true");
			const clone = stack.querySelector(".selection-stack-face > .feed-card");
			assert.ok(clone, "the preview must contain a cloned real card");
			assert.equal(clone.querySelector(".card-summary").textContent, "one summary stays visible");
			assert.ok(clone.textContent.includes("Structured content"));
			assert.ok(clone.textContent.includes("Original link label"));
			assert.equal(
				clone.querySelector("img")?.getAttribute("src"),
				source.querySelector("img").getAttribute("src"),
			);
			assert.equal(
				clone.querySelectorAll(
					"button,a,input,textarea,select,[tabindex],[contenteditable],.card-actions",
				).length,
				0,
			);
			for (const node of [clone, ...clone.querySelectorAll("*")]) {
				assert.equal(node.hasAttribute("id"), false);
				assert.ok(
					[...node.attributes].every((attr) => !/^(aria-|data-|on)/.test(attr.name)),
					node.outerHTML,
				);
			}
			assert.equal(clone.matches(".is-selected,.is-drag-source"), false);
		};
		check(f.document.querySelector(".selection-lift .selection-stack"));
		f.release();
		check(f.document.querySelector("#selection-menu .selection-stack"));
		assert.equal(source.innerHTML, original, "sanitizing the clone changed the live card");
		assert.equal(f.document.querySelectorAll("#title-one").length, 1);
		assert.equal(f.document.querySelectorAll("#original-controls").length, 1);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: mouse and touch menus use the final release point after tracking", () => {
	for (const pointer of ["mouse", "touch"]) {
		const f = fixture();
		try {
			f.selectTwo();
			let anchor: any;
			const position = f.app.drag.positionMenu.bind(f.app.drag);
			f.app.drag.positionMenu = (point: any) => {
				anchor = { ...point };
				position(point);
			};
			if (pointer === "touch") f.start();
			else
				f.fire("pointerdown", f.source(), {
					pointerType: "mouse",
					button: 0,
					clientX: 120,
					clientY: 200,
				});
			f.hold();
			for (const point of [
				{ x: 220, y: 320 },
				{ x: 290, y: 710 },
			]) {
				if (pointer === "touch")
					f.fire("touchmove", f.source(), { touches: [{ clientX: point.x, clientY: point.y }] });
				else
					f.fire("pointermove", f.source(), {
						pointerType: "mouse",
						clientX: point.x,
						clientY: point.y,
					});
			}
			if (pointer === "touch")
				f.fire("touchend", f.source(), {
					touches: [],
					changedTouches: [{ clientX: 310, clientY: 735 }],
				});
			else f.fire("pointerup", f.source(), { pointerType: "mouse", clientX: 310, clientY: 735 });
			assert.deepEqual(anchor, { x: 310, y: 735 }, pointer);
			assert.equal(f.app.drag.menu.open, true);
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: menu placement flips near the top and clamps at viewport edges", () => {
	const f = fixture();
	try {
		Object.defineProperty(f.w, "innerWidth", { value: 390, configurable: true });
		Object.defineProperty(f.w, "innerHeight", { value: 844, configurable: true });
		f.open();
		const context = f.document.querySelector(".selection-context"),
			options = f.document.querySelector(".selection-options"),
			stack = f.document.querySelector("#selection-menu .selection-stack");
		Object.defineProperty(options, "offsetHeight", { get: () => 234 });
		Object.defineProperty(context, "offsetWidth", { get: () => 264 });
		Object.defineProperty(context, "offsetHeight", { get: () => 470 });
		f.app.drag.positionMenu({ x: 195, y: 400 });
		assert.equal(context.dataset.placement, "above");
		assert.equal(context.style.left, "63px");
		assert.equal(context.style.top, "142px");
		assert.equal(stack.style.order, "1");
		f.app.drag.positionMenu({ x: 2, y: 30 });
		assert.equal(context.dataset.placement, "below");
		assert.equal(context.style.left, "16px");
		assert.equal(context.style.top, "30px");
		assert.equal(stack.style.order, "-1");
		f.app.drag.positionMenu({ x: 388, y: 830 });
		assert.equal(context.dataset.placement, "above");
		assert.equal(context.style.left, "110px");
		assert.equal(context.style.top, "358px");
		assert.ok(parseFloat(context.style.top) + context.offsetHeight <= f.w.innerHeight - 16);
	} finally {
		f.dom.window.close();
	}
});

test("selection: keyboard opening anchors to the trigger and keeps only four focus targets", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const trigger = f.document.querySelector('[data-action="selection-menu"]');
		trigger.getBoundingClientRect = () => ({ left: 120, top: 760, width: 80, height: 56 });
		let anchor: any;
		const position = f.app.drag.positionMenu.bind(f.app.drag);
		f.app.drag.positionMenu = (point: any) => {
			anchor = { ...point };
			position(point);
		};
		f.app.drag.openMenu(["one", "two"], trigger);
		assert.deepEqual(anchor, { x: 160, y: 760 });
		assert.equal(f.document.querySelectorAll("#selection-menu button").length, 4);
		assert.equal(f.document.querySelectorAll("#selection-menu .selection-options svg").length, 3);
		for (const action of ["later", "tag", "cancel", "bookmark"]) {
			f.key("Tab");
			assert.equal(f.document.activeElement.dataset.selectionAction, action);
		}
		f.key("Escape");
		assert.equal(f.document.activeElement, trigger);
	} finally {
		f.dom.window.close();
	}
});

test("selection: every menu dismissal preserves cards, selection, and trigger focus", () => {
	for (const method of ["cancel", "backdrop", "Escape", "touchcancel", "blur"]) {
		const f = fixture();
		try {
			const before = f.state();
			f.open();
			if (method === "cancel") f.document.querySelector('[data-selection-action="cancel"]').click();
			if (method === "backdrop") f.app.drag.menu.click();
			if (method === "Escape") f.key("Escape");
			if (method === "touchcancel") f.fire("touchcancel");
			if (method === "blur") f.fire("blur", f.w);
			assert.equal(f.app.drag.menu.open, false, method);
			assert.deepEqual(f.selected(), ["one", "two"], method);
			assert.equal(f.state(), before, method);
			assert.equal(f.document.activeElement.dataset.action, "selection-menu", method);
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: interrupted press or lift cleans up without clearing selection", () => {
	for (const held of [false, true])
		for (const method of ["Escape", "touchcancel", "pointercancel", "blur"]) {
			const f = fixture();
			try {
				f.selectTwo();
				const before = f.state();
				f.start();
				if (held) {
					f.hold();
					f.move();
				}
				if (method === "Escape") f.key("Escape");
				else f.fire(method, method === "blur" ? f.w : f.document);
				f.hold();
				f.release();
				assert.equal(f.app.drag.active, null, method);
				assert.equal(f.app.drag.pending, null, method);
				assert.equal(f.app.drag.menu.open, false, method);
				assert.equal(
					f.document.querySelector(".selection-lift,.is-drag-source,body.is-dragging"),
					null,
					method,
				);
				assert.deepEqual(f.selected(), ["one", "two"]);
				assert.equal(f.state(), before);
			} finally {
				f.dom.window.close();
			}
		}
});

test("selection: explicit buttons reuse bookmark, later, and bulk tag handlers", () => {
	for (const action of ["bookmark", "later", "tag"]) {
		const f = fixture();
		try {
			const before = f.state();
			f.open();
			assert.equal(f.state(), before);
			f.document.querySelector(`[data-selection-action="${action}"]`).click();
			assert.equal(f.app.drag.menu.open, false);
			assert.deepEqual(f.selected(), []);
			if (action === "tag") {
				assert.equal(f.state(), before);
				assert.deepEqual(Array.from(f.app.bulkEditIds), ["one", "two"]);
				assert.deepEqual(f.app.openedPanel, { kind: "editor", id: "one" });
			} else {
				const key = action === "bookmark" ? "bookmarked" : "later";
				for (const id of ["one", "two"]) assert.equal(f.Store.item(id)[key], true);
				assert.equal(f.Store.item("three")[key], false);
			}
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: menu keyboard navigation wraps and blocks global shortcuts", () => {
	const f = fixture();
	try {
		f.open();
		let leaked = 0;
		f.document.addEventListener("keydown", () => leaked++);
		f.key("Tab", true);
		assert.equal(f.document.activeElement.dataset.selectionAction, "cancel");
		f.key("Tab");
		assert.equal(f.document.activeElement.dataset.selectionAction, "bookmark");
		f.key("ArrowDown");
		assert.equal(f.document.activeElement.dataset.selectionAction, "later");
		f.key("End");
		assert.equal(f.document.activeElement.dataset.selectionAction, "cancel");
		f.key("Home");
		assert.equal(f.document.activeElement.dataset.selectionAction, "bookmark");
		f.key("n");
		f.key("Escape");
		assert.equal(leaked, 0);
		assert.deepEqual(f.selected(), ["one", "two"]);
	} finally {
		f.dom.window.close();
	}
});

test("selection: native drag is cancelled before any transferable content is created", () => {
	const f = fixture();
	try {
		const before = f.state();
		const event = f.fire("dragstart", f.source());
		assert.equal(event.defaultPrevented, true);
		assert.equal(f.state(), before);
		assert.equal(f.app.drag.menu.open, false);
	} finally {
		f.dom.window.close();
	}
});

test("selection: touch and wheel pull-refresh are inactive while cards are selected", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const before = f.state();
		const gestures = new f.Gestures(f.app);
		assert.ok(gestures);
		f.start();
		const move = f.fire("touchmove", f.source(), { touches: [{ clientX: 120, clientY: 500 }] });
		f.release();
		f.w.dispatchEvent(
			new f.w.WheelEvent("wheel", { deltaY: -240, bubbles: true, cancelable: true }),
		);
		assert.equal(
			move.defaultPrevented,
			false,
			"a short movement must remain available for scrolling",
		);
		assert.equal(f.app.refreshCount, 0);
		assert.equal(f.document.body.classList.contains("is-pulling"), false);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});
