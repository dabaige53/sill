import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { cloudCard, cloudCardChanges, cloudCardState } from "../../apps/web/data/cloud-card.ts";

const rich = {
	id: "synthetic-rich",
	type: "task",
	title: "Synthetic card",
	body: "Body",
	summary: "Independent summary",
	project: { name: "Project" },
	form: "image" as const,
	image: "coast" as const,
	tags: ["Synthetic"],
	sources: [{ name: "Agent", kind: "agent", upstream: { id: "source-1" } }],
	why: { reason: "A reason", basis: ["Evidence"] },
	sender: "Sender",
	location: "Room",
	meeting: { name: "Meeting", url: "https://example.com/meeting" },
	media: "video" as const,
	duration: 60,
	files: [{ name: "File", mimeType: "application/pdf", sizeBytes: 1024 }],
	photos: ["coast" as const],
	attachment: "Attachment",
	tasks: [{ id: "step", text: "Step", done: false, future: "preserved" }],
	start: 1,
	end: 2,
	due: 3,
	time: 0,
	people: ["Person"],
	related: ["other"],
	priority: 5,
	state: { read: false, done: true, archived: false, future: "state" },
	revision: 7,
	updated_at: "2026-10-16T00:00:00Z",
	future: { nested: ["keep"] },
};

test("cloud projection preserves rich fields and real presentation values", () => {
	const projected = cloudCard(rich);
	assert.deepEqual(projected, rich);
	projected.future.nested.push("clone");
	assert.deepEqual(rich.future.nested, ["keep"]);
});

test("cloud projection normalizes legacy sources before applying missing-value fallbacks", () => {
	const projected = cloudCard({
		id: "old",
		type: "note",
		title: "Old",
		source: "Legacy",
		kind: "ai",
		body: ["Text"],
	} as unknown as Parameters<typeof cloudCard>[0]);
	assert.deepEqual(projected.sources, [{ name: "Legacy", kind: "agent" }]);
	assert.equal(projected.summary, "Text");
	assert.equal(projected.body, "Text");
	assert.equal(projected.meta, undefined);
	assert.equal(projected.source, undefined);
	assert.equal(projected.time, undefined);
	const empty = cloudCard({ ...rich, summary: "", sources: [] });
	assert.equal(empty.summary, "");
	assert.equal(empty.meta, undefined);
	assert.deepEqual(empty.sources, []);
	const missing = cloudCard({
		id: "missing",
		type: "note",
		title: "Missing",
		updated_at: rich.updated_at,
	});
	assert.equal(missing.sources, undefined);
	assert.equal(missing.time, Date.parse(rich.updated_at));
});

test("cloud done state presents recorded task and reminder state without changing tasks", () => {
	assert.deepEqual(cloudCardState(rich), { read: false, reminderDone: false, taskDone: ["step"] });
	assert.equal(cloudCardState({ ...rich, type: "reminder" }).reminderDone, true);
	assert.equal(cloudCardState({ ...rich, state: { done: false } }).taskDone, undefined);
	assert.equal(rich.tasks[0].done, false);
});

test("projected rich cards render sources, task state, and reminder state", () => {
	const article = cloudCard({ ...rich, type: "article" });
	const rendered = new JSDOM(cardHTML(article, { state: cloudCardState(article) })).window.document;
	assert.match(rendered.body.textContent, /Independent summary/);
	assert.match(rendered.body.textContent, /Agent/);
	assert.ok(rendered.querySelector(".card-cover"));
	const task = new JSDOM(cardHTML(rich, { state: cloudCardState(rich) })).window.document;
	assert.equal(task.querySelector(".done-row"), null);
	assert.ok(task.querySelector('.check-item[aria-checked="true"]'));
	const reminder = { ...rich, type: "reminder" };
	const renderedReminder = new JSDOM(cardHTML(reminder, { state: cloudCardState(reminder) })).window
		.document;
	assert.ok(renderedReminder.querySelector('[data-action="restore-reminder"]'));
	assert.equal(renderedReminder.querySelector('[data-action="complete-reminder"]'), null);
});

test("cloud editor sends only changed fields and preserves structure and unedited state", () => {
	assert.deepEqual(cloudCardChanges(rich, { title: rich.title, body: "Body", read: false }), {});
	const changes = cloudCardChanges(rich, { title: "Edited", body: "Body", read: true });
	assert.deepEqual(changes, { title: "Edited", state: { read: true } });
	const saved = { ...rich, ...changes, state: { ...rich.state, ...(changes.state as object) } };
	assert.deepEqual(saved, { ...rich, title: "Edited", state: { ...rich.state, read: true } });
	assert.deepEqual(cloudCardChanges(rich, { title: rich.title, body: "New\nBody", read: false }), {
		body: "New\nBody",
	});
});
