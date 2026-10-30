import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Card } from "../../contracts/card.ts";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";
import { LocalRepository } from "../../server/local/repository.ts";

for (const sample of fixtures.valid)
	test(`accept and preserve ${sample.name}`, () =>
		assert.deepEqual(Card.parse(sample.card), sample.card));
for (const sample of fixtures.invalid)
	test(`reject ${sample.name}`, () => assert.equal(Card.safeParse(sample.card).success, false));

test("writes reject second-based schedule times and new reminders without due", async () => {
	const { create, update, workspaceBatch } = await import("../../contracts/cloud.ts");
	const at = Date.parse("2026-10-19T10:00:00+08:00");
	const event = { type: "event", title: "Review", start: at, end: at + 3600000 };
	assert.equal(create.safeParse(event).success, true);
	const seconds = create.safeParse({ ...event, start: at / 1000, end: at / 1000 + 3600 });
	assert.equal(seconds.success, false);
	assert.deepEqual(
		seconds.error?.issues.map((issue) => issue.message),
		["timestamp_not_unix_milliseconds", "timestamp_not_unix_milliseconds"],
	);
	const reminder = create.safeParse({ type: "reminder", title: "Submit" });
	assert.deepEqual(reminder.error?.issues[0].path, ["due"]);
	assert.equal(create.safeParse({ type: "reminder", title: "Submit", due: at }).success, true);
	assert.equal(
		update.safeParse({ expectedRevision: 1, changes: { due: at / 1000 } }).success,
		false,
	);
	assert.equal(
		update.safeParse({ expectedRevision: 1, changes: { title: "Renamed" } }).success,
		true,
	);
	// A stored card saved again with an unchanged legacy value still writes.
	const legacy = { id: "old", type: "reminder", title: "Old", due: 2000 };
	const upsert = (card: object, before: object | null) =>
		workspaceBatch.safeParse({ operations: [{ op: "card.upsert", card, before }] });
	assert.equal(upsert({ ...legacy, tags: ["kept"] }, legacy).success, true);
	assert.equal(upsert({ id: "new", type: "reminder", title: "New" }, null).success, false);
	assert.deepEqual(upsert({ ...legacy, due: 3000 }, legacy).error?.issues[0].path, [
		"operations",
		0,
		"card",
		"due",
	]);
});
