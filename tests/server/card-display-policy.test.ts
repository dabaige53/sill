import assert from "node:assert/strict";
import test from "node:test";
import { create, update, workspaceBatch } from "../../contracts/cloud.ts";
import { identity, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";

const tasks = (count: number) =>
	Array.from({ length: count }, (_, i) => ({ id: `task-${i}`, text: `Action ${i}` }));

// @wu-test type=boundary | scope=contracts/cloud task writes | protects=Reject oversized new or changed task lists while preserving unchanged legacy lists
test("new and changed task lists allow six items and request a split above six", () => {
	const card = { id: "legacy", type: "task", title: "Work", tasks: tasks(7) };
	const { id, ...input } = card;
	assert.equal(create.safeParse({ ...input, tasks: tasks(6) }).success, true);
	assert.equal(create.safeParse(input).error?.issues[0].message, "too_many_tasks_split_cards");
	assert.equal(
		update.safeParse({ expectedRevision: 1, changes: { tasks: tasks(7) } }).success,
		false,
	);
	assert.equal(
		update.safeParse({ expectedRevision: 1, changes: { title: "Renamed" } }).success,
		true,
	);
	assert.equal(
		workspaceBatch.safeParse({ operations: [{ op: "card.upsert", card, before: card }] }).success,
		true,
	);
	assert.equal(
		workspaceBatch.safeParse({
			operations: [{ op: "card.upsert", card: { ...card, tasks: tasks(8) }, before: card }],
		}).success,
		false,
	);
});

// @wu-test type=integration | scope=database card writes | protects=Preserve insertion time across retries and updates and enforce task limits
test("database writes assign a stable insertion time and enforce the same task policy", async () => {
	const fixture = await cloudFixture();
	try {
		await identity(fixture.db);
		const payload = { type: "note", title: "Synthetic", summary: "Complete summary" };
		const write = (op: string, id: string | null, input: unknown, key: string) =>
			rpc(fixture.db, "sill_write_v1", [op, id, JSON.stringify(input), key]);
		const first = (await write("create", null, payload, "display-policy-create")).body;
		assert.equal(first.time, Date.parse(first.created_at));
		assert.equal(
			(await write("create", null, payload, "display-policy-create")).body.time,
			first.time,
		);
		const changed = (
			await write(
				"update",
				first.id,
				{ expectedRevision: first.revision, changes: { title: "Updated" } },
				"display-policy-update",
			)
		).body;
		assert.equal(changed.time, first.time);
		await assert.rejects(
			write(
				"create",
				null,
				{ type: "task", title: "Split me", tasks: tasks(7) },
				"display-policy-seven",
			),
			/invalid_request/,
		);
		const at = Date.parse("2026-10-01T00:00:00Z");
		const explicit = (
			await write("create", null, { ...payload, time: at }, "display-policy-explicit")
		).body;
		assert.equal(explicit.time, at);
		const workspace = await rpc(fixture.db, "sill_get_workspace", []);
		await rpc(fixture.db, "sill_apply_operations", [
			JSON.stringify({
				expectedRevision: workspace.revision,
				operations: [
					{ op: "card.upsert", before: null, card: { id: "display-batch", ...payload } },
				],
			}),
			"display-policy-batch",
		]);
		const batch = await rpc(fixture.db, "sill_get_content", ["display-batch"]);
		assert.equal(batch.time, Date.parse(batch.created_at));
	} finally {
		await fixture.db.close();
	}
});

// @wu-test type=integration | scope=database legacy task writes | protects=Preserve legacy tasks and completion state while rejecting further growth
test("legacy oversized lists retain their items and state while missing time uses creation", async () => {
	const fixture = await cloudFixture();
	try {
		// Simulate a pre-policy row in this isolated fixture, then restore the live write boundary.
		await fixture.db.exec("alter table sill_private.contents disable trigger sill_card_check");
		await identity(fixture.db);
		const legacy = (
			await rpc(fixture.db, "sill_write_v1", [
				"create",
				null,
				JSON.stringify({
					type: "task",
					title: "Existing work",
					tasks: tasks(7),
					state: { taskDone: ["task-5"] },
				}),
				"legacy-display-create",
			])
		).body;
		await fixture.db.exec(
			"reset role;alter table sill_private.contents enable trigger sill_card_check",
		);
		await identity(fixture.db);
		const read = await rpc(fixture.db, "sill_get_content", [legacy.id]);
		assert.equal(read.time, Date.parse(read.created_at));
		const changed = (
			await rpc(fixture.db, "sill_write_v1", [
				"update",
				read.id,
				JSON.stringify({ expectedRevision: read.revision, changes: { title: "Renamed work" } }),
				"legacy-display-update",
			])
		).body;
		assert.deepEqual(changed.tasks, tasks(7));
		assert.deepEqual(changed.state.taskDone, ["task-5"]);
		assert.equal(changed.time, read.time);
		await assert.rejects(
			rpc(fixture.db, "sill_write_v1", [
				"update",
				read.id,
				JSON.stringify({ expectedRevision: changed.revision, changes: { tasks: tasks(8) } }),
				"legacy-display-more",
			]),
			/invalid_request/,
		);
	} finally {
		await fixture.db.close();
	}
});
