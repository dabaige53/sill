/** Search page ownership survives opening a card and returning. */
import assert from "node:assert/strict";

import { test } from "node:test";
import { fixture } from "./search-state-fixture.ts";

// @wu-test type=behavior | scope=phone search navigation | protects=Keep navigation unavailable during search editing and restore it when leaving
test("search editing keeps navigation hidden and inert across a card round trip", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.w.document.body.insertAdjacentHTML("beforeend", '<div id="dock"><nav id="nav"></nav></div>');
		const dock = f.w.document.getElementById("dock");
		f.app.setSearchEditing(true, undefined, false);
		const search = f.app.dialog;
		assert.equal(f.w.document.body.classList.contains("has-search-editing"), true);
		assert.equal(dock.inert, true);
		for (let round = 0; round < 2; round++) {
			f.app.suspendSearch();
			f.markOpenPage();
			assert.equal(f.w.document.body.classList.contains("has-search-editing"), true);
			assert.equal(dock.inert, true, "suspension preserves navigation ownership");
			f.app.dialog.innerHTML = '<h1 id="modal-title">Detail</h1>';
			f.app.modalKind = "preview";
			f.app.restoreSearch();
			assert.equal(f.app.dialog, search);
			assert.equal(f.w.document.body.classList.contains("has-search-editing"), true);
			assert.equal(dock.inert, true, "returning results still own navigation");
		}
		f.app.suspendSearch(false);
		f.app.dialog.className = "panel narrow page";
		f.app.dialog.innerHTML = '<h1 id="modal-title">AI</h1>';
		f.app.dialog.show();
		f.app.modalKind = "ai";
		f.markOpenPage();
		assert.equal(f.w.document.body.classList.contains("has-search-editing"), false);
		assert.equal(dock.inert, false, "the AI page can navigate back to retained search");
		f.app.restoreSearch();
		assert.equal(f.w.document.body.classList.contains("has-search-editing"), true);
		assert.equal(dock.inert, true);
		f.app.setSearchEditing(false, undefined, false);
		assert.equal(f.w.document.body.classList.contains("has-search-editing"), false);
		assert.equal(dock.inert, false, "cancelling search gives navigation back");
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=phone search suggestions | protects=Preserve empty-query suggestions when returning from a card
test("an empty editing search keeps its suggestions without the keyboard and under a card", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.app.setSearchEditing(true, undefined, true);
		const search = f.app.dialog;
		assert.equal(search.classList.contains("search-keyboard"), true);
		// Picking a suggestion closes the keyboard under the card; the page must not go empty.
		f.app.suspendSearch();
		assert.equal(search.classList.contains("search-keyboard"), true, "the card covers the list");
		f.app.dialog.innerHTML = '<h1 id="modal-title">Detail</h1>';
		f.app.modalKind = "preview";
		f.app.restoreSearch();
		assert.equal(search.classList.contains("search-keyboard"), true, "the list is back, not blank");
		f.app.searchFilter.query = "Alpha";
		f.app.repaintSearch();
		f.app.setSearchEditing(true, undefined, false);
		assert.equal(search.classList.contains("search-keyboard"), false, "typed text shows results");
		f.app.searchFilter.query = "";
		f.app.repaintSearch();
		f.app.setSearchEditing(false, undefined, false);
		assert.equal(search.classList.contains("search-keyboard"), false, "cancel closes the list");
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=phone category transition | protects=Keep category content visible and noninteractive during the transition | debt=impl-detail
test("a phone category leaves its grid as an inert copy instead of a blank page", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.app.action("search-category", "", "task");
		const copy = f.app.dialog.querySelector('.search-results[aria-hidden="true"]');
		assert.ok(copy, "the categories leave as a copy");
		assert.equal(copy.querySelectorAll(".search-category").length, 6);
		assert.equal(copy.querySelector("[id]"), null);
		// Editing hides .search-browse and :has(.search-browse) marks the categories page.
		assert.equal(f.app.dialog.querySelector(".search-browse"), null);
		assert.equal(copy.firstElementChild.className, "");
		assert.ok(copy.firstElementChild.style.display, "the copy keeps its drawn layout inline");
		assert.ok(f.app.dialog.querySelector("#search-results [data-card='b']"));
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=phone search keyboard layout | protects=Restore search without a stale keyboard offset | debt=impl-detail
test("search returning from a card reads the keyboard height again", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.w.visualViewport = { height: f.w.innerHeight, offsetTop: 0 };
		f.app.suspendSearch();
		const search = f.app.searchBackground;
		search.style.setProperty("--kb", "434px");
		f.app.dialog.innerHTML = '<h1 id="modal-title">Detail</h1>';
		f.app.modalKind = "preview";
		f.app.restoreSearch();
		assert.equal(search.style.getPropertyValue("--kb"), "0px");
	} finally {
		f.dom.window.close();
	}
});
