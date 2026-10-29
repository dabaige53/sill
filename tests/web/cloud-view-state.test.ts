import assert from "node:assert/strict";
import test from "node:test";
import { cloudViewCard } from "../../apps/web/services/cloud-view-state.ts";

const card = {
	id: "task",
	type: "task",
	title: "Task",
	tasks: [{ id: "a" }, { id: "b" }],
	revision: 1,
	updated_at: "2026-10-28",
	state: {},
};

test("save acknowledgments preserve the visible state for task, bookmark, later and read", () => {
	for (const item of [
		{ taskDone: ["a"] },
		{ taskDone: ["a", "b"] },
		{ taskDone: [] },
		{ bookmarked: true },
		{ later: true },
		{ seen: true, read: true },
	]) {
		const saved = { ...card, revision: 2, updated_at: "2026-10-29", state: item };
		assert.deepEqual(
			cloudViewCard(card, item),
			cloudViewCard(saved, { ...item, done: "taskDone" in item && item.taskDone.length === 2 }),
		);
	}
});
test("reminder completion mirrors and task ordering do not redraw a saved detail", () => {
	const reminder = { ...card, type: "reminder" };
	assert.deepEqual(
		cloudViewCard(reminder, { reminderDone: true }),
		cloudViewCard(reminder, { reminderDone: true, done: true }),
	);
	assert.deepEqual(
		cloudViewCard(card, { taskDone: ["b", "a"] }),
		cloudViewCard(card, { taskDone: ["a", "b"], done: true }),
	);
});
test("remote content, deletion and personal state changes still update the view", () => {
	const before = cloudViewCard(card, {});
	for (const changed of [
		{ ...card, title: "Edited" },
		{ ...card, deleted: true },
		{ ...card, tasks: [{ id: "a", text: "Edited" }] },
	])
		assert.notDeepEqual(before, cloudViewCard(changed, {}));
	assert.notDeepEqual(before, cloudViewCard(card, { taskDone: ["a"] }));
	assert.notDeepEqual(before, cloudViewCard(card, { bookmarked: true }));
	assert.notDeepEqual(before, cloudViewCard(null, {}));
});
