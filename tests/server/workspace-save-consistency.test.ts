import assert from "node:assert/strict";
import test from "node:test";
import { CloudSync, clone } from "../../apps/web/services/cloud-sync.ts";
import { defaultAppearance } from "../../contracts/appearance.ts";
import { A, B, claims, identity, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";

test("first media and layout saves use database field baselines and do not block later writes", async () => {
	const f = await cloudFixture();
	try {
		await identity(f.db);
		const apply = (body: unknown, key: string) =>
			rpc(f.db, "sill_apply_operations", [JSON.stringify(body), key]);
		let snapshot = await apply(
			{
				operations: [
					{
						op: "card.upsert",
						card: { id: "media-first", type: "media", media: "podcast", title: "Podcast" },
						before: null,
					},
				],
			},
			"first-save-create",
		);
		for (const [key, value] of Object.entries(defaultAppearance))
			assert.equal(snapshot.state.preferences[key], value);
		assert.equal(snapshot.state.items["media-first"].playbackPosition, 0);
		let state = clone(snapshot.state);
		let lostResponse = false;
		const sent: { body: unknown; key: string }[] = [];
		const sync = new CloudSync({
			snapshot: () => state,
			owner: () => A,
			canSave: () => true,
			status: () => {},
			failure: () => {},
			adopt: (value) => {
				state = clone(value.state);
				sync.rebase(state, value.revision);
			},
			request: async (body, key) => {
				sent.push({ body: clone(body), key });
				const value = await apply(body, key);
				if (lostResponse) {
					lostResponse = false;
					throw Error("Synthetic lost response");
				}
				return value;
			},
		});
		sync.rebase(state, snapshot.revision);
		state.items["media-first"].playbackPosition = 12;
		await sync.flush();
		state.preferences.cardTextSize = "large";
		await sync.flush();
		state.items["media-first"].bookmarked = true;
		await sync.flush();
		assert.equal(sync.failed, null);
		assert.equal(sync.pending.length, 0);
		snapshot = await rpc(f.db, "sill_get_workspace");
		assert.equal(snapshot.state.items["media-first"].playbackPosition, 12);
		assert.equal(snapshot.state.preferences.cardTextSize, "large");
		assert.equal(snapshot.state.items["media-first"].bookmarked, true);

		lostResponse = true;
		state.seconds += 5;
		await sync.flush();
		assert.equal(sync.pending.length, 1);
		await sync.flush();
		assert.deepEqual(sent.at(-1), sent.at(-2));
		assert.equal((await rpc(f.db, "sill_get_workspace")).state.seconds, 5);
		assert.equal(sync.pending.length, 0);

		await apply(
			{
				operations: [
					{
						op: "preferences.patch",
						values: { cardTextSize: "small" },
						before: { cardTextSize: "large" },
					},
				],
			},
			"external-layout-change",
		);
		state.preferences.cardTextSize = "standard";
		await sync.flush();
		assert.match(sync.failed.message, /revision_conflict/);
		assert.equal((await rpc(f.db, "sill_get_workspace")).state.preferences.cardTextSize, "small");
	} finally {
		await f.close();
	}
});

test("full replacement clears omitted known fields and preserves extensions, state and replay", async () => {
	const f = await cloudFixture();
	try {
		await identity(f.db);
		const apply = (body: unknown, key: string) =>
			rpc(f.db, "sill_apply_operations", [JSON.stringify(body), key]);
		const initial = await apply(
			{
				operations: [
					{
						op: "card.upsert",
						before: null,
						card: {
							id: "replace-card",
							type: "note",
							title: "Before",
							body: "Old body",
							url: "https://example.com/old",
							summary: "Old summary",
							tags: ["old"],
							futureField: { keep: true },
						},
					},
					{
						op: "item.patch",
						id: "replace-card",
						values: { bookmarked: true },
						before: { bookmarked: false },
					},
				],
			},
			"replacement-create",
		);
		const body = {
			operations: [
				{
					op: "card.upsert",
					card: { id: "replace-card", type: "note", title: "After", body: "New body" },
					before: initial.state.cards[0],
				},
			],
		};
		const saved = await apply(body, "replacement-save");
		const actual = saved.state.cards[0];
		for (const field of ["url", "summary", "tags"]) assert.equal(field in actual, false, field);
		assert.deepEqual(actual.futureField, { keep: true });
		assert.equal(saved.state.items[actual.id].bookmarked, true);
		assert.deepEqual(await apply(body, "replacement-save"), saved);
		await assert.rejects(apply(body, "replacement-stale"), /revision_conflict/);
	} finally {
		await f.close();
	}
});

test("expired receipt responses are compacted per owner without releasing keys or changing live replays", async () => {
	const f = await cloudFixture();
	try {
		const body = { operations: [{ op: "reading.add", seconds: 5 }] };
		const apply = (key: string, value: unknown = body) =>
			rpc(f.db, "sill_apply_operations", [JSON.stringify(value), key]);
		await identity(f.db);
		await apply("expired-reading");
		const live = await apply("live-reading");
		await identity(f.db, claims(B));
		await apply("other-expired-reading");
		await f.db.exec("reset role");
		await f.db.exec(
			"update sill_private.receipts set created_at=clock_timestamp()-interval '9 days',expires_at=clock_timestamp()-interval '2 days' where idempotency_key<>'live-reading'",
		);
		await identity(f.db);
		assert.deepEqual(await rpc(f.db, "sill_get_workspace"), live);
		assert.deepEqual(await apply("live-reading"), live);
		await assert.rejects(apply("expired-reading"), /idempotency_expired/);
		await assert.rejects(
			apply("expired-reading", { operations: [{ op: "reading.add", seconds: 6 }] }),
			/idempotency_conflict/,
		);
		await assert.rejects(
			f.db.query("select sill_private.compact_receipt_responses()"),
			/permission denied/,
		);
		await f.db.exec("reset role");
		const rows: { owner_id: string; idempotency_key: string; response: unknown }[] = (
			await f.db.query(
				"select owner_id,idempotency_key,response from sill_private.receipts order by idempotency_key",
			)
		).rows;
		assert.equal(rows.length, 3);
		assert.equal(rows.find((row) => row.idempotency_key === "expired-reading")?.response, null);
		assert.deepEqual(rows.find((row) => row.idempotency_key === "live-reading")?.response, live);
		assert.notEqual(rows.find((row) => row.owner_id === B)?.response, null);
		await f.db.query(
			"update sill_private.caller_grants set scopes=array['content:read'] where owner_id=$1",
			[A],
		);
		await identity(f.db);
		await assert.rejects(apply("expired-reading"), /forbidden/);
	} finally {
		await f.close();
	}
});
