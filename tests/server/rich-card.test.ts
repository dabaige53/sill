import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";
import { changes, create } from "../../contracts/cloud.ts";
import { applyCardMigrations, identity, rpc, setupBoundary } from "./helpers/boundary-fixture.ts";

test("HTTPS image migration preserves remote photos through cloud writes and reads", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		await applyCardMigrations(db);
		await identity(db);
		const image = "https://images.example.org/" + "a".repeat(150) + ".jpg?size=800";
		const body = { type: "photo", title: "Photo", images: [image, "coast"] };
		assert.equal(create.safeParse(body).success, true);
		const saved = await rpc(db, "sill_write_v1", [
			"create",
			null,
			JSON.stringify(body),
			"https-image",
		]);
		const found = await rpc(db, "sill_get_content", [saved.body.id]);
		assert.deepEqual(found.images, body.images);
		for (const image of [
			"http://example.org/a",
			"https://user:pass@example.org/a",
			"https://example.org/" + "a".repeat(8192),
		]) {
			await assert.rejects(
				rpc(db, "sill_write_v1", [
					"create",
					null,
					JSON.stringify({ ...body, images: [image] }),
					crypto.randomUUID(),
				]),
				/invalid_request/,
			);
		}
	} finally {
		await db.close();
	}
});

test("rich cloud cards preserve fields, merge state, protect revisions and reject unknown fields", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		await applyCardMigrations(db);
		await identity(db);
		const body = {
			type: "task",
			title: "Synthetic rich card",
			summary: "Preview",
			sources: [{ name: "Assistant", kind: "agent" }],
			tasks: [{ id: "step1", text: "Check" }],
			due: 1800000000000,
			tags: ["test"],
			state: { read: false, done: false, archived: false },
		};
		assert.deepEqual(create.parse(body), body);
		const write = (op: string, id: string | null, payload: unknown, key: string) =>
			rpc(db, "sill_write_v1", [op, id, JSON.stringify(payload), key]);
		const saved = await write("create", null, body, "rich_create_01");
		assert.deepEqual(saved.body.tasks, body.tasks);
		assert.deepEqual(saved.body.sources, body.sources);
		assert.deepEqual(await write("create", null, body, "rich_create_01"), saved);
		const id = saved.body.id;
		const updated = await write(
			"update",
			id,
			{ expectedRevision: 1, changes: { title: "Updated", state: { read: true } } },
			"rich_update_01",
		);
		assert.deepEqual(updated.body.state, {
			read: true,
			done: false,
			archived: false,
			taskDone: [],
		});
		assert.deepEqual(updated.body.tasks, body.tasks);
		await assert.rejects(
			write("update", id, { expectedRevision: 1, changes: { tasks: [] } }, "rich_conflict_01"),
			/revision_conflict/,
		);
		assert.deepEqual((await rpc(db, "sill_get_content", [id])).tasks, body.tasks);
		assert.deepEqual((await rpc(db, "sill_list_contents", [null, null, 100])).items[0].tags, [
			"test",
		]);
		for (const invalid of [
			{
				tasks: [
					{ id: "x", text: "a" },
					{ id: "x", text: "b" },
				],
			},
			{ tasks: [{ id: "__proto__", text: "a" }] },
			{ sources: [{ name: "A" }] },
			{ start: "tomorrow" },
			{ form: "custom" },
			{ images: ["http://example.com/a.png"] },
			{ images: [] },
			{ tasks: [{ id: "a", text: "a", done: true }] },
			{ sources: [{ name: "A", kind: "agent", future: true }] },
			{ sender: { name: "A" } },
			{ future: true },
			{ summary: null },
			{ meeting: { name: "M", url: "javascript:alert(1)" } },
			{ revision: 999 },
			{ owner_id: "other" },
			{ why: { reason: "R" } },
		]) {
			if (!("tasks" in invalid && invalid.tasks?.length === 2))
				assert.equal(changes.safeParse(invalid).success, false, JSON.stringify(invalid));
			await assert.rejects(
				write(
					"update",
					id,
					{ expectedRevision: 2, changes: invalid },
					"invalid_" + crypto.randomUUID(),
				),
				/invalid_request/,
			);
		}
		const event = await write(
			"create",
			null,
			{ type: "event", title: "Meeting", start: 1000, end: 2000 },
			"rich_event_01",
		);
		await assert.rejects(
			write(
				"update",
				event.body.id,
				{ expectedRevision: 1, changes: { end: 500 } },
				"rich_event_02",
			),
			/invalid_request/,
		);
		assert.equal((await rpc(db, "sill_get_content", [event.body.id])).end, 2000);
		const removed = await write("delete", id, { expectedRevision: 2 }, "rich_delete_01");
		assert.equal(removed.body.deleted, true);
		assert.equal(removed.body.tasks, undefined);
		assert.equal(removed.body.sources, undefined);
	} finally {
		await db.close();
	}
});

test("all eleven card fixtures round-trip through cloud storage and skill examples match the contract", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		await applyCardMigrations(db);
		await identity(db);
		for (const sample of fixtures.valid.filter((s) => s.name !== "future-card")) {
			const body = Object.fromEntries(
				Object.entries(sample.card).filter(([key]) => key in create.shape),
			);
			assert.deepEqual(create.parse(body), body);
			const result = await rpc(db, "sill_write_v1", [
				"create",
				null,
				JSON.stringify(body),
				"fixture_" + sample.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
			]);
			for (const [key, value] of Object.entries(body))
				assert.deepEqual(result.body[key], value, sample.name + ":" + key);
		}
		const guide = await readFile(
			new URL("../../skills/sill/references/cards.md", import.meta.url),
			"utf8",
		);
		for (const [index, match] of [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].entries()) {
			const body = JSON.parse(match[1]);
			assert.deepEqual(create.parse(body), body);
			const result = await rpc(db, "sill_write_v1", [
				"create",
				null,
				JSON.stringify(body),
				"skill_example_" + index,
			]);
			assert.equal(result.body.title, body.title);
		}
	} finally {
		await db.close();
	}
});

test("rich SQL rejects invalid structured values without changing existing rows", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		await applyCardMigrations(db);
		await identity(db);
		const invalid = [
			{ type: "task", tasks: [] },
			{ type: "event", start: 1 },
			{ type: "event", start: 10, end: 5 },
			{ type: "media", media: "video" },
			{ type: "photo" },
			{ type: "photo", images: [] },
			{ type: "note", people: [{ name: "A" }] },
			{ type: "note", form: "capture" },
			{ type: "article", project: "Sill" },
			{ type: "file", files: [] },
			{ type: "note", priority: 11 },
			{ type: "note", duration: 1.5 },
			{ type: "note", sources: [{ name: "A", kind: null }] },
			{ type: "note", files: [{ name: "A", sizeBytes: -1 }] },
			{ type: "note", points: [""] },
			{ type: "note", body: ["Legacy paragraph"] },
			{ type: "note", related: ["__proto__"] },
		];
		for (const [index, body] of invalid.entries())
			await assert.rejects(
				rpc(db, "sill_write_v1", [
					"create",
					null,
					JSON.stringify({ title: "Invalid fixture", ...body }),
					"rich_bad_" + index,
				]),
				/invalid_request/,
			);
		assert.equal((await rpc(db, "sill_list_contents", [null, null, 100])).items.length, 0);
	} finally {
		await db.close();
	}
});
