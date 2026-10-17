import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { parseCard } from "../../apps/web/data/card-validation.ts";
import { FreshCards, SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";

const fixtures = JSON.parse(
	readFileSync(new URL("../../contracts/fixtures.json", import.meta.url), "utf8"),
);
for (const sample of fixtures.valid)
	test(`Web accepts and preserves ${sample.name}`, () =>
		assert.deepEqual(parseCard(sample.card), sample.card));
for (const sample of fixtures.invalid)
	test(`Web rejects ${sample.name}`, () => assert.throws(() => parseCard(sample.card)));
test("demo cards use the shared schema and unknown card types render generically", () => {
	for (const card of [...SeedCards, ...FreshCards]) assert.deepEqual(parseCard(card), card);
	Store.state = Store.fresh();
	const card = fixtures.valid.find((sample) => sample.name === "future-card").card;
	assert.match(cardHTML(card), /Synthetic future-card/);
	assert.deepEqual(parseCard(card).custom, { nested: ["preserve"] });
});
test("keys holding undefined count as absent, as they do once saved as JSON", () => {
	for (const card of SeedCards) parseCard({ ...card, tasks: card.tasks?.map((t) => ({ ...t })) });
	assert.doesNotThrow(() => parseCard({ id: "a", type: "article", title: "A", image: undefined }));
	assert.throws(() => parseCard({ id: "a", type: "article", title: undefined }));
});
test("unknown card types cannot inject attributes or call renderer helper methods", () => {
	Store.state = Store.fresh();
	for (const type of ["__proto__", "constructor", "head", 'future\" onpointerenter=\"alert(1)']) {
		const card = parseCard({ id: "future", type, title: "Future" });
		const document = new JSDOM(cardHTML(card)).window.document;
		assert.equal(document.querySelector("article").getAttribute("onpointerenter"), null);
		assert.match(document.querySelector("h2").textContent, /Future/);
	}
});

test("digest preview preserves the agent's summary and points without invented week statistics", () => {
	Store.state = Store.fresh();
	const card = {
		id: "digest-project",
		type: "digest",
		title: "Project review",
		summary: "The project is ready for review.",
		points: ["Check the result", "Keep the source", "Agree the next step", "Detail only"],
		body: ["Full detail remains available."],
	};
	const before = structuredClone(card);
	const document = new JSDOM(cardHTML(card)).window.document;
	assert.equal(document.querySelector(".card-summary").textContent, card.summary);
	assert.equal(document.querySelector(".stats-trio"), null);
	assert.deepEqual(
		[...document.querySelectorAll(".key-points li span")].map((node) => node.textContent),
		card.points.slice(0, 3),
	);
	assert.deepEqual(card, before);
	const fallback = new JSDOM(cardHTML({ ...card, summary: "", points: [] })).window.document;
	assert.equal(fallback.querySelector(".card-summary").textContent, card.body[0]);
});

test("task preview exposes unfinished work beyond the first three without reordering stored tasks", () => {
	Store.state = Store.fresh();
	const tasks = [
		{ id: "done-1", text: "Completed one", done: true },
		{ id: "done-2", text: "Completed two", done: true },
		{ id: "done-3", text: "Completed three", done: true },
		{ id: "next-1", text: "Review the draft", done: false },
		{ id: "next-2", text: "Check the evidence", done: false },
	];
	const card = { id: "task-next", type: "task", title: "Next actions", tasks };
	const before = structuredClone(card);
	const document = new JSDOM(cardHTML(card)).window.document;
	assert.deepEqual(
		[...document.querySelectorAll(".check-item")].map((node) => node.getAttribute("data-extra")),
		["next-1", "next-2", "done-1"],
	);
	assert.equal(document.querySelector(".task-count").textContent, "3/5");
	assert.deepEqual(card, before);
	const overridden = new JSDOM(cardHTML(card, { state: { taskDone: ["next-1", "next-2"] } })).window
		.document;
	assert.equal(overridden.querySelector(".check-item").getAttribute("data-extra"), "done-1");
});

test("an empty task list is not presented as completed", () => {
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
	assert.equal(document.querySelector(".card-summary").textContent, "Define the work first.");
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
	]);
	assert.deepEqual(previewIds({ state }), ["one", "three", "four"]);
	assert.deepEqual(
		previewIds({ state, taskPreviewOrder: ["missing", "two", "two", "one", "three", "four"] }),
		["two", "one", "three"],
	);
	assert.deepEqual(card, before);
});

test("completing the focused preview retains its checkboxes until the preview is released", () => {
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
	assert.ok(released.querySelector(".done-row"));
	assert.equal(released.querySelectorAll(".check-item").length, 0);
	const passive = new JSDOM(cardHTML(card, { ...options, passive: true })).window.document;
	assert.ok(passive.querySelector(".done-row"));
});
