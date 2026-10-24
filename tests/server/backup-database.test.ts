import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { A, B, claims, identity, setupBoundary } from "./helpers/boundary-fixture.ts";

test("external backup: owner boundary, immutable capture, atomic replacement, revision and durable receipt", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		for (const name of (await readdir(new URL("../../supabase/migrations/", import.meta.url)))
			.sort()
			.filter((n) => n >= "20261016052843" && n.endsWith(".sql"))) {
			await db.exec(
				await readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"),
			);
		}
		await identity(db);
		const op = async (op: string, p: any = {}) =>
			(
				await db.query<{ v: any }>("select public.sill_backup_operation($1,$2::jsonb) v", [
					op,
					JSON.stringify(p),
				])
			).rows[0].v;
		const workspace = async () =>
			(await db.query<{ v: any }>("select public.sill_get_workspace() v")).rows[0].v;
		const apply = async (body: any, key: string) =>
			(
				await db.query<{ v: any }>("select public.sill_apply_operations($1::jsonb,$2) v", [
					JSON.stringify(body),
					key,
				])
			).rows[0].v;
		const target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		await op("save_target", {
			id: target,
			config: { provider: "webdav", endpoint: "https://dav.jianguoyun.com/dav/Sill/" },
			sealed: { version: 1, data: [1], iv: [2] },
		});
		await apply(
			{
				expectedRevision: 0,
				operations: [
					{
						op: "card.upsert",
						card: { id: "one", type: "note", title: "Before", body: "content" },
						before: null,
					},
					{
						op: "item.patch",
						id: "one",
						values: { bookmarked: true, archived: true, playbackPosition: 19 },
					},
					{ op: "reading.add", seconds: 7 },
				],
			},
			"initial-synthetic",
		);
		const before = await workspace();
		const row = await op("reserve", {
			id,
			targetId: target,
			key: "backup-synthetic-key",
			remoteId: null,
			content: "cannot inject",
		});
		assert.equal(JSON.parse(row.content).workspace.state.seconds, 7);
		assert.equal(JSON.parse(row.content).workspace.state.items.one.playbackPosition, 19);
		assert.ok(!(await op("list")).targets[0].sealed);
		await apply(
			{
				expectedRevision: before.revision,
				operations: [
					{ op: "card.delete", id: "one" },
					{ op: "card.upsert", card: { id: "two", type: "note", title: "After" }, before: null },
					{ op: "reading.add", seconds: 5 },
				],
			},
			"later-synthetic",
		);
		const later = await workspace();
		const replay = await op("reserve", {
			id: crypto.randomUUID(),
			targetId: target,
			key: "backup-synthetic-key",
		});
		assert.equal(replay.id, id);
		assert.equal(replay.content, row.content);
		await op("ready", { id, digest: row.digest });
		const request = {
			backupId: id,
			digest: row.digest,
			expectedRevision: before.revision,
			confirmed: true,
			idempotencyKey: "restore-synthetic-key",
		};
		await assert.rejects(op("restore", request), /revision_conflict/);
		assert.deepEqual(await workspace(), later);
		request.expectedRevision = later.revision;
		assert.equal(await op("restore_status", request), null);
		const restored = await op("restore", request);
		assert.equal(restored.restored, true);
		const actual = await workspace();
		assert.equal(actual.state.cards.length, 1);
		assert.equal(actual.state.cards[0].id, "one");
		assert.equal(actual.state.items.one.bookmarked, true);
		assert.equal(actual.state.items.one.archived, true);
		assert.equal(actual.state.items.one.playbackPosition, 19);
		assert.equal(actual.state.seconds, 7);
		assert.ok(actual.revision > later.revision);
		assert.deepEqual(await op("restore", request), restored);
		assert.deepEqual(await op("restore_status", request), restored);
		await assert.rejects(
			op("restore", { ...request, expectedRevision: actual.revision }),
			/idempotency_conflict/,
		);
		await identity(db, claims(B));
		assert.deepEqual((await op("list")).backups, []);
		await assert.rejects(op("read", { id }), /not_found/);
		await assert.rejects(op("target", { id: target }), /not_found/);
		await identity(db);
		await db.exec("reset role");
		await db.exec(
			`update sill_private.caller_grants set scopes=array['content:read'] where owner_id='${A}'`,
		);
		await identity(db);
		await assert.rejects(op("restore", request), /forbidden/);
		await assert.rejects(
			op("reserve", { id: crypto.randomUUID(), targetId: target, key: "another-key" }),
			/forbidden/,
		);
	} finally {
		await db.close();
	}
});
