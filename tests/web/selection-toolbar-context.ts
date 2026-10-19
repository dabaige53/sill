import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectionBar } from "../../apps/web/atoms/selection.tsx";

export async function registerToolbarContextTests({ fixture }: { fixture: any }) {
	test("selection: toolbar exit disables hit and focus immediately and stale exit cannot hide re-entry", async () => {
		const f = fixture();
		try {
			const animations: any[] = [];
			f.w.__motionAnimations = animations;
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
			f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>${renderToStaticMarkup(createElement(SelectionBar, { id: "search-selection-bar" }))}`;
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
			f.app.drag.suppressedClick = null;
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
					f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>${renderToStaticMarkup(createElement(SelectionBar, { id: "search-selection-bar" }))}`;
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
				f.fire("touchend", source, {
					touches: [],
					changedTouches: [{ clientX: 180, clientY: 720 }],
				});
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
}
