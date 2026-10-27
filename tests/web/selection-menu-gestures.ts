import assert from "node:assert/strict";
import { test } from "node:test";

export async function registerMenuGestureTests({ fixture }: { fixture: any }) {
	test("selection: cancelled menu shortcuts and action names do not open product menus", () => {
		const f = fixture();
		try {
			f.selectTwo();
			const before = f.state();
			f.document.addEventListener("keydown", (event) => f.app.key(event));
			for (const target of [
				f.source(),
				f.document.querySelector('[data-action="selected-bookmark"]'),
			]) {
				for (const shortcut of [{ key: "ContextMenu" }, { key: "F10", shiftKey: true }]) {
					const event = new f.w.KeyboardEvent("keydown", {
						...shortcut,
						bubbles: true,
						cancelable: true,
					});
					target.dispatchEvent(event);
					assert.equal(event.defaultPrevented, false);
				}
				f.fire("contextmenu", target);
			}
			f.app.action("card-more", "one");
			f.app.action("selection-menu");
			assert.equal(f.document.querySelector("#selection-menu,.card-more-menu"), null);
			assert.deepEqual(f.selected(), ["one", "two"]);
			assert.equal(f.state(), before);
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
			assert.equal(f.document.getElementById("selection-menu"), null);
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
				assert.equal(f.document.getElementById("selection-menu"), null);
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
			f.start();
			f.hold();
			f.move();
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
			check(f.document.querySelector(".selection-drag-preview .selection-stack"));
			assert.equal(source.innerHTML, original, "sanitizing the clone changed the live card");
			assert.equal(f.document.querySelectorAll("#title-one").length, 1);
			assert.equal(f.document.querySelectorAll("#original-controls").length, 1);
			assert.equal(f.state(), before);
		} finally {
			f.dom.window.close();
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
					assert.equal(f.document.getElementById("selection-menu"), null, method);
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
				f.selectTwo();
				f.document.addEventListener("click", (event) => f.app.click(event));
				assert.equal(f.state(), before);
				f.document.querySelector(`[data-action="selected-${action}"]`).click();
				assert.equal(f.document.getElementById("selection-menu"), null);
				assert.deepEqual(f.selected(), ["one", "two"]);
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

	test("selection: native drag is cancelled before any transferable content is created", () => {
		const f = fixture();
		try {
			const before = f.state();
			const event = f.fire("dragstart", f.source());
			assert.equal(event.defaultPrevented, true);
			assert.equal(f.state(), before);
			assert.equal(f.document.getElementById("selection-menu"), null);
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
