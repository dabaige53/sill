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
