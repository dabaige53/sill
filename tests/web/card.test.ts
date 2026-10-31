import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { parseCard } from "../../apps/web/data/card-validation.ts";
import { FreshCards, SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";

for (const sample of fixtures.valid)
	test(`Web accepts and preserves ${sample.name}`, () =>
		assert.deepEqual(parseCard(sample.card), sample.card));
for (const sample of fixtures.invalid)
	test(`Web rejects ${sample.name}`, () => assert.throws(() => parseCard(sample.card)));
test("demo cards use the shared schema and unknown card types render generically", () => {
	for (const card of [...SeedCards, ...FreshCards]) assert.deepEqual(parseCard(card), card);
	Store.state = Store.fresh();
	const card = parseCard({ id: "future", type: "future", title: "Synthetic future card" });
	assert.match(cardHTML(card), /Synthetic future card/);
	assert.throws(() => parseCard({ ...card, custom: { nested: ["preserve"] } }));
});
test("feed cards keep a keyboard title without a visible ellipsis control", () => {
	Store.state = Store.fresh();
	for (const card of [...SeedCards, ...FreshCards]) {
		const dom = new JSDOM(cardHTML(card));
		try {
			const document = dom.window.document;
			assert.equal(
				document.querySelector('[data-action="card-more"],.card-more-trigger'),
				null,
				card.id,
			);
			assert.ok(document.querySelector('.card-title-button[data-action="card-open"]'), card.id);
		} finally {
			dom.window.close();
		}
	}
});
test("keys holding undefined count as absent, as they do once saved as JSON", () => {
	for (const card of SeedCards) parseCard({ ...card, tasks: card.tasks?.map((t) => ({ ...t })) });
	assert.doesNotThrow(() => parseCard({ id: "a", type: "article", title: "A", images: undefined }));
	assert.throws(() => parseCard({ id: "a", type: "article", title: undefined }));
});
test("unknown card types cannot inject attributes or call renderer helper methods", () => {
	Store.state = Store.fresh();
	for (const type of ["__proto__", "constructor", "head", 'future" onpointerenter="alert(1)']) {
		const card = parseCard({ id: "future", type, title: "Future" });
		const document = new JSDOM(cardHTML(card)).window.document;
		assert.equal(document.querySelector("article").getAttribute("onpointerenter"), null);
		assert.match(document.querySelector("h2").textContent, /Future/);
	}
});

test("digest face shows the summary or plain Markdown text without invented week statistics", () => {
	Store.state = Store.fresh();
	const card = {
		id: "digest-project",
		type: "digest",
		title: "Project review",
		summary: "The project is ready for review.",
		body: "**Full detail** remains available.",
	};
	const before = structuredClone(card);
	const document = new JSDOM(cardHTML(card)).window.document;
	assert.equal(document.querySelector(".card-summary").textContent, card.summary);
	assert.equal(document.querySelector(".stats-trio"), null);
	assert.equal(document.querySelector(".key-points"), null);
	assert.deepEqual(card, before);
	const fallback = new JSDOM(cardHTML({ ...card, summary: "" })).window.document;
	assert.equal(
		fallback.querySelector(".card-summary").textContent,
		"Full detail remains available.",
	);
});

test("task preview exposes all unfinished and completed work without reordering stored tasks", () => {
	Store.state = Store.fresh();
	const tasks = [
		{ id: "done-1", text: "Completed one" },
		{ id: "done-2", text: "Completed two" },
		{ id: "done-3", text: "Completed three" },
		{ id: "next-1", text: "Review the draft" },
		{ id: "next-2", text: "Check the evidence" },
	];
	const card = { id: "task-next", type: "task", title: "Next actions", tasks };
	const before = structuredClone(card);
	const document = new JSDOM(
		cardHTML(card, { state: { taskDone: ["done-1", "done-2", "done-3"] } }),
	).window.document;
	assert.deepEqual(
		[...document.querySelectorAll(".check-item")].map((node) => node.getAttribute("data-extra")),
		["next-1", "next-2", "done-1", "done-2", "done-3"],
	);
	assert.equal(document.querySelector(".task-count").textContent, "3/5");
	assert.deepEqual(card, before);
	const overridden = new JSDOM(cardHTML(card, { state: { taskDone: ["next-1", "next-2"] } })).window
		.document;
	assert.equal(overridden.querySelector(".check-item").getAttribute("data-extra"), "done-1");
});

test("an empty task list is not presented as completed or replaced by the summary", () => {
	Store.state = Store.fresh();
	const document = new JSDOM(
		cardHTML({
			id: "task-empty",
			type: "task",
			title: "Plan the next step",
			summary: "Define the work first.",
			tasks: [],
		}),
	).window.document;
	assert.equal(document.querySelector(".done-row"), null);
	assert.equal(document.querySelector(".task-count"), null);
	assert.equal(document.querySelector(".card-summary"), null);
});

test("keyboard task previews keep their positions without changing the stored order", () => {
	Store.state = Store.fresh();
	const card = {
		id: "task-keyboard",
		type: "task",
		title: "Keyboard actions",
		tasks: [
			{ id: "done", text: "Earlier work", done: true },
			{ id: "one", text: "First action", done: false },
			{ id: "two", text: "Second action", done: false },
			{ id: "three", text: "Third action", done: false },
			{ id: "four", text: "Fourth action", done: false },
		],
	};
	const before = structuredClone(card),
		state = { taskDone: ["done", "two"] };
	const previewIds = (options: any) =>
		[...new JSDOM(cardHTML(card, options)).window.document.querySelectorAll(".check-item")].map(
			(node) => node.getAttribute("data-extra"),
		);
	assert.deepEqual(previewIds({ state, taskPreviewOrder: ["one", "two", "three"] }), [
		"one",
		"two",
		"three",
		"four",
		"done",
	]);
	assert.deepEqual(previewIds({ state }), ["one", "three", "four", "done", "two"]);
	assert.deepEqual(
		previewIds({ state, taskPreviewOrder: ["missing", "two", "two", "one", "three", "four"] }),
		["two", "one", "three", "four", "done"],
	);
	assert.deepEqual(card, before);
});

test("completed tasks retain their checkboxes after focus leaves and in passive previews", () => {
	Store.state = Store.fresh();
	const card = {
		id: "task-last",
		type: "task",
		title: "Last action",
		tasks: [
			{ id: "first", text: "Earlier work", done: true },
			{ id: "last", text: "Finish the review", done: false },
		],
	};
	const options = {
		state: { taskDone: ["first", "last"] },
		taskPreviewOrder: ["last", "first"],
	};
	const held = new JSDOM(cardHTML(card, options)).window.document;
	assert.equal(held.querySelector(".done-row"), null);
	assert.equal(held.querySelectorAll('.check-item[aria-checked="true"]').length, 2);
	assert.equal(held.querySelector(".task-count").textContent, "2/2");
	const released = new JSDOM(cardHTML(card, { state: options.state })).window.document;
	assert.equal(released.querySelector(".done-row"), null);
	assert.equal(released.querySelectorAll(".check-item").length, 2);
	const passive = new JSDOM(cardHTML(card, { ...options, passive: true })).window.document;
	assert.equal(passive.querySelector(".done-row"), null);
	assert.equal(passive.querySelectorAll(".check-item").length, 2);
});

test("suggestions disclose hidden references and card file rows stay static", () => {
	Store.state = Store.fresh();
	Store.state.cards = ["one", "two", "three"].map((id) => ({ id, type: "note", title: id }));
	const suggestion = new JSDOM(
		cardHTML({
			id: "suggestion",
			type: "suggestion",
			title: "Connections",
			related: ["one", "two", "three", "missing"],
		}),
	).window.document;
	assert.equal(suggestion.querySelectorAll(".refs button").length, 2);
	assert.match(suggestion.querySelector(".related-more").textContent, /1.*关联内容/);
	const file = new JSDOM(
		cardHTML({ id: "file", type: "file", title: "File", files: [{ name: "report.txt" }] }),
	).window.document;
	assert.equal(file.querySelector(".file-row").tagName, "SPAN");
	assert.equal(file.querySelector(".file-row.ref"), null);
	// Mail attachments live in the detail only.
	const mail = new JSDOM(
		cardHTML({ id: "mail", type: "mail", title: "Mail", files: [{ name: "report.txt" }] }),
	).window.document;
	assert.equal(mail.querySelector(".file-row"), null);
});
