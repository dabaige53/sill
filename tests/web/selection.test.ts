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
		`<!doctype html><main><div id="feed-grid">${["one", "two", "three"].map((id) => `<article class="feed-card" data-card="${id}" tabindex="0"><div class="card-body"><p class="card-summary">${id} summary stays visible</p><h2 class="card-title"><button id="title-${id}" class="card-title-button" data-action="card-open" data-id="${id}" aria-describedby="summary-${id}">${id}</button></h2><span id="summary-${id}">Structured content</span></div></article>`).join("")}</div></main><div id="selection-bar"><span class="selection-count"></span><button data-action="selected-bookmark">收藏</button><button data-action="selected-later">稍后看</button><button data-action="selected-tag">标签</button><button data-action="clear-selection">取消选择</button></div><dialog id="modal"></dialog><div id="toast"></div>`,
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
		app.drag.openMenu(["one", "two"], document.querySelector('[data-action="selected-bookmark"]'));
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

test("selection: both context keys open the bulk menu from the visible bar without writing", () => {
	for (const shortcut of [{ key: "F10", shiftKey: true }, { key: "ContextMenu" }]) {
		const f = fixture();
		try {
			f.selectTwo();
			const before = f.state();
			const trigger = f.document.querySelector('[data-action="selected-bookmark"]');
			trigger.focus();
			f.document.addEventListener("keydown", (event) => f.app.key(event));
			const event = new f.w.KeyboardEvent("keydown", {
				...shortcut,
				bubbles: true,
				cancelable: true,
			});
			trigger.dispatchEvent(event);
			assert.equal(event.defaultPrevented, true);
			assert.equal(f.app.drag.menu.open, true);
			assert.equal(f.document.activeElement.dataset.selectionAction, "bookmark");
			f.key("Escape");
			assert.equal(f.document.activeElement, trigger);
			assert.deepEqual(f.selected(), ["one", "two"]);
			assert.equal(f.state(), before);
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: context shortcuts preserve native editing, composing, and modal input", () => {
	const f = fixture();
	try {
		let opened = 0;
		f.app.more = () => opened++;
		f.document.addEventListener("keydown", (event) => f.app.key(event));
		const card = f.source().closest("article");
		card.insertAdjacentHTML(
			"beforeend",
			'<input><textarea></textarea><span contenteditable="true">Editable</span>',
		);
		for (const target of card.querySelectorAll("input,textarea,[contenteditable]")) {
			const event = new f.w.KeyboardEvent("keydown", {
				key: "F10",
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			});
			target.dispatchEvent(event);
			assert.equal(event.defaultPrevented, false);
		}
		card.dispatchEvent(
			new f.w.KeyboardEvent("keydown", {
				key: "F10",
				shiftKey: true,
				isComposing: true,
				bubbles: true,
			}),
		);
		f.app.dialog.showModal();
		card.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
		assert.equal(opened, 0);
		assert.equal(f.app.drag.menu.open, false);
	} finally {
		f.dom.window.close();
	}
});

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
		assert.equal(f.document.querySelector(".selection-lift,.selected-tick"), null);
		f.release();
		assert.equal(f.app.drag.menu.open, false);
		assert.equal(f.document.querySelector(".selection-lift"), null);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: moving or repeating a hold preserves selection without opening a menu", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const before = f.state();
		for (const move of [false, true]) {
			f.start();
			f.hold();
			assert.equal(f.document.querySelector(".selection-lift,.is-drag-source"), null);
			if (move) f.move();
			f.release();
			assert.equal(f.app.drag.menu.open, false);
			assert.deepEqual(f.selected(), ["one", "two"]);
		}
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
		f.open();
		const check = (stack: HTMLElement) => {
			assert.equal((stack as any).inert, true);
			assert.equal(stack.getAttribute("aria-hidden"), "true");
			// Like Photos: every chosen card (up to three) is a real clone; the first one chosen lies on top.
			assert.equal(stack.querySelectorAll(".selection-stack-face > .feed-card").length, 2);
			const clone = stack.querySelector('.selection-stack-face[data-layer="0"] > .feed-card');
			assert.ok(clone, "the preview must contain a cloned real card");
			assert.equal(stack.lastElementChild.classList.contains("selection-stack-count"), true);
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
			assert.equal((clone as HTMLElement).style.position, "relative");
		};
		check(f.document.querySelector("#selection-menu .selection-stack"));
		assert.equal(source.innerHTML, original, "sanitizing the clone changed the live card");
		assert.equal(f.document.querySelectorAll("#title-one").length, 1);
		assert.equal(f.document.querySelectorAll("#original-controls").length, 1);
		assert.equal(f.state(), before);
	} finally {
		f.dom.window.close();
	}
});

test("selection: menu opens below when there is room, flips above near the bottom, and clamps at viewport edges", () => {
	const f = fixture();
	try {
		Object.defineProperty(f.w, "innerWidth", { value: 390, configurable: true });
		Object.defineProperty(f.w, "innerHeight", { value: 844, configurable: true });
		f.open();
		const context = f.document.querySelector(".selection-context"),
			options = f.document.querySelector(".selection-options"),
			stack = f.document.querySelector("#selection-menu .selection-stack");
		Object.defineProperty(options, "offsetHeight", { get: () => 234 });
		Object.defineProperty(stack, "offsetHeight", { get: () => 140 });
		Object.defineProperty(context, "offsetWidth", { get: () => 264 });
		Object.defineProperty(context, "offsetHeight", { get: () => 470 });
		// Room below: the pile stays centred on the release point and the menu opens downward.
		f.app.drag.positionMenu({ x: 195, y: 400 });
		assert.equal(context.dataset.placement, "below");
		assert.equal(context.style.left, "63px");
		assert.equal(context.style.top, "330px");
		assert.equal(stack.style.order, "-1");
		f.app.drag.positionMenu({ x: 2, y: 30 });
		assert.equal(context.dataset.placement, "below");
		assert.equal(context.style.left, "16px");
		assert.equal(context.style.top, "16px");
		assert.equal(stack.style.order, "-1");
		// No room below: the menu opens upward and the whole group stays inside the viewport.
		f.app.drag.positionMenu({ x: 388, y: 830 });
		assert.equal(context.dataset.placement, "above");
		assert.equal(context.style.left, "110px");
		assert.equal(context.style.top, "358px");
		assert.equal(stack.style.order, "1");
		assert.ok(parseFloat(context.style.top) + context.offsetHeight <= f.w.innerHeight - 16);
	} finally {
		f.dom.window.close();
	}
});

test("selection: keyboard opening anchors to the trigger and keeps only four focus targets", () => {
	const f = fixture();
	try {
		f.selectTwo();
		const trigger = f.document.querySelector('[data-action="selected-bookmark"]');
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
	for (const method of ["cancel", "backdrop", "Escape", "touchcancel", "blur", "resize"]) {
		const f = fixture();
		try {
			const before = f.state();
			f.open();
			if (method === "cancel") f.document.querySelector('[data-selection-action="cancel"]').click();
			if (method === "backdrop") f.app.drag.menu.click();
			if (method === "Escape") f.key("Escape");
			if (method === "touchcancel") f.fire("touchcancel");
			if (["blur", "resize"].includes(method)) f.fire(method, f.w);
			assert.equal(f.app.drag.menu.open, false, method);
			assert.deepEqual(f.selected(), ["one", "two"], method);
			assert.equal(f.state(), before, method);
			assert.equal(f.document.activeElement.dataset.action, "selected-bookmark", method);
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: interrupted press or lift cleans up without clearing selection", () => {
	for (const held of [false, true])
		for (const method of ["Escape", "touchcancel", "pointercancel", "blur", "resize"]) {
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
				else f.fire(method, ["blur", "resize"].includes(method) ? f.w : f.document);
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

test("selection: toolbar exit disables hit and focus immediately and stale exit cannot hide re-entry", async () => {
	const f = fixture();
	try {
		const animations: any[] = [];
		f.w.HTMLElement.prototype.animate = function (frames: any, options: any) {
			let finish: () => void;
			const animation = {
				frames,
				options,
				finished: new Promise<void>((resolve) => {
					finish = resolve;
				}),
				cancel() {},
				finish: () => finish(),
			};
			animations.push(animation);
			return animation;
		};
		const bar = f.document.getElementById("selection-bar");
		f.app.select("one");
		assert.equal(bar.hidden, false);
		assert.equal(bar.inert, false);
		assert.equal(f.document.getElementById("title-one").getAttribute("aria-pressed"), "true");
		assert.equal(f.document.getElementById("title-two").getAttribute("aria-pressed"), "false");
		animations[0].finish();
		await Promise.resolve();
		bar.querySelector("button").focus();
		f.app.action("clear-selection");
		assert.equal(bar.inert, true);
		assert.equal(bar.style.pointerEvents, "none");
		assert.equal(bar.getAttribute("aria-hidden"), "true");
		assert.equal(bar.contains(f.document.activeElement), false);
		assert.equal(bar.hidden, false);
		f.app.select("two");
		animations[1].finish();
		await Promise.resolve();
		assert.equal(bar.hidden, false);
		assert.equal(bar.inert, false);
		animations[2].finish();
		await Promise.resolve();
		f.app.action("clear-selection");
		animations[3].finish();
		await Promise.resolve();
		assert.equal(bar.hidden, true);
	} finally {
		f.dom.window.close();
	}
});

test("selection: search reuses gestures and toolbar with its own selected set", () => {
	const f = fixture();
	try {
		f.app.select("one");
		const before = f.state();
		f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>`;
		f.app.modalKind = "search";
		f.app.dialog.showModal();
		f.app.bindSearchSelection();
		const results = f.document.getElementById("search-results");
		assert.equal(results.querySelector(".is-selected"), null);
		const second = results.querySelector('[data-card="two"] p');
		f.fire("touchstart", second, { touches: [{ clientX: 120, clientY: 200 }] });
		f.hold();
		f.fire("touchend", second, { touches: [], changedTouches: [{ clientX: 120, clientY: 200 }] });
		assert.deepEqual(Array.from(f.app.searchSelected), ["two"]);
		assert.deepEqual(Array.from(f.app.homeSelected), ["one"]);
		assert.equal(f.app.drag.menu.open, false);
		assert.equal(
			results.querySelector('[data-card="two"]').classList.contains("is-selected"),
			true,
		);
		assert.equal(f.document.getElementById("search-selection-bar").hidden, false);
		assert.equal(
			f.document.getElementById("selection-bar").querySelector(".selection-count").textContent,
			"1",
		);
		f.app.drag.suppressUntil = 0;
		const third = results.querySelector('[data-card="three"] p');
		f.app.click({ target: third, preventDefault() {}, stopPropagation() {} });
		assert.deepEqual(Array.from(f.app.searchSelected), ["two", "three"]);
		assert.deepEqual(Array.from(f.app.homeSelected), ["one"]);
		f.app.action("clear-selection");
		assert.equal(f.app.searchSelected.size, 0);
		assert.equal(f.app.homeSelected.size, 1);
		assert.equal(f.state(), before);
		f.app.select("two");
		f.app.action("selected-bookmark");
		assert.equal(f.Store.item("two").bookmarked, true);
		assert.equal(f.Store.item("one").bookmarked, false);
		assert.equal(f.app.homeSelected.size, 1);
		f.app.modalKind = "";
		f.app.dialog.close();
		f.app.updateSelection();
		assert.deepEqual(f.selected(), ["one"]);
	} finally {
		f.dom.window.close();
	}
});

test("selection: dragging into AI receiver opens a local context window without changing cards", () => {
	for (const search of [false, true]) {
		const f = fixture();
		try {
			f.document
				.getElementById("selection-bar")
				.insertAdjacentHTML("beforeend", f.app.selectionAIHTML());
			if (search) {
				f.app.select("three");
				f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>`;
				f.app.modalKind = "search";
				f.app.dialog.showModal();
				f.app.bindSearchSelection();
			}
			f.app.select("one", { add: true });
			f.app.select("two", { add: true });
			const before = f.state();
			const context = f.app.selectionContext();
			const receiver = context.bar.querySelector(".selection-ai-target");
			receiver.getBoundingClientRect = () => ({
				left: 100,
				right: 300,
				top: 700,
				bottom: 748,
				width: 200,
				height: 48,
			});
			const source = context.grid.querySelector('[data-card="one"] p');
			f.fire("touchstart", source, { touches: [{ clientX: 120, clientY: 200 }] });
			f.hold();
			f.fire("touchmove", source, { touches: [{ clientX: 180, clientY: 720 }] });
			assert.equal(receiver.classList.contains("is-ready"), true);
			assert.equal(f.document.querySelector(".selection-drag-count").textContent, "2");
			f.fire("touchend", source, { touches: [], changedTouches: [{ clientX: 180, clientY: 720 }] });
			assert.deepEqual(Array.from(f.app.aiSelectionIds), ["one", "two"]);
			assert.equal(f.app.openedPanel.kind, "ai");
			assert.equal(receiver.classList.contains("is-ready"), false);
			assert.equal(f.document.querySelector(".selection-drag-count"), null);
			assert.equal(f.state(), before);
			if (search) assert.deepEqual(Array.from(f.app.homeSelected), ["three"]);
		} finally {
			f.dom.window.close();
		}
	}
});

test("selection: outside release and touch cancellation never open AI; keyboard alternative does", () => {
	for (const cancel of [false, true]) {
		const f = fixture();
		try {
			f.document
				.getElementById("selection-bar")
				.insertAdjacentHTML("beforeend", f.app.selectionAIHTML());
			const before = f.state();
			f.start();
			f.hold();
			f.move();
			if (cancel) f.fire("touchcancel");
			else f.release();
			assert.equal(f.app.openedPanel, undefined);
			assert.equal(f.document.querySelector(".selection-drag-count"), null);
			assert.equal(f.state(), before);
			f.app.action("selected-ai");
			assert.equal(f.app.openedPanel.kind, "ai");
			assert.deepEqual(Array.from(f.app.aiSelectionIds), ["one"]);
			assert.equal(f.state(), before);
		} finally {
			f.dom.window.close();
		}
	}
});
