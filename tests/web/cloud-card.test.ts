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
	images: ["coast"],
	tags: ["Synthetic"],
	sources: [{ name: "Agent", kind: "agent" }],
	authors: [{ name: "Sender" }],
	location: "Room",
	meeting: { name: "Meeting", url: "https://example.com/meeting" },
	media: "video" as const,
	duration: 60,
	files: [{ name: "File", mimeType: "application/pdf", sizeBytes: 1024 }],
	tasks: [{ id: "step", text: "Step" }],
	start: 1,
	end: 2,
	due: 3,
	time: 0,
	related: ["other"],
	priority: 5,
	state: { read: false, done: true, archived: false },
	revision: 7,
	updated_at: "2026-10-16T00:00:00Z",
};

test("cloud projection preserves card fields and copies nested values", () => {
	const projected = cloudCard(rich);
	assert.deepEqual(projected, rich);
	projected.tasks.push({ id: "clone", text: "Clone" });
	assert.deepEqual(rich.tasks, [{ id: "step", text: "Step" }]);
});

test("cloud projection fills only the summary and timeline time when missing", () => {
	const projected = cloudCard({ id: "note", type: "note", title: "Note", body: "Text" });
	assert.equal(projected.summary, "Text");
	assert.equal(projected.time, undefined);
	const empty = cloudCard({ ...rich, summary: "", sources: [] });
	assert.equal(empty.summary, "");
	assert.deepEqual(empty.sources, []);
	const missing = cloudCard({
		id: "missing",
		type: "note",
		title: "Missing",
		created_at: "2026-10-01T00:00:00Z",
		updated_at: rich.updated_at,
	});
	assert.equal(missing.sources, undefined);
	assert.equal(missing.time, Date.parse("2026-10-01T00:00:00Z"));
});

test("cloud timeline fallback stays at creation time after saves and preserves explicit time", () => {
	const record = {
		id: "stable-time",
		type: "note",
		title: "Stable timeline",
		created_at: "2026-10-01T08:00:00+08:00",
		updated_at: "2026-10-02T00:00:00Z",
	};
	const before = cloudCard(record);
	const after = cloudCard({ ...record, updated_at: "2026-10-30T00:00:00Z" });
	assert.equal(before.time, Date.parse(record.created_at));
	assert.equal(after.time, before.time);
	assert.equal(cloudCard({ ...record, time: 42 }).time, 42);
	assert.equal("time" in record, false);
});

test("cloud timeline does not turn update or source publication time into creation time", () => {
	const record = {
		id: "unknown-creation",
		type: "article",
		title: "Unknown creation",
		publishedAt: "2020-01-01",
		updated_at: "2026-10-30T00:00:00Z",
	};
	assert.equal(cloudCard(record).time, undefined);
	assert.equal(cloudCard({ ...record, created_at: "invalid" }).time, undefined);
	assert.equal(cloudCard(record).publishedAt, record.publishedAt);
});

test("cloud done state presents recorded task and reminder state without changing tasks", () => {
	assert.deepEqual(cloudCardState(rich), { read: false, reminderDone: false, taskDone: ["step"] });
	assert.equal(cloudCardState({ ...rich, type: "reminder" }).reminderDone, true);
	assert.equal(cloudCardState({ ...rich, state: { done: false } }).taskDone, undefined);
	assert.equal("done" in rich.tasks[0], false);
});

test("projected rich cards render authors, task state, and reminder state", () => {
	const article = cloudCard({ ...rich, type: "article" });
	const rendered = new JSDOM(cardHTML(article, { state: cloudCardState(article) })).window.document;
	assert.match(rendered.body.textContent, /Independent summary/);
	assert.match(rendered.body.textContent, /Sender/);
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
