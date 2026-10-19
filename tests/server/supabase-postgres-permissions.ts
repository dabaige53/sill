import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyHiddenActionsMigration } from "./helpers/hidden-actions-migration.ts";

export async function runPostgresPermissions({
	asUser,
	holding,
	install,
	other,
	owner,
	parse,
	quote,
	sql,
	t,
	write,
}: {
	asUser: any;
	holding: any;
	install: any;
	other: any;
	owner: any;
	parse: any;
	quote: any;
	sql: any;
	t: any;
	write: any;
}) {
	await t.test("draft installs without any authenticated or anon execution privilege", async () => {
		await assert.rejects(
			sql(`${asUser()}select sill_private.get_content('x');`),
			/permission denied/,
		);
		await assert.rejects(
			sql("set role anon;select sill_private.get_content('x');"),
			/permission denied/,
		);
		assert.equal(
			await sql(
				"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sill_private' and p.prosecdef;",
			),
			"0",
		);
	});
	// Synthetic local permissions, never migration content or production SQL.
	await sql(`insert into sill_private.workspaces(owner_id) select id from auth.users;
    insert into sill_private.caller_grants values('${owner}','user:${owner}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*']),
    ('${other}','user:${other}',array['content:read','content:write','content:delete'],array['*']);
    grant usage on schema sill_private to authenticated;grant execute on all functions in schema sill_private to authenticated;
    grant select,insert,update,delete on sill_private.workspaces,sill_private.contents,sill_private.events,sill_private.receipts,sill_private.sync_snapshots to authenticated;
    grant select on sill_private.caller_grants,sill_private.destinations to authenticated;`);
	const created = parse(
		await sql(
			asUser() + write("create", null, { title: "Concurrent", type: "note" }, "initial_01"),
		),
	);
	const id = created.body.id;
	await t.test(
		"two same-revision writers serialize; stale writer conflicts after first commit",
		async () => {
			const first = sql(
				`set application_name='sill-lock-a';${asUser()}begin;${write("update", id, { expectedRevision: 1, changes: { title: "Winner" } }, "writer_a1")}select pg_sleep(1.5);commit;`,
			);
			await holding("sill-lock-a");
			const second = sql(
				asUser() +
					write("update", id, { expectedRevision: 1, changes: { title: "Loser" } }, "writer_b1"),
			);
			const results = await Promise.allSettled([first, second]);
			assert.equal(results[0].status, "fulfilled");
			assert.equal(results[1].status, "rejected");
			assert.match(results[1].reason.message, /revision_conflict/);
			const row = JSON.parse(
				await sql(`${asUser()}select sill_private.get_content(${quote(id)});`),
			);
			assert.equal(row.title, "Winner");
			assert.equal(row.revision, 2);
			assert.equal(
				await sql("select count(*) from sill_private.receipts where idempotency_key='writer_b1';"),
				"0",
			);
		},
	);
	await t.test("concurrent duplicate create returns same receipt and creates one row", async () => {
		const request = write("create", null, { title: "Once", type: "note" }, "duplicate1");
		const first = sql(
			`set application_name='sill-lock-b';${asUser()}begin;${request}select pg_sleep(1.5);commit;`,
		);
		await holding("sill-lock-b");
		const [a, b] = await Promise.all([first, sql(asUser() + request)]);
		assert.deepEqual(parse(a), parse(b));
		assert.equal(
			await sql("select count(*) from sill_private.contents where card->>'title'='Once';"),
			"1",
		);
	});
	await t.test(
		"snapshot cannot take watermark of uncommitted writer and delta includes later tombstone",
		async () => {
			const first = sql(
				`set application_name='sill-lock-c';${asUser()}begin;${write("update", id, { expectedRevision: 2, changes: { title: "Committed" } }, "writer_c1")}select pg_sleep(1.5);commit;`,
			);
			await holding("sill-lock-c");
			const reader = sql(`${asUser()}select sill_private.list_contents(null,null,100);`);
			const [, page] = await Promise.all([first, reader]);
			const snap = JSON.parse(page);
			assert.equal(snap.items.find((c?: any) => c.id === id).title, "Committed");
			assert.ok(snap.sync_cursor);
			await sql(asUser() + write("delete", id, { expectedRevision: 3 }, "delete001"));
			const delta = JSON.parse(
				await sql(
					`${asUser()}select sill_private.list_contents(null,${quote(snap.sync_cursor)},100);`,
				),
			);
			assert.equal(delta.items.length, 1);
			assert.equal(delta.items[0].deleted, true);
			assert.equal(delta.items[0].revision, 4);
		},
	);
	await t.test(
		"later transaction failure rolls back content, watermark and receipt together",
		async () => {
			const before = await sql(
				`select change_version from sill_private.workspaces where owner_id='${owner}';`,
			);
			await assert.rejects(
				sql(
					asUser() +
						"begin;" +
						write("create", null, { title: "Rolled back", type: "note" }, "rollback1") +
						"select 1/0;commit;",
				),
				/division by zero/,
			);
			assert.equal(
				await sql("select count(*) from sill_private.contents where card->>'title'='Rolled back';"),
				"0",
			);
			assert.equal(
				await sql("select count(*) from sill_private.receipts where idempotency_key='rollback1';"),
				"0",
			);
			assert.equal(
				await sql(`select change_version from sill_private.workspaces where owner_id='${owner}';`),
				before,
			);
		},
	);
	await t.test("real RLS blocks cross-owner raw rows and grant self-escalation", async () => {
		assert.equal(await sql(`${asUser(other)}select count(*) from sill_private.contents;`), "0");
		await assert.rejects(
			sql(asUser(other) + write("delete", id, { expectedRevision: 4 }, "denied001")),
			/not_found/,
		);
		await assert.rejects(
			sql(`${asUser()}update sill_private.caller_grants set scopes=array['*'];`),
			/permission denied/,
		);
		await assert.rejects(
			sql(
				asUser(owner, "unregistered") +
					write("create", null, { title: "No", type: "note" }, "denied002"),
			),
			/forbidden/,
		);
		await assert.rejects(
			sql(
				asUser(other) +
					`insert into sill_private.contents(owner_id,id,change_version,card) values('${owner}','forged',1,'{}');`,
			),
			/row-level security/,
		);
	});
	await t.test(
		"final boundary: public RPC works but direct tables, raw private RPC and same-owner ungranted client fail",
		async () => {
			await install("sill_v1_boundary.sql");
			await install("sill_v1_sessions_snapshots.sql");
			assert.equal(
				await sql(
					"select count(*) from pg_auth_members m join pg_roles a on a.oid=m.member join pg_roles r on r.oid=m.roleid where r.rolname='sill_rpc_executor' and (m.set_option or m.inherit_option);",
				),
				"0",
			);
			await assert.rejects(
				sql("set session authorization sill_installer;set role sill_rpc_executor;"),
				/permission denied/,
			);
			assert.equal(
				await sql(
					"select count(*) from pg_tables where schemaname='sill_private' and tableowner='sill_rpc_executor';",
				),
				"0",
			);
			await sql(
				"update sill_private.caller_grants set audience='authenticated' where caller_id like 'user:%';",
			);
			assert.equal(
				await sql("select has_schema_privilege('sill_rpc_executor','auth','USAGE');"),
				"f",
			);
			assert.equal(
				await sql("select pg_has_role('sill_rpc_executor','authenticated','MEMBER');"),
				"f",
			);
			for (const fn of ["uid", "jwt"])
				await assert.rejects(
					sql(`set role sill_rpc_executor;select auth.${fn}();`),
					/permission denied/,
				);
			// All CRUD below uses public RPCs through the executor, with auth schema inaccessible.
			const made = parse(
				await sql(
					asUser() +
						'select public.sill_write_v1(\'create\',null,\'{"type":"note","title":"No auth schema"}\',\'public_create1\');',
				),
			);
			const publicId = made.body.id;
			assert.equal(
				JSON.parse(await sql(`${asUser()}select public.sill_get_content(${quote(publicId)});`))
					.title,
				"No auth schema",
			);
			assert.equal(
				parse(
					await sql(
						asUser() +
							`select public.sill_write_v1('update',${quote(publicId)},'{"expectedRevision":1,"changes":{"title":"Updated"}}','public_update1');`,
					),
				).body.revision,
				2,
			);
			assert.equal(
				parse(
					await sql(
						asUser() +
							`select public.sill_write_v1('delete',${quote(publicId)},'{"expectedRevision":2}','public_delete1');`,
					),
				).body.deleted,
				true,
			);
			await assert.rejects(
				sql(`${asUser()}select public.sill_get_content(${quote(publicId)});`),
				/not_found/,
			);
			const current = JSON.parse(
				await sql(`${asUser()}select public.sill_list_contents(null,null,100);`),
			);
			assert.ok(current.items.length > 0);
			for (const statement of [
				"select * from sill_private.contents;",
				"update sill_private.contents set card='{}';",
				"select * from sill_private.caller_grants;",
				"select sill_private.get_content('x');",
			]) {
				await assert.rejects(sql(asUser() + statement), /permission denied/);
			}
			assert.equal(
				await sql("select pg_has_role('authenticated','sill_rpc_executor','MEMBER');"),
				"f",
			);
			assert.equal(
				await sql(
					"select rolbypassrls or rolsuper or rolcanlogin from pg_roles where rolname='sill_rpc_executor';",
				),
				"f",
			);
			await assert.rejects(
				sql(`${asUser(owner, "unregistered")}select public.sill_list_contents(null,null,100);`),
				/forbidden/,
			);
			const target = current.items[0].id;
			await sql(
				`insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values('${owner}','oauth:reader',array['content:read'],array[${quote(target)}],'https://sill.example/mcp');`,
			);
			assert.equal(
				JSON.parse(
					await sql(`${asUser(owner, "reader")}select public.sill_get_content(${quote(target)});`),
				).id,
				target,
			);
			await assert.rejects(
				sql(
					asUser(owner, "reader") +
						`select public.sill_write_v1('delete',${quote(target)},'{"expectedRevision":1}','denied001');`,
				),
				/forbidden/,
			);
			await assert.rejects(
				sql(`${asUser(other)}select public.sill_get_content(${quote(target)});`),
				/not_found/,
			);
		},
	);
	await t.test(
		"hiddenActions migration preserves preferences and rejects invalid batches through public RPC",
		async () => {
			const migrate = async (name: string) =>
				sql(
					"set session authorization sill_installer;set createrole_self_grant='';" +
						(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8")),
				);
			for (const name of [
				"20261016052843_sill_rich_cards.sql",
				"20261016092653_sill_workspace_operations.sql",
			])
				await migrate(name);
			await verifyHiddenActionsMigration({ sql, migrate, identity: asUser(), owner });
		},
	);
}
