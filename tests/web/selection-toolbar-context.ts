import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectionBar } from "../../apps/web/atoms/selection.tsx";

export async function registerToolbarContextTests({ fixture }: { fixture: any }) {
	test("selection: phone search hands the navigation rail back when the surface changes", () => {
		const f = fixture();
		try {
			f.document.documentElement.dataset.inputModality = "keyboard";
			f.app.desktop = () => false;
			const nav = f.document.createElement("nav");
			nav.id = "nav";
			f.document.body.append(nav);
			f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>${renderToStaticMarkup(createElement(SelectionBar, { id: "search-selection-bar" }))}`;
			f.app.modalKind = "search";
			f.app.searchSelected.add("one");
			f.app.updateSelection();
			assert.equal(nav.inert, true);
			assert.equal(nav.style.visibility, "hidden");
			f.app.modalKind = "";
			f.app.homeSelected.clear();
			f.app.updateSelection();
			assert.equal(nav.inert, false);
			assert.equal(nav.style.visibility, "visible");
		} finally {
			f.dom.window.close();
		}
	});

	test("selection: an entirely bookmarked selection shows active and can be unbookmarked together", () => {
		for (const search of [false, true]) {
			const f = fixture();
			try {
				if (search) {
					f.app.dialog.innerHTML = `<div id="search-results">${f.app.grid.innerHTML}</div>${renderToStaticMarkup(createElement(SelectionBar, { id: "search-selection-bar" }))}`;
					f.app.modalKind = "search";
					f.app.dialog.showModal();
				}
				f.Store.patch("one", { bookmarked: true });
				f.Store.patch("two", { bookmarked: true });
				f.selectTwo();
				const button = f.app
					.selectionContext()
					.bar.querySelector('[data-action="selected-bookmark"]');
				assert.equal(button.classList.contains("active"), true);
				assert.equal(button.getAttribute("aria-pressed"), "true");
				assert.match(button.getAttribute("aria-label"), /取消收藏/);
				f.app.action("selected-bookmark");
				assert.equal(f.Store.item("one").bookmarked, false);
				assert.equal(f.Store.item("two").bookmarked, false);
				assert.equal(f.selected().length, 2);
				assert.equal(f.app.selectionContext().bar.hidden, false);
				assert.equal(button.classList.contains("active"), false);
				// A mixed selection keeps the existing add-to-bookmarks behavior.
				f.Store.patch("one", { bookmarked: true });
				f.selectTwo();
				assert.equal(button.classList.contains("active"), false);
				f.app.action("selected-bookmark");
				assert.equal(f.Store.item("one").bookmarked, true);
				assert.equal(f.Store.item("two").bookmarked, true);
			} finally {
				f.dom.window.close();
			}
		}
	});

	test("selection: later and tag actions retain the selected cards and toolbar", () => {
		const f = fixture();
		try {
			f.selectTwo();
			f.app.action("selected-later");
			assert.deepEqual(f.selected(), ["one", "two"]);
			assert.equal(f.Store.item("one").later, true);
			assert.equal(f.document.getElementById("selection-bar").hidden, false);
			const later = f.document.querySelector('[data-action="selected-later"]');
			assert.equal(later.getAttribute("aria-pressed"), "true");
			assert.equal(later.classList.contains("active"), true);
			f.app.action("selected-later");
			assert.equal(f.Store.item("one").later, false);
			assert.equal(f.Store.item("two").later, false);
			assert.equal(later.getAttribute("aria-pressed"), "false");
			f.Store.patch("one", { later: true });
			f.app.action("selected-later");
			assert.equal(f.Store.item("one").later, true);
			assert.equal(f.Store.item("two").later, true);
			f.app.action("selected-tag");
			assert.deepEqual(f.selected(), ["one", "two"]);
			assert.equal(f.app.openedPanel.kind, "editor");
			assert.equal(f.document.getElementById("selection-bar").hidden, false);
		} finally {
			f.dom.window.close();
		}
	});

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
			assert.equal(f.document.getElementById("selection-menu"), null);
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

	test("selection: desktop rail becomes AI only after movement and restores on cancel", () => {
		const f = fixture();
		try {
			f.app.desktop = () => true;
			const dock = f.document.createElement("div");
			dock.id = "dock";
			dock.innerHTML = '<div id="ai-dock"><input id="ai-dock-input"></div>';
			f.document.body.append(dock);
			const source = f.app.grid.querySelector('[data-card="one"] p');
			f.fire("touchstart", source, { touches: [{ clientX: 120, clientY: 200 }] });
			f.hold();
			assert.equal(dock.classList.contains("is-ai-drag"), false);
			f.fire("touchmove", source, { touches: [{ clientX: 180, clientY: 300 }] });
			assert.equal(dock.classList.contains("is-ai-drag"), true);
			f.fire("touchcancel");
			assert.equal(dock.classList.contains("is-ai-drag"), false);
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
				assert.equal(receiver.hidden, true, "selection alone does not show the AI receiver");
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
				assert.equal(receiver.hidden, false, "carrying cards exposes the AI drop target");
				assert.equal(context.bar.classList.contains("is-ai-receiving"), true);
				assert.ok(receiver.querySelector("input.selection-ai-input"));
				assert.equal(receiver.classList.contains("is-ready"), true);
				assert.equal(
					f.document.querySelector(".selection-drag-preview .selection-stack-count").textContent,
					"2",
				);
				f.fire("touchend", source, {
					touches: [],
					changedTouches: [{ clientX: 180, clientY: 720 }],
				});
				assert.deepEqual(Array.from(f.app.aiSelectionIds), ["one", "two"]);
				assert.equal(context.bar.classList.contains("is-ai-receiving"), false);
				assert.equal(f.app.openedPanel.kind, "ai");
				assert.equal(receiver.classList.contains("is-ready"), false);
				assert.equal(receiver.hidden, true, "the receiver leaves after the drag");
				assert.equal(f.document.querySelector(".selection-drag-preview"), null);
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
				const receiver = f.document.querySelector(".selection-ai-target");
				assert.equal(receiver.hidden, false);
				if (cancel) f.fire("touchcancel");
				else f.release();
				assert.equal(f.app.openedPanel, undefined);
				assert.equal(receiver.hidden, true);
				assert.equal(f.document.querySelector(".selection-drag-preview"), null);
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
