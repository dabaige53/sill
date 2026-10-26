import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement as h } from "react";
import { fixture } from "./app-fixture.ts";

const taskCard = {
	id: "task-one",
	type: "task",
	title: "Synthetic task",
	tasks: [
		{ id: "first", text: "First" },
		{ id: "second", text: "Second" },
	],
};
const taskMarkup = `<article data-card="task-one"><span class="task-count">0/2</span><button class="check-item" data-action="task" data-id="task-one" data-extra="first" aria-checked="false"><span class="check-dot"></span>First</button><button class="check-item" data-action="task" data-id="task-one" data-extra="second" aria-checked="false"><span class="check-dot"></span>Second</button></article>`;

test("task preview completion keeps mounted rows, focus, scroll and bindings across repeated clicks", () => {
	const f = fixture();
	try {
		const { app, Store, Panels, w } = f;
		Store.state.cards = [taskCard];
		app.currentId = taskCard.id;
		app.modalKind = "preview";
		app.dialog.innerHTML = Panels.preview(app, taskCard);
		const sheet = app.dialog.querySelector(".preview-sheet");
		const scroll = app.dialog.querySelector(".sheet-scroll");
		const row = app.dialog.querySelector('[data-action="task"]');
		scroll.scrollTop = 137;
		row.focus();
		let clicks = 0;
		row.addEventListener("click", () => {
			clicks++;
			app.toggleTask(taskCard.id, "first");
		});
		app.replacePanelContent = () => assert.fail("completion must not remount the preview");
		app.refreshCard = () => assert.fail("background refresh waits for close");
		let checks = 0;
		app.checkReminders = () => checks++;
		for (const done of [true, false, true]) {
			row.click();
			assert.equal(Store.tasks(taskCard)[0].done, done);
			assert.equal(row.getAttribute("aria-checked"), String(done));
			assert.equal(row.classList.contains("is-done"), done);
			assert.equal(!!row.querySelector("svg"), done);
			assert.equal(app.dialog.querySelector('[data-action="task"]'), row);
			assert.equal(app.dialog.querySelector(".preview-sheet"), sheet);
			assert.equal(w.document.activeElement, row);
			assert.equal(scroll.scrollTop, 137);
		}
		assert.equal(clicks, 3);
		assert.equal(checks, 3);
	} finally {
		f.dom.window.close();
	}
});

test("home and search task controls update their own mounted nodes and completion counts", () => {
	const f = fixture();
	try {
		const { app, Store, w } = f;
		Store.state.cards = [taskCard];
		app.dialog.removeAttribute("open");
		app.grid.innerHTML = `${taskMarkup}<article data-card="unrelated">Keep this node</article>`;
		const search = w.document.createElement("section");
		search.innerHTML = taskMarkup;
		w.document.body.append(search);
		app.searchBackground = search;
		app.filter = { status: "all" };
		const unrelated = app.grid.lastElementChild;
		const row = app.grid.querySelector('[data-extra="first"]');
		const searchRow = search.querySelector('[data-extra="first"]');
		row.focus();
		app.checkReminders = () => {};
		app.refreshCard = () => assert.fail("ordinary completion must stay local");
		app.toggleTask(taskCard.id, "first");
		assert.equal(app.grid.querySelector('[data-extra="first"]'), row);
		assert.equal(search.querySelector('[data-extra="first"]'), searchRow);
		assert.equal(searchRow.getAttribute("aria-checked"), "true");
		assert.equal(app.grid.querySelector(".task-count").textContent, "1/2");
		assert.equal(search.querySelector(".task-count").textContent, "1/2");
		assert.equal(w.document.activeElement, row);
		app.toggleTask(taskCard.id, "second");
		assert.equal(app.grid.firstElementChild.classList.contains("is-complete"), true);
		assert.equal(app.grid.querySelector(".task-count").textContent, "2/2");
		assert.equal(app.grid.lastElementChild, unrelated);
		app.toggleTask(taskCard.id, "first");
		assert.equal(app.grid.firstElementChild.classList.contains("is-complete"), false);
		assert.equal(app.grid.querySelector(".task-count").textContent, "1/2");
	} finally {
		f.dom.window.close();
	}
});

test("removing a bookmark from the open preview defers feed membership changes", () => {
	const f = fixture();
	try {
		const { app, Store } = f;
		Store.patch("mail-one", { bookmarked: true });
		app.currentId = "mail-one";
		app.modalKind = "preview";
		app.dialog.innerHTML =
			'<button data-action="bookmark" data-id="mail-one" class="active"></button>';
		const button = app.dialog.firstElementChild;
		app.refreshCard = () => assert.fail("open preview holds background membership");
		app.setFlag("mail-one", "bookmarked", false);
		assert.equal(Store.item("mail-one").bookmarked, false);
		assert.equal(button.classList.contains("active"), false);
		assert.equal(app.dialog.firstElementChild, button);
	} finally {
		f.dom.window.close();
	}
});

test("a later feed render reconciles completion icons without duplicating or losing React children", () => {
	const f = fixture();
	try {
		const { app, Store } = f;
		Store.state.cards = [taskCard];
		app.dialog.removeAttribute("open");
		app.filter = { status: "all" };
		app.loadedImages = new Set();
		app.layout = { layout() {} };
		app.restoreStacks = app.updateSelection = app.updateFilterIndicator = () => {};
		app.checkReminders = () => {};
		app.deskView = () =>
			h(
				"article",
				{ "data-card": taskCard.id },
				h(
					"button",
					{ type: "button", "data-action": "task", "data-id": taskCard.id, "data-extra": "first" },
					h("span", { className: "check-dot" }, Store.tasks(taskCard)[0].done ? h("svg") : null),
				),
			);
		app.renderCurrent();
		const row = app.grid.querySelector("button");
		for (const count of [1, 0, 1]) {
			app.toggleTask(taskCard.id, "first");
			app.renderCurrent();
			assert.equal(app.grid.querySelector("button"), row);
			assert.equal(row.querySelectorAll("svg").length, count);
		}
	} finally {
		f.dom.window.close();
	}
});

test("home reminder completion keeps its control focused and restores in place", () => {
	const f = fixture();
	try {
		const { app, Store, w } = f;
		Store.state.cards = [{ id: "reminder-one", type: "reminder", title: "Synthetic reminder" }];
		app.dialog.removeAttribute("open");
		app.filter = { status: "all" };
		app.grid.innerHTML =
			'<article data-card="reminder-one"><button class="reminder-check" data-id="reminder-one" data-action="complete-reminder"><span class="check-dot"></span></button></article>';
		const row = app.grid.querySelector("button");
		row.focus();
		app.selected = new Set();
		app.checkReminders = () => {};
		app.refreshCard = () => assert.fail("home completion must stay local");
		for (const done of [true, false]) {
			app.changeReminder("reminder-one", row.dataset.action);
			assert.equal(row.getAttribute("aria-pressed"), String(done));
			assert.equal(app.grid.firstElementChild.classList.contains("is-complete"), done);
			assert.equal(w.document.activeElement, row);
		}
	} finally {
		f.dom.window.close();
	}
});
