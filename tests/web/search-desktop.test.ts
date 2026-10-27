/** Independent navigation projections over one synthetic card store. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./search-state-fixture.ts";

function desktopFixture() {
	const f = fixture();
	f.Store.state.cards.push(
		{
			id: "m",
			type: "mail",
			title: "Alpha mail",
			body: "Mail",
			tags: ["Work"],
			time: Date.now(),
		},
		{ id: "n", type: "note", title: "Gamma", body: "Note", tags: ["Work"], time: Date.now() },
	);
	f.Store.state.items = { ...f.Store.state.items, m: { bookmarked: true } };
	f.w.document.body.insertAdjacentHTML(
		"beforeend",
		`<header><div class="home-search" id="home-search-field">
			<button id="home-search-token" hidden></button>
			<span id="home-search-marks"></span>
			<input id="home-search" data-input="home-search">
			<button class="home-search-clear" hidden></button>
			<div id="home-hash-slot"></div>
		</div><div id="home-kinds" hidden></div></header><div id="dock"></div>`,
	);
	// The real render path repaints the top bar after every change.
	delete f.app.updateFilterIndicator;
	f.app.desktop = () => true;
	f.app.modalKind = "";
	f.app.dialog.open = false;
	f.app.railHide = { syncPosition() {}, show() {} };
	f.w.scrollTo = () => {};
	const input = f.w.document.getElementById("home-search");
	input.addEventListener("focus", () => f.app.openHomeSearch(true));
	input.addEventListener("blur", () => f.app.openHomeSearch(false));
	const type = (value: string) => {
		input.value = value;
		f.app.input({ target: input });
	};
	const key = (name: string) => f.app.homeKey({ key: name, target: input, preventDefault() {} });
	return { ...f, input, type, key };
}

test("desktop search: text ending in # lists statuses and tags, and picking one becomes a token", () => {
	const f = desktopFixture();
	try {
		f.input.focus();
		f.type("Alpha #");
		const options = [...f.w.document.querySelectorAll("#home-hash .search-hash-option")].map(
			(n: any) => n.dataset.extra,
		);
		assert.deepEqual(options, ["status:unread", "status:saved", "status:later", "tag:Work"]);
		// The # fragment never filters the text; searching reaches put-away cards too.
		assert.deepEqual(
			f.app.filtered().map((c: any) => c.id),
			["a", "old", "m"],
		);
		f.key("ArrowDown");
		f.key("Enter");
		assert.equal(f.app.filter.mark, "saved");
		assert.equal(f.app.filter.query, "Alpha");
		assert.equal(f.input.value, "Alpha");
		assert.deepEqual(
			f.app.filtered().map((c: any) => c.id),
			["m"],
		);
		assert.equal(
			f.w.document.querySelector("#home-search-marks .is-hash").textContent.startsWith("#"),
			true,
		);
		assert.equal(f.w.document.getElementById("home-hash"), null);
	} finally {
		f.dom.window.close();
	}
});

test("desktop search: Delete removes the # tag, then the # status, then the tab", () => {
	const f = desktopFixture();
	try {
		f.app.action("home-tab", "", "unread");
		f.app.filter = { ...f.app.filter, mark: "saved", tag: "Work" };
		f.type("");
		f.key("Backspace");
		assert.equal(f.app.filter.tag, "");
		assert.equal(f.app.filter.mark, "saved");
		f.key("Backspace");
		assert.equal(f.app.filter.mark, "all");
		assert.equal(f.app.homeTab(), "unread");
		f.key("Backspace");
		assert.equal(f.app.homeTab(), "all");
	} finally {
		f.dom.window.close();
	}
});

test("desktop search: type chips show with text, list only types with results, and leave with the text", () => {
	const f = desktopFixture();
	try {
		const row = f.w.document.getElementById("home-kinds");
		f.type("");
		assert.equal(row.hidden, true);
		f.type("Alpha");
		assert.equal(row.hidden, false);
		const chips = () => [...row.querySelectorAll(".chip")].map((n: any) => n.dataset.extra);
		assert.deepEqual(chips(), ["all", "article", "mail"]);
		f.app.action("home-kind", "", "mail");
		assert.deepEqual(
			f.app.filtered().map((c: any) => c.id),
			["m"],
		);
		assert.deepEqual(chips(), ["all", "article", "mail"]);
		f.type("");
		assert.equal(f.app.filter.kind, "all");
		assert.equal(row.hidden, true);
	} finally {
		f.dom.window.close();
	}
});

test("nested card return keeps retained search nodes, position and focus through the whole session", () => {
	const f = fixture();
	try {
		const { app, w } = f;
		w.document.documentElement.dataset.inputModality = "keyboard";
		w.ResizeObserver = class {
			observe() {}
			disconnect() {}
		};
		w.HTMLElement.prototype.getAnimations = () => [];
		Object.defineProperties(w.HTMLElement.prototype, {
			scrollHeight: { configurable: true, get: () => 1800 },
			clientHeight: { configurable: true, get: () => 600 },
		});
		app.gestures = { bindPullDown() {}, bindPush() {} };
		f.Store.state.items = { a: { seen: true }, b: { seen: true } };
		app.searchFilter.query = "Alpha";
		app.dialog.innerHTML = f.Panels.search(app);
		const results = app.dialog.querySelector("#search-results");
		const title = results.querySelector(".card-title-button");
		title.focus();
		results.scrollTop = 330;
		app.searchFilter.query = "Alpha";
		app.openCard("a");
		app.dialog.querySelector(".sheet-scroll").scrollTop = 480;
		app.openCard("b");
		app.openCard("a");
		assert.equal(app.dialog.querySelector(".sheet-scroll").scrollTop, 480);
		app.closeNative(false);
		assert.equal(app.dialog.querySelector("#search-results"), results);
		assert.equal(results.scrollTop, 330);
		assert.equal(app.searchFilter.query, "Alpha");
		assert.equal(w.document.activeElement, title);
		assert.equal(app.previewTrail.length, 0);
		assert.equal(app.detailPositions.size, 0);
	} finally {
		f.dom.window.close();
	}
});

test("desktop search suggests the cards it finds, keeps the query on reopen, and closes on blur", () => {
	const f = desktopFixture();
	try {
		f.input.focus();
		f.type("Alpha");
		f.input.blur();
		f.input.focus();
		assert.equal(f.input.value, "Alpha", "reopening preserves the query while showing suggestions");
		const extras = () =>
			[...f.w.document.querySelectorAll("#home-hash [role=option]")].map(
				(n: any) => n.dataset.extra,
			);
		assert.deepEqual(
			extras(),
			["card:a", "card:old", "card:m"],
			"without # the field suggests cards only",
		);
		f.type("Alpha #");
		assert.ok(extras().includes("tag:Work"), "# lists the existing tags");
		assert.ok(
			!extras().some((extra: string) => extra.startsWith("card:")),
			"# lists conditions, not cards",
		);
		f.type("Alpha");
		let opened = "";
		f.app.navigate = (hash: string) => {
			opened = hash;
		};
		f.app.action("home-hash", "", "card:m");
		assert.equal(opened, "#card/m", "picking a card suggestion opens that card");
		assert.equal(f.w.document.querySelector("#home-hash"), null);
		f.input.focus();
		f.type("");
		f.input.blur();
		assert.equal(f.w.document.querySelector("#home-hash"), null);
	} finally {
		f.dom.window.close();
	}
});

test("combobox keys close without clearing, jump to endpoints and accept an engaged condition on Tab", () => {
	const f = desktopFixture();
	try {
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.input.focus();
		f.type("Alpha #");
		f.input.blur();
		f.input.focus();
		assert.equal(f.input.getAttribute("aria-expanded"), "true");
		const options = f.app.homeHashOptions();
		assert.equal(options.at(-1).extra, "tag:Work", "tags follow the statuses");
		f.key("Escape");
		assert.equal(f.input.value, "Alpha #");
		assert.equal(f.input.getAttribute("aria-expanded"), "false");
		f.key("ArrowUp");
		assert.equal(
			f.input.getAttribute("aria-activedescendant"),
			`home-option-${options.length - 1}`,
		);
		f.key("Home");
		assert.equal(f.app.homeHashIndex, 0);
		f.key("End");
		assert.equal(f.app.homeHashIndex, options.length - 1);
		f.key("Tab");
		assert.equal(f.app.filter.tag, "Work");
		assert.equal(f.input.value, "Alpha", "the # fragment leaves; the words stay");
		assert.equal(f.w.document.querySelector("#home-hash"), null);
		assert.equal(
			f.w.document.querySelector(".home-search-token[data-extra=tag]")?.textContent,
			"#Work",
		);
	} finally {
		f.dom.window.close();
	}
});

test("tabbing past an opened combobox does not pick an untouched first suggestion", () => {
	const f = desktopFixture();
	try {
		f.input.focus();
		f.key("Tab");
		assert.equal(f.app.filter.tag, "");
		assert.equal(f.app.filter.query, "");
		assert.equal(f.input.getAttribute("aria-expanded"), "false");
	} finally {
		f.dom.window.close();
	}
});

test("typing narrows cards and # conditions, empty candidates close with Escape, and # marks the chosen condition", () => {
	const f = desktopFixture();
	try {
		f.input.focus();
		f.type("Gam");
		assert.deepEqual(
			[...f.app.homeHashOptions()].map((option: any) => option.extra),
			["card:n"],
		);
		assert.equal(f.w.document.querySelector(".home-option-label mark").textContent, "Gam");
		f.type("#Wo");
		assert.deepEqual(
			[...f.app.homeHashOptions()].map((option: any) => option.extra),
			["tag:Work"],
		);
		f.app.action("home-hash", "", "tag:Work");
		assert.equal(f.app.filter.tag, "Work");
		assert.equal(f.input.getAttribute("aria-expanded"), "false");
		f.app.openHomeSearch(true);
		f.type("#");
		assert.equal(f.w.document.querySelector('[aria-selected="true"]').dataset.extra, "tag:Work");
		f.type("no match");
		assert.equal(f.input.getAttribute("aria-expanded"), "true");
		assert.ok(f.w.document.querySelector(".home-search-empty"));
		f.key("Escape");
		assert.equal(
			f.input.value,
			"no match",
			"first Escape closes candidates without losing the query",
		);
		assert.equal(f.input.getAttribute("aria-expanded"), "false");
	} finally {
		f.dom.window.close();
	}
});
