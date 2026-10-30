/** Search page ownership survives opening a card and returning. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fixture } from "./search-state-fixture.ts";

test("the home heading stays hidden while a search detail is open", () => {
	const f = fixture();
	try {
		const heading = f.w.document.createElement("header");
		heading.className = "home-top";
		f.w.document.body.prepend(heading);
		const selectors = ["form-controls.css", "phone.css"].map((file) => {
			const css = readFileSync(`apps/web/styles/${file}`, "utf8");
			return css.match(/body\.has-open-page \.home-top(?= \{)/)?.[0];
		});
		// The app's dialog observer marks the page; the test marks after each step instead.
		const hidden = () => {
			f.markOpenPage();
			for (const selector of selectors) {
				assert.ok(selector);
				assert.ok(heading.matches(selector));
			}
		};
		hidden();
		f.app.suspendSearch();
		f.app.dialog.className = "preview";
		f.app.dialog.showModal();
		hidden();
		f.app.restoreSearch();
		hidden();
		f.app.dialog.close();
		f.markOpenPage();
		for (const selector of selectors) assert.equal(heading.matches(selector), false);
	} finally {
		f.dom.window.close();
	}
});

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

test("a card drawer retains the exact search nodes, query, scroll and focus", () => {
	const f = fixture();
	try {
		f.app.searchFilter.query = "Alpha";
		f.app.dialog.innerHTML = f.Panels.search(f.app);
		const results = f.app.dialog.querySelector("#search-results");
		const title = results.querySelector(".card-title-button");
		title.focus();
		results.scrollTop = 330;
		f.app.suspendSearch();
		assert.equal(f.app.searchBackground.querySelector("#search-results"), results);
		assert.equal(results.scrollTop, 330);
		assert.equal(f.app.searchBackground.querySelector("#modal-title"), null);
		f.app.dialog.innerHTML = '<h1 id="modal-title">Detail</h1>';
		f.app.modalKind = "preview";
		f.app.restoreSearch();
		assert.equal(f.app.dialog.querySelector("#search-results"), results);
		assert.equal(results.scrollTop, 330);
		assert.equal(f.app.dialog.querySelector("#filter-search").value, "Alpha");
		assert.equal(f.w.document.activeElement, title);
		assert.equal(f.app.modalKind, "search");
		assert.equal(f.app.navKey, "search");
		assert.equal(f.w.document.querySelector("#search-background"), null);
	} finally {
		f.dom.window.close();
	}
});

for (const action of ["snooze", "dismiss-reminder", "complete-reminder", "restore-reminder"])
	test(`${action} from a search detail restores the search route and retained results`, () => {
		const f = fixture();
		try {
			f.app.searchFilter.query = "Beta";
			f.app.dialog.innerHTML = f.Panels.search(f.app);
			const results = f.app.dialog.querySelector("#search-results");
			results.scrollTop = 120;
			f.app.suspendSearch();
			f.app.dialog.innerHTML = '<h1 id="modal-title">Task detail</h1>';
			f.app.modalKind = "preview";
			f.app.currentId = "b";
			f.app.dialog.show();
			f.w.history.replaceState({ glass: true, prev: "#search" }, "", "#card/b");
			f.app.lastRouteHash = "#card/b";
			f.w.HTMLElement.prototype.getAnimations = () => [];
			f.app.withFeedAnchor = () => {};
			f.app.checkReminders = () => {};
			f.app.toast = () => {};
			f.app.changeReminder("b", action);
			assert.equal(f.w.location.hash, "#search");
			assert.equal(f.app.lastRouteHash, "#search");
			assert.equal(f.app.modalKind, "search");
			assert.equal(f.app.dialog.open, true);
			assert.equal(f.app.dialog.querySelector("#search-results"), results);
			assert.equal(results.scrollTop, 120);
			assert.equal(f.app.dialog.querySelector("#filter-search").value, "Beta");
			assert.equal(f.app.searchBackground, undefined);
		} finally {
			f.dom.window.close();
		}
	});

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
