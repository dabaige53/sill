import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { prepareSupabaseImport } from "../../scripts/prepare-import.ts";
import { authenticateSupabase } from "../../server/cloud/supabase-auth.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const config: Record<string, any> = {
	url: "https://example.supabase.co",
	publishableKey: "sb_publishable_test",
};
const claims: Record<string, any> = {
	sub: owner,
	iss: config.url + "/auth/v1",
	aud: "authenticated",
	role: "authenticated",
	exp: Date.now() / 1000 + 600,
};
const factory = (c?: any) => () => ({
	auth: { getClaims: async () => ({ data: { claims: c }, error: null }) },
});
test("auth verifies with SDK, forwards user JWT, never persists a server session", async () => {
	let args: any;
	const result = await authenticateSupabase("Bearer a.b.c", config, (...a: any[]) => {
		args = a;
		return factory(claims)();
	});
	assert.deepEqual(result.principal, { userId: owner, clientId: null });
	assert.equal(args[2].global.headers.Authorization, "Bearer a.b.c");
	assert.equal(args[2].auth.persistSession, false);
	assert.equal(args[2].auth.autoRefreshToken, false);
});
test("auth rejects wrong issuer/audience/expiry/role/anonymous and malformed identities", async () => {
	for (const patch of [
		{ iss: "https://evil.invalid" },
		{ aud: "other" },
		{ exp: 0 },
		{ role: "service_role" },
		{ is_anonymous: true },
		{ sub: "not-uuid" },
		{ client_id: 3 },
		{ nbf: Date.now() / 1000 + 300 },
	]) {
		await assert.rejects(
			authenticateSupabase("Bearer a.b.c", config, factory({ ...claims, ...patch })),
			{ status: 401 },
		);
	}
	await assert.rejects(authenticateSupabase("Bearer opaque", config), { status: 401 });
	await assert.rejects(
		authenticateSupabase("Bearer a.b.c", { ...config, publishableKey: "sb_secret_test" }),
	);
});
test("OAuth identity is distinct; user metadata grants are not trusted", async () => {
	const r = await authenticateSupabase(
		"Bearer a.b.c",
		config,
		factory({ ...claims, client_id: "agent", user_metadata: { scope: "*" } }),
	);
	assert.deepEqual(r.principal, { userId: owner, clientId: "agent" });
});
test("auth error output excludes upstream details and credentials", async () => {
	await assert.rejects(
		authenticateSupabase("Bearer a.b.c", config, () => ({
			auth: {
				getClaims: async () => {
					throw new Error("secret");
				},
			},
		})),
		{ status: 503, message: "unavailable" },
	);
});
test("legacy preparation preserves specialized fields and separates revisions", () => {
	const snapshot: Record<string, any> = {
		revision: 45,
		state: {
			cards: [
				{
					id: "task1",
					type: "task",
					title: "T",
					tasks: [{ id: "a", text: "A", done: false }],
					people: ["X"],
					related: [],
					time: 42,
				},
			],
			items: { task1: { taskDone: ["a"], note: "note", read: true } },
			seconds: 20,
			preferences: { theme: "dark" },
			sources: [],
		},
	};
	const original = structuredClone(snapshot);
	const plan = prepareSupabaseImport(snapshot);
	assert.equal(plan.legacyRevision, 45);
	assert.equal(plan.contents[0].revision, 1);
	assert.deepEqual(plan.contents[0].card, snapshot.state.cards[0]);
	assert.deepEqual(plan.contents[0].item, snapshot.state.items.task1);
	assert.deepEqual(plan.contents[0].state, { read: true });
	assert.deepEqual(snapshot, original);
	plan.contents[0].card.title = "other";
	assert.equal(snapshot.state.cards[0].title, "T");
	snapshot.state.items.orphan = {};
	assert.throws(() => prepareSupabaseImport(snapshot), /Orphan/);
});
test("SQL foundation executes, isolates roles, enforces tenant references and tombstone scrubbing", async () => {
	const db = new PGlite();
	try {
		await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'),('22222222-2222-4222-8222-222222222222');`);
		await db.exec(
			await readFile(new URL("../../supabase/drafts/sill_v1_storage.sql", import.meta.url), "utf8"),
		);
		await db.exec(`insert into sill_private.workspaces(owner_id) select id from auth.users;
      insert into sill_private.contents(owner_id,id,change_version,card) values ('${owner}','one',1,'{"title":"private"}');`);
		for (const role of ["anon", "authenticated"]) {
			await db.exec(`set role ${role}`);
			await assert.rejects(
				db.query<Record<string, any>>("select * from sill_private.contents"),
				/permission denied/,
			);
			await db.exec("reset role");
		}
		// Even accidental future table grants do not disable RLS.
		await db.exec(
			"grant usage on schema sill_private to authenticated; grant select, insert, update, delete on all tables in schema sill_private to authenticated; set role authenticated;",
		);
		assert.equal(
			(await db.query<Record<string, any>>("select * from sill_private.contents")).rows.length,
			0,
		);
		assert.equal(
			(
				await db.query<Record<string, any>>(
					"update sill_private.contents set card='{}' returning id",
				)
			).rows.length,
			0,
		);
		assert.equal(
			(await db.query<Record<string, any>>("delete from sill_private.contents returning id")).rows
				.length,
			0,
		);
		await assert.rejects(
			db.exec(`insert into sill_private.workspaces(owner_id) values ('${owner}')`),
			/row-level security/,
		);
		await db.exec("reset role");
		await assert.rejects(
			db.exec("update sill_private.contents set deleted=true"),
			/check constraint/,
		);
		await assert.rejects(
			db.exec(`insert into sill_private.events(owner_id,event_id,card_id,card_version,action,destination_ref,assigned_caller)
      values ('22222222-2222-4222-8222-222222222222','e','one',1,'complete','agent','agent')`),
			/foreign key/,
		);
		await db.exec(
			"update sill_private.contents set deleted=true,card='{}',item='{}',state='{}',revision=2",
		);
		const rows = (
			await db.query<Record<string, any>>(
				"select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='sill_private' and relkind='r'",
			)
		).rows;
		assert.equal(rows.length, 5);
		assert.ok(rows.every((r?: any) => r.relrowsecurity));
	} finally {
		await db.close();
	}
});
