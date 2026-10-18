/** Real isolated PostgreSQL sessions; no host ports, volumes, passwords or cloud access. */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyHiddenActionsMigration } from "./helpers/hidden-actions-migration.ts";

const image =
	"postgres:17.11@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const container = `sill-pg-test-${process.pid}`;
const quote = (x?: any) => "'" + String(x).replaceAll("'", "''") + "'";
function command(args?: any, input: any = "") {
	return new Promise<string>((resolve, reject) => {
		const p = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
		let out = "",
			err = "";
		p.stdout.on("data", (d?: any) => (out += d));
		p.stderr.on("data", (d?: any) => (err += d));
		p.on("error", reject);
		p.on("close", (code?: any) =>
			code ? reject(Object.assign(new Error(err || out), { code })) : resolve(out.trim()),
		);
		p.stdin.end(input);
	});
}
const sql = (s?: any) =>
	command(
		["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
		s,
	);
const install = async (name?: any) =>
	sql(
		"set session authorization sill_installer;set createrole_self_grant='';" +
			(await readFile(new URL("../../supabase/drafts/" + name, import.meta.url), "utf8")),
	);
const asUser = (sub: any = owner, client?: any) =>
	`set request.jwt.claims=${quote(JSON.stringify({ sub, role: "authenticated", aud: client ? "https://sill.example/mcp" : "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, ...(client ? { client_id: client } : {}) }))};set role authenticated;`;
const write = (op?: any, id?: any, payload?: any, key?: any) =>
	`select sill_private.write_v1(${quote(op)},${id === null ? "null" : quote(id)},${quote(JSON.stringify(payload))}::jsonb,${quote(key)});`;
const parse = (out?: any) => JSON.parse(out.split("\n").filter(Boolean)[0]);
async function holding(name?: any) {
	for (let n = 0; n < 100; n++) {
		if (
			(await sql(
				`select count(*) from pg_stat_activity where application_name=${quote(name)} and wait_event='PgSleep';`,
			)) === "1"
		)
			return;
		await new Promise((r?: any) => setTimeout(r, 30));
	}
	throw new Error("Writer never acquired lock");
}
test("PostgreSQL 17 actual SQL, concurrent sessions, RLS and rollback", {
	timeout: 90000,
}, async (t?: any) => {
	let started = false;
	try {
		await command([
			"run",
			"--rm",
			"-d",
			"--name",
			container,
			"--network",
			"none",
			"--tmpfs",
			"/var/lib/postgresql/data:rw",
			"-e",
			"POSTGRES_HOST_AUTH_METHOD=trust",
			image,
		]);
		started = true;
		let ready = false;
		for (let n = 0; n < 150; n++) {
			try {
				// The image briefly runs a temporary init server; wait for the final PID 1 server.
				if ((await command(["exec", container, "cat", "/proc/1/comm"])) === "postgres") {
					await command(["exec", container, "pg_isready", "-U", "postgres"]);
					ready = true;
					break;
				}
			} catch {}
			await new Promise((r?: any) => setTimeout(r, 100));
		}
		assert.ok(ready, "Postgres became ready");
		await sql(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    revoke all on function auth.uid(),auth.jwt() from public;grant execute on function auth.uid(),auth.jwt() to authenticated;grant usage on schema auth to authenticated;
    insert into auth.users values('${owner}'),('${other}');`);
		await sql(`create role sill_installer nologin nosuperuser nocreatedb createrole noinherit nobypassrls;
    grant create on database postgres to sill_installer;grant create on schema public to sill_installer;
    grant usage on schema auth to sill_installer;grant references,select on auth.users to sill_installer;`);
		assert.equal(
			await sql(
				"set session authorization sill_installer;set createrole_self_grant='';select current_setting('is_superuser')||':'||current_setting('createrole_self_grant');",
			),
			"off:",
		);
		assert.equal(
			await sql("select has_schema_privilege('sill_installer','auth','USAGE WITH GRANT OPTION');"),
			"f",
		);
		assert.equal(
			await sql(
				"select has_function_privilege('sill_installer','auth.uid()','EXECUTE WITH GRANT OPTION') or has_function_privilege('sill_installer','auth.jwt()','EXECUTE WITH GRANT OPTION');",
			),
			"f",
		);
		for (const file of ["sill_v1_storage.sql", "sill_v1_rpc.sql"]) await install(file);
		await t.test(
			"draft installs without any authenticated or anon execution privilege",
			async () => {
				await assert.rejects(
					sql(asUser() + "select sill_private.get_content('x');"),
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
			},
		);
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
					await sql(asUser() + `select sill_private.get_content(${quote(id)});`),
				);
				assert.equal(row.title, "Winner");
				assert.equal(row.revision, 2);
				assert.equal(
					await sql(
						"select count(*) from sill_private.receipts where idempotency_key='writer_b1';",
					),
					"0",
				);
			},
		);
		await t.test(
			"concurrent duplicate create returns same receipt and creates one row",
			async () => {
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
			},
		);
		await t.test(
			"snapshot cannot take watermark of uncommitted writer and delta includes later tombstone",
			async () => {
				const first = sql(
					`set application_name='sill-lock-c';${asUser()}begin;${write("update", id, { expectedRevision: 2, changes: { title: "Committed" } }, "writer_c1")}select pg_sleep(1.5);commit;`,
				);
				await holding("sill-lock-c");
				const reader = sql(asUser() + "select sill_private.list_contents(null,null,100);");
				const [, page] = await Promise.all([first, reader]);
				const snap = JSON.parse(page);
				assert.equal(snap.items.find((c?: any) => c.id === id).title, "Committed");
				assert.ok(snap.sync_cursor);
				await sql(asUser() + write("delete", id, { expectedRevision: 3 }, "delete001"));
				const delta = JSON.parse(
					await sql(
						asUser() + `select sill_private.list_contents(null,${quote(snap.sync_cursor)},100);`,
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
					await sql(
						"select count(*) from sill_private.contents where card->>'title'='Rolled back';",
					),
					"0",
				);
				assert.equal(
					await sql(
						"select count(*) from sill_private.receipts where idempotency_key='rollback1';",
					),
					"0",
				);
				assert.equal(
					await sql(
						`select change_version from sill_private.workspaces where owner_id='${owner}';`,
					),
					before,
				);
			},
		);
		await t.test("real RLS blocks cross-owner raw rows and grant self-escalation", async () => {
			assert.equal(await sql(asUser(other) + "select count(*) from sill_private.contents;"), "0");
			await assert.rejects(
				sql(asUser(other) + write("delete", id, { expectedRevision: 4 }, "denied001")),
				/not_found/,
			);
			await assert.rejects(
				sql(asUser() + "update sill_private.caller_grants set scopes=array['*'];"),
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
					JSON.parse(await sql(asUser() + `select public.sill_get_content(${quote(publicId)});`))
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
					sql(asUser() + `select public.sill_get_content(${quote(publicId)});`),
					/not_found/,
				);
				const current = JSON.parse(
					await sql(asUser() + "select public.sill_list_contents(null,null,100);"),
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
					sql(asUser(owner, "unregistered") + "select public.sill_list_contents(null,null,100);"),
					/forbidden/,
				);
				const target = current.items[0].id;
				await sql(
					`insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values('${owner}','oauth:reader',array['content:read'],array[${quote(target)}],'https://sill.example/mcp');`,
				);
				assert.equal(
					JSON.parse(
						await sql(
							asUser(owner, "reader") + `select public.sill_get_content(${quote(target)});`,
						),
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
					sql(asUser(other) + `select public.sill_get_content(${quote(target)});`),
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
							(await readFile(
								new URL("../../supabase/migrations/" + name, import.meta.url),
								"utf8",
							)),
					);
				for (const name of [
					"20261016052843_sill_rich_cards.sql",
					"20261016092653_sill_workspace_operations.sql",
				])
					await migrate(name);
				await verifyHiddenActionsMigration({ sql, migrate, identity: asUser(), owner });
			},
		);
		await t.test(
			"consent gateway installs as NOSUPERUSER; concurrent claim, revoke and stale finalization are safe",
			async () => {
				await install("sill_v1_oauth_consent.sql");
				const client = "33333333-3333-4333-8333-333333333333",
					auth = "44444444-4444-4444-8444-444444444444";
				const policy: Record<string, any> = {
					clientId: client,
					appOrigin: "https://sill.example",
					audience: "https://sill.example/mcp",
					redirectUris: ["http://127.0.0.1:5876/callback"],
					identityScopes: ["openid"],
					contentScopes: ["content:read"],
					resources: ["*"],
				};
				await sql(
					`insert into sill_private.oauth_clients(owner_id,client_id,policy,enabled) values('${owner}','${client}',${quote(JSON.stringify(policy))},true);`,
				);
				const review: Record<string, any> = {
					authorizationId: auth,
					userId: owner,
					clientId: client,
					audience: policy.audience,
					redirectUri: policy.redirectUris[0],
					identityScopes: ["openid"],
					contentScopes: ["content:read"],
					resources: ["*"],
				};
				const flow = "55555555-5555-4555-8555-555555555555",
					proof: Record<string, any> = {
						flowId: flow,
						browserHash: "a".repeat(64),
						csrfHash: "b".repeat(64),
					};
				const rpc = (op?: any, p?: any, who: any = owner) =>
					sql(
						asUser(who) +
							`select public.sill_oauth_flow(${quote(op)},${quote(JSON.stringify(p))}::jsonb);`,
					);
				await rpc("begin", { ...proof, kind: "consent", clientId: client, review });
				const claims = await Promise.allSettled([
					rpc("claim", { ...proof, decision: "approve" }),
					rpc("claim", { ...proof, decision: "approve" }),
				]);
				assert.equal(claims.filter((x?: any) => x.status === "fulfilled").length, 1);
				assert.match(
					claims.find((result): result is PromiseRejectedResult => result.status === "rejected")
						.reason.message,
					/revision_conflict/,
				);
				await assert.rejects(rpc("inspect", proof, other), /not_found/);
				await assert.rejects(
					sql(asUser(owner, client) + "select public.sill_oauth_flow('list','{}');"),
					/forbidden/,
				);
				const revoke: Record<string, any> = {
					...proof,
					flowId: "66666666-6666-4666-8666-666666666666",
				};
				await rpc("begin", { ...revoke, kind: "revoke", clientId: client });
				await rpc("claim", { ...revoke, decision: "revoke" });
				await assert.rejects(rpc("finish", { ...proof, result: "approved" }), /revision_conflict/);
				assert.equal(
					await sql(
						`select count(*) from sill_private.caller_grants where caller_id='oauth:${client}';`,
					),
					"0",
				);
				assert.equal(
					await sql(
						"select rolbypassrls or rolsuper or rolcanlogin from pg_roles where rolname='sill_consent_executor';",
					),
					"f",
				);
				assert.equal(
					await sql("select count(*) from pg_tables where tableowner='sill_consent_executor';"),
					"0",
				);
				assert.equal(
					await sql("select pg_has_role('authenticated','sill_consent_executor','MEMBER');"),
					"f",
				);
				await assert.rejects(
					sql("set session authorization sill_installer;set role sill_consent_executor;"),
					/permission denied/,
				);
				for (const table of ["oauth_clients", "oauth_flows", "oauth_audit", "caller_grants"])
					await assert.rejects(
						sql(asUser() + `select * from sill_private.${table};`),
						/permission denied/,
					);
			},
		);
		await t.test(
			"issuer hook installs without SUPERUSER and has no public invocation or table ownership",
			async () => {
				await sql("create role supabase_auth_admin nologin;");
				await install("sill_v1_oauth_token_hook.sql");
				assert.equal(
					await sql(
						"select rolbypassrls or rolsuper or rolcanlogin from pg_roles where rolname='sill_oauth_issuer';",
					),
					"f",
				);
				assert.equal(
					await sql("select count(*) from pg_tables where tableowner='sill_oauth_issuer';"),
					"0",
				);
				assert.equal(
					await sql("select pg_has_role('authenticated','sill_oauth_issuer','MEMBER');"),
					"f",
				);
				await assert.rejects(
					sql("set session authorization sill_installer;set role sill_oauth_issuer;"),
					/permission denied/,
				);
				await assert.rejects(
					sql(asUser() + "select sill_private.oauth_access_token_hook('{}');"),
					/permission denied/,
				);
				await assert.rejects(
					sql(asUser() + "select * from sill_private.oauth_token_sessions;"),
					/permission denied/,
				);
				const event: Record<string, any> = {
					user_id: owner,
					authentication_method: "magiclink",
					claims: { sub: owner, aud: "authenticated" },
				};
				assert.deepEqual(
					JSON.parse(
						await sql(
							"set role supabase_auth_admin;select sill_private.oauth_access_token_hook(" +
								quote(JSON.stringify(event)) +
								"::jsonb);",
						),
					),
					{ claims: event.claims },
				);
			},
		);
		console.log("ENGINE " + (await sql("select version();")));
	} finally {
		if (started) await command(["rm", "-f", container]);
	}
});
