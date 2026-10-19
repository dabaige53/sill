/** Independent navigation projections over one synthetic card store. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export { AppController } from './apps/web/views/app.ts'; export { Store } from './apps/web/data/store.ts'; export { Panels } from './apps/web/interactions/panels.ts'; export { cardHTML } from './apps/web/cards/templates.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SearchTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM('<!doctype html><div id="feed-grid"></div><dialog id="modal"></dialog>', {
		url: "https://search.test/#search",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.structuredClone = structuredClone;
	w.matchMedia = () => ({ matches: true, addEventListener() {} });
	w.CSS = { escape: (value: string) => value };
	w.HTMLDialogElement.prototype.show = function () {
		this.open = true;
	};
	w.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.show;
	w.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { AppController, Store, Panels, cardHTML } = w.SearchTest;
	Store.state = {
		cards: [
			{ id: "a", type: "article", title: "Alpha", body: ["Article"], time: Date.now() },
			{
				id: "b",
				type: "task",
				title: "Beta",
				tasks: [{ id: "one", text: "Task" }],
				time: Date.now(),
			},
			{ id: "old", type: "article", title: "Archived Alpha", body: ["Article"], time: Date.now() },
		],
		items: { old: { archived: true } },
		preferences: {},
	};
	Store.save = () => {};
	const app = new AppController();
	app.grid = w.document.getElementById("feed-grid");
	app.dialog = w.document.getElementById("modal");
	app.dialog.className = "search page";
	app.dialog.innerHTML = Panels.search(app);
	app.dialog.show();
	app.modalKind = "search";
	app.setNav = (key: string) => (app.navKey = key);
	app.revealImages = () => {};
	app.layout = { schedule() {}, layout() {} };
	app.updateFilterIndicator = () => {};
	app.pageLimit = 40;
	app.updateSelection = () => {};
	app.grid.innerHTML = Store.state.cards.map((c) => cardHTML(c)).join("");
	return { dom, w, app, Store, Panels };
}

test("search filters all shelves independently of the home projection", () => {
	const f = fixture();
	try {
		const home = JSON.stringify(f.app.filtered());
		f.app.searchFilter.query = "Alpha";
		assert.equal(f.app.searchAll("Alpha").desk.length, 1);
		assert.equal(f.app.searchAll("Alpha").shelved.length, 1);
		f.app.searchFilter.type = "task";
		assert.equal(f.app.searchAll("Alpha").desk.length, 0);
		assert.equal(JSON.stringify(f.app.filtered()), home);
		assert.equal(f.app.filter.query, "");
		f.app.filter.type = "article";
		f.app.searchFilter.query = "";
		assert.equal(f.app.searchAll("").desk[0].id, "b");
	} finally {
		f.dom.window.close();
	}
});

test("Escape clears only search selection before a second Escape leaves the search page", () => {
	const f = fixture();
	try {
		f.app.homeSelected.add("b");
		f.app.searchSelected.add("a");
		f.app.closeNative = () => {
			f.app.dialog.close();
			f.app.modalKind = "";
		};
		const pressEscape = () =>
			f.app.key({
				key: "Escape",
				target: f.app.dialog.querySelector("#filter-search"),
				preventDefault() {},
			});
		pressEscape();
		assert.equal(f.app.dialog.open, true, "first Escape keeps the search page open");
		assert.equal(f.app.modalKind, "search");
		assert.equal(f.w.location.hash, "#search");
		assert.deepEqual([...f.app.searchSelected], []);
		assert.deepEqual([...f.app.homeSelected], ["b"]);
		pressEscape();
		assert.equal(f.app.dialog.open, false);
		assert.equal(f.w.location.hash, "#feed");
		assert.deepEqual([...f.app.homeSelected], ["b"]);
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
			f.app.pauseMedia = () => {};
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

test("home and search render the same shared completion and reading state", () => {
	const f = fixture();
	try {
		f.app.mode = "test";
		f.app.suspendSearch();
		const results = f.app.searchBackground.querySelector("#search-results");
		results.scrollTop = 130;
		f.Store.patch("a", { read: true, progress: 1 });
		f.Store.patch("b", { taskDone: ["one"] });
		for (const id of ["a", "b"]) f.app.refreshCard(id);
		for (const root of [f.app.grid, results]) {
			assert.ok(root.querySelector('[data-card="a"]').classList.contains("is-read"));
			assert.ok(root.querySelector('[data-card="b"]').classList.contains("is-complete"));
		}
		assert.equal(results.scrollTop, 130);
		assert.equal(f.Store.state.cards.length, 3);
	} finally {
		f.dom.window.close();
	}
});

test("AI preview returns to the same search through Escape or the search tab", () => {
	for (const exit of ["Escape", "tab"]) {
		const f = fixture();
		try {
			const results = f.app.dialog.querySelector("#search-results");
			results.scrollTop = 240;
			f.app.suspendSearch();
			f.app.modalKind = "ai";
			f.app.dialog.className = "page";
			f.app.dialog.innerHTML = f.Panels.ai(f.app);
			f.app.dialog.show();
			f.app.closeNative = () => {
				f.app.dialog.close();
				f.app.restoreSearch();
			};
			if (exit === "tab") f.app.goTo("search");
			else f.app.key({ key: "Escape", target: f.app.dialog, preventDefault() {} });
			assert.equal(f.app.modalKind, "search");
			assert.equal(f.app.dialog.querySelector("#search-results"), results);
			assert.equal(results.scrollTop, 240);
		} finally {
			f.dom.window.close();
		}
	}
});

test("leaving the search route closes an AI preview as well as its retained background", () => {
	const f = fixture();
	try {
		f.app.suspendSearch();
		f.app.modalKind = "ai";
		f.app.mode = "feed";
		let closed = 0;
		f.app.closeNative = () => {
			closed++;
		};
		f.w.history.replaceState({}, "", "#feed");
		f.app.route(true);
		assert.equal(closed, 1);
		assert.equal(f.app.searchBackground, undefined);
	} finally {
		f.dom.window.close();
	}
});

test("shared card refresh keeps each surface's independent selection decoration", () => {
	const f = fixture();
	try {
		f.app.homeSelected.add("a");
		f.app.searchSelected.add("b");
		f.app.mode = "test";
		f.Store.patch("a", { read: true });
		f.app.refreshCard("a");
		assert.equal(
			f.app.grid.querySelector('[data-card="a"]').classList.contains("is-selected"),
			true,
		);
		assert.equal(
			f.app.dialog.querySelector('[data-card="a"]').classList.contains("is-selected"),
			false,
		);
		f.Store.patch("b", { bookmarked: true });
		f.app.refreshCard("b");
		assert.equal(
			f.app.grid.querySelector('[data-card="b"]').classList.contains("is-selected"),
			false,
		);
		assert.equal(
			f.app.dialog.querySelector('[data-card="b"]').classList.contains("is-selected"),
			true,
		);
	} finally {
		f.dom.window.close();
	}
});

test("search rows name independent groups and omit the empty tag row", () => {
	const f = fixture();
	try {
		const groups = f.app.dialog.querySelectorAll('.search-filter-items[role="group"]');
		assert.deepEqual(
			[...groups].map((n) => n.getAttribute("aria-label")),
			["类型", "状态"],
		);
		assert.equal(f.app.dialog.querySelectorAll('[data-action="filter-type"]').length, 7);
		assert.equal(f.app.dialog.querySelectorAll('[data-action="filter-status"]').length, 3);
		f.Store.state.cards[0].tags = ["<draft>"];
		f.app.repaintSearch();
		const tags = f.app.dialog.querySelector('.search-filter-items[aria-label="标签"]');
		assert.equal(tags.querySelector("button").textContent, "#<draft>");
		assert.equal(tags.querySelector("draft"), null, "tag text is escaped");
	} finally {
		f.dom.window.close();
	}
});

test("search repaint retains each row scroll and the focused condition", () => {
	const f = fixture();
	try {
		f.Store.state.cards[0].tags = ["评审"];
		f.app.repaintSearch();
		const rows = [...f.app.dialog.querySelectorAll(".search-filter-items")];
		rows.forEach((n, index) => {
			n.scrollLeft = (index + 1) * 30;
		});
		f.app.dialog.querySelector('[data-action="filter-tag"]').focus();
		f.app.repaintSearch();
		assert.deepEqual(
			[...f.app.dialog.querySelectorAll(".search-filter-items")].map((n) => n.scrollLeft),
			[30, 60, 90],
		);
		assert.equal(f.w.document.activeElement.dataset.action, "filter-tag");
		assert.equal(f.w.document.activeElement.dataset.extra, "评审");
	} finally {
		f.dom.window.close();
	}
});

test("switching away flushes pending search before retaining results", () => {
	const f = fixture();
	try {
		f.app.searchFilter.query = "Alpha";
		f.app.searchTimer = f.w.setTimeout(() => {}, 1000);
		f.app.suspendSearch();
		assert.equal(f.app.searchBackground.querySelectorAll("[data-card]").length, 2);
		assert.equal(f.app.searchTimer, 0);
		f.app.restoreSearch();
		assert.equal(f.app.dialog.querySelectorAll("[data-card]").length, 2);
	} finally {
		f.dom.window.close();
	}
});

test("repeated close requests on a stacked card only move back one history entry", () => {
	const f = fixture();
	try {
		f.app.modalKind = "preview";
		f.app.previewTrail = ["a"];
		f.w.history.replaceState({ prev: "#card/a" }, "", "#card/b");
		let backs = 0;
		f.w.history.back = () => {
			backs++;
		};
		f.app.closeModal();
		f.app.closeModal();
		assert.equal(backs, 1);
		assert.equal(f.app.dialog.open, true);
		assert.equal(f.app.previewTrail.length, 1);
	} finally {
		f.dom.window.close();
	}
});
