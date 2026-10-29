/** Independent navigation projections over one synthetic card store. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fixture } from "./search-state-fixture.ts";

test("a category card becomes an ink token and leaves the home filter alone", () => {
	const f = fixture();
	try {
		const home = JSON.stringify(f.app.filter);
		assert.equal(f.app.dialog.querySelectorAll(".search-category").length, 6);
		assert.equal(f.app.dialog.querySelector(".search-refinements"), null, "no filter row");
		f.app.action("search-category", "", "task");
		assert.equal(f.app.dialog.querySelector(".search-browse"), null);
		const token = f.app.dialog.querySelector(".search-token");
		assert.equal(token.textContent, "待办");
		assert.equal(token.classList.contains("is-hash"), false);
		assert.equal(
			f.app.dialog.querySelector(".search-chips"),
			null,
			"no type chips beside a category",
		);
		assert.deepEqual(
			[...f.app.dialog.querySelectorAll("#search-results [data-card]")].map(
				(card: HTMLElement) => card.dataset.card,
			),
			["b"],
		);
		assert.equal(JSON.stringify(f.app.filter), home);
		f.app.action("search-untoken", "", "type");
		assert.equal(f.app.dialog.querySelectorAll(".search-category").length, 6);
		assert.equal(f.app.dialog.querySelector(".search-token"), null);
	} finally {
		f.dom.window.close();
	}
});
test("Tab reaches the collapsed search refinements", () => {
	const f = fixture();
	try {
		f.app.dialog.innerHTML =
			'<input id="filter-search"><details><summary>筛选</summary><button>收藏</button></details>';
		f.w.HTMLElement.prototype.getClientRects = () => [{}];
		const input = f.app.dialog.querySelector("input");
		input.focus();
		f.app.key({ key: "Tab", target: input, preventDefault() {} });
		assert.equal(f.w.document.activeElement.tagName, "SUMMARY");
	} finally {
		f.dom.window.close();
	}
});

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

test("completing a reminder retains its detail and search until the user closes it", () => {
	const f = fixture();
	try {
		const reminder = { id: "b", type: "reminder", title: "Beta", body: "Reminder detail" };
		f.Store.state.cards[1] = reminder;
		f.app.searchFilter.query = "Beta";
		f.app.dialog.innerHTML = f.Panels.search(f.app);
		const results = f.app.dialog.querySelector("#search-results");
		results.scrollTop = 120;
		f.app.suspendSearch();
		const background = f.app.searchBackground;
		f.app.dialog.innerHTML = f.Panels.preview(f.app, reminder);
		f.app.modalKind = "preview";
		f.app.currentId = "b";
		f.app.dialog.show();
		f.w.history.replaceState({ glass: true, prev: "#search" }, "", "#card/b");
		f.app.lastRouteHash = "#card/b";
		f.w.HTMLElement.prototype.getAnimations = () => [];
		f.app.withFeedAnchor = () => {};
		f.app.checkReminders = () => {};
		const button = f.app.dialog.querySelector(".reminder-check");
		button.focus();

		f.app.action("complete-reminder", "b");

		assert.equal(f.Store.item("b").reminderDone, true);
		assert.equal(f.app.modalKind, "preview");
		assert.equal(f.app.dialog.open, true);
		assert.equal(f.w.location.hash, "#card/b");
		assert.equal(f.app.lastRouteHash, "#card/b");
		assert.equal(f.app.searchBackground, background);
		assert.equal(background.querySelector("#search-results"), results);
		assert.equal(results.scrollTop, 120);
		assert.equal(f.w.document.activeElement, button);

		f.app.closeToDesk(false);

		assert.equal(f.w.location.hash, "#search");
		assert.equal(f.app.modalKind, "search");
		assert.equal(f.app.dialog.querySelector("#search-results"), results);
		assert.equal(results.scrollTop, 120);
		assert.equal(f.app.dialog.querySelector("#filter-search").value, "Beta");
	} finally {
		f.dom.window.close();
	}
});

test("home and search render the same shared completion and reading state", () => {
	const f = fixture();
	try {
		f.app.searchFilter.query = "a";
		f.app.dialog.innerHTML = f.Panels.search(f.app);
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
		f.app.searchFilter.query = "a";
		f.app.dialog.innerHTML = f.Panels.search(f.app);
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

test("# lists statuses then existing tags; a pick becomes an escaped accent token", () => {
	const f = fixture();
	try {
		f.Store.state.cards[0].tags = ["<draft>"];
		f.app.searchFilter.query = "Alpha #";
		f.app.repaintSearch();
		const list = f.app.dialog.querySelector(".search-hash");
		assert.deepEqual(
			[...list.querySelectorAll(".search-hash-label")].map((n: HTMLElement) => n.textContent),
			["状态", "标签"],
		);
		assert.deepEqual(
			[...list.querySelectorAll(".search-hash-option")].map((n: HTMLElement) => n.textContent),
			["未读", "收藏", "稍后读", "#<draft>"],
		);
		assert.equal(list.querySelector("draft"), null, "tag text is escaped");
		assert.equal(
			f.app.searchText(f.app.searchFilter.query),
			"Alpha",
			"the # fragment is not searched",
		);
		f.app.action("search-hash", "", "tag:<draft>");
		assert.equal(f.app.searchFilter.tag, "<draft>");
		assert.equal(f.app.searchFilter.query, "Alpha");
		const token = f.app.dialog.querySelector(".search-token.is-hash");
		assert.equal(token.textContent, "#<draft>");
		assert.equal(f.app.dialog.querySelector(".search-hash"), null);
	} finally {
		f.dom.window.close();
	}
});
test("phone # replaces the card suggestions with statuses and tags, in place", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.Store.state.cards[0].tags = ["work"];
		f.app.searchFilter.query = "#";
		f.app.repaintSearch();
		const suggest = f.app.dialog.querySelector("#search-suggest");
		assert.equal(suggest.querySelector(".search-suggest-option"), null, "no card rows under #");
		assert.ok(suggest.querySelector('.search-hash-option[data-extra="tag:work"]'));
		assert.equal(f.app.dialog.querySelectorAll(".search-hash").length, 1, "one list, not a floating copy");
		f.app.action("search-hash", "", "tag:work");
		assert.equal(f.app.dialog.querySelector(".search-hash"), null);
	} finally {
		f.dom.window.close();
	}
});
test("type chips follow text only; Backspace on an empty field removes tokens from the end", () => {
	const f = fixture();
	try {
		assert.equal(f.app.dialog.querySelector(".search-chips").hidden, true);
		f.app.searchFilter.query = "Alpha";
		f.app.repaintSearch();
		const chips = f.app.dialog.querySelector(".search-chips");
		assert.equal(chips.hidden, false);
		assert.equal(chips.querySelectorAll('[data-action="filter-type"]').length, 7);
		chips.querySelector('[data-extra="article"]').focus();
		f.app.action("filter-type", "", "article");
		assert.equal(
			f.w.document.activeElement.dataset.extra,
			"article",
			"repaint keeps the chip focused",
		);
		assert.equal(f.app.dialog.querySelector(".search-token"), null, "a chip is not a token");
		f.app.searchFilter = { type: "task", status: "unread", tag: "", query: "", pinned: true };
		f.app.repaintSearch();
		const input = f.app.dialog.querySelector("#filter-search");
		input.focus();
		input.setSelectionRange(0, 0);
		f.app.key({ key: "Backspace", target: input, preventDefault() {} });
		assert.equal(f.app.searchFilter.status, "all");
		assert.equal(f.app.searchFilter.type, "task");
		f.app.key({
			key: "Backspace",
			target: f.app.dialog.querySelector("#filter-search"),
			preventDefault() {},
		});
		assert.equal(f.app.searchFilter.type, "all");
		assert.equal(f.app.searchFilter.pinned, false);
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

test("open panels keep home menu and search shortcuts from consuming keys", () => {
	const f = fixture();
	try {
		f.w.document.body.insertAdjacentHTML(
			"beforeend",
			'<input id="home-search" value="Alpha"><div id="home-menu"></div>',
		);
		f.app.desktop = () => true;
		f.app.homeMenuOpen = true;
		let actions = 0;
		f.app.action = () => {
			actions++;
		};
		for (const key of ["Escape", "ArrowDown", "k", "1"]) {
			let prevented = false;
			assert.equal(
				f.app.homeKey({
					key,
					metaKey: key === "k" || key === "1",
					target: f.w.document.getElementById("home-search"),
					preventDefault() {
						prevented = true;
					},
				}),
				false,
			);
			assert.equal(prevented, false);
		}
		assert.equal(actions, 0);
		assert.equal(f.w.document.getElementById("home-search").value, "Alpha");
	} finally {
		f.dom.window.close();
	}
});

/** Desktop top-bar search: tab token, # conditions and type chips share the home filter. */

test("phone search retains its field on filter updates, suggests the cards it finds, and returns to browse", () => {
	const f = fixture();
	try {
		f.app.desktop = () => false;
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.app.repaintSearch();
		const input = f.app.dialog.querySelector("#filter-search");
		input.focus();
		f.app.setSearchEditing(true);
		assert.equal(f.app.dialog.classList.contains("search-editing"), true);
		f.app.searchFilter.query = "Alpha";
		f.app.repaintSearch();
		assert.equal(f.app.dialog.querySelector("#filter-search"), input);
		assert.equal(f.w.document.activeElement, input);
		assert.equal(input.value, "Alpha");
		const suggested = [...f.app.dialog.querySelectorAll("#search-suggest [role=option]")];
		assert.ok(suggested.length, "while typing, the phone suggests cards");
		assert.ok(
			suggested.every((n: any) => n.dataset.action === "card-open" && n.dataset.id),
			"each suggestion opens its card",
		);
		assert.equal(
			f.app.dialog.querySelector('[data-action="search-history"]'),
			null,
			"no search history",
		);
		assert.equal(f.app.dialog.querySelector(".search-cancel").textContent, "取消");
		f.app.action("search-reset");
		assert.equal(f.app.dialog.classList.contains("search-editing"), false);
		assert.equal(input.value, "");
	} finally {
		f.dom.window.close();
	}
});

test("unbookmarking an open favorite retains its source until the detail closes", async () => {
	const f = fixture();
	try {
		f.app.searchBackground = null;
		f.app.modalKind = "preview";
		f.app.currentId = "a";
		f.app.filter.status = "saved";
		f.Store.patch("a", { bookmarked: true });
		f.Store.patch("b", { bookmarked: true });
		f.app.renderCurrent();
		f.app.dialog.innerHTML =
			'<div class="preview-sheet"><button data-id="a" data-action="bookmark">Saved</button></div><div class="float-bar"></div>';
		const sheet = f.app.dialog.querySelector(".preview-sheet");
		const tools = f.app.dialog.querySelector(".float-bar");
		assert.ok(f.app.grid.querySelector('[data-card="a"]'));
		f.app.setFlag("a", "bookmarked", false);
		assert.ok(
			f.app.grid.querySelector('[data-card="a"]'),
			"background stays stable while detail is open",
		);
		assert.ok(f.app.grid.querySelector('[data-card="b"]'));
		assert.equal(f.app.dialog.querySelector(".preview-sheet"), sheet);
		assert.equal(f.app.dialog.querySelector(".float-bar"), tools);
		assert.equal(f.app.dialog.open, true);
		assert.ok(f.Store.card("a"), "only its membership in favorites changes");
		f.app.dialog.getAnimations = () => [];
		f.w.document.body.insertAdjacentHTML("beforeend", '<button id="account">Account</button>');
		f.app.closeToDesk(false);
		// The redraw waits until the restored page has settled.
		await new Promise((resolve) => f.w.setTimeout(resolve, 400));
		assert.equal(
			!!f.app.grid.querySelector('[data-card="a"]'),
			false,
			"the background updates after close",
		);
		assert.ok(f.app.grid.querySelector('[data-card="b"]'));
	} finally {
		f.dom.window.close();
	}
});
