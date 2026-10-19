import assert from "node:assert/strict";
import { test } from "node:test";

export async function registerMenuGestureTests({ fixture }: { fixture: any }) {
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
				if (method === "cancel")
					f.document.querySelector('[data-selection-action="cancel"]').click();
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
}
