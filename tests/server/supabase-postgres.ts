import { runPostgresOauth } from "./supabase-postgres-oauth.ts";
import { runPostgresPermissions } from "./supabase-postgres-permissions.ts";
/** Real isolated PostgreSQL sessions; no host ports, volumes, passwords or cloud access. */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const image =
	"postgres:17.11@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const container = `sill-pg-test-${process.pid}`;
const quote = (x?: any) => `'${String(x).replaceAll("'", "''")}'`;
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
			(await readFile(new URL(`../../supabase/drafts/${name}`, import.meta.url), "utf8")),
	);
const asUser = (sub: any = owner, client?: any) =>
	`set request.jwt.claims=${quote(JSON.stringify({ sub, role: "authenticated", aud: client ? "https://sill.example/mcp" : "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, ...(client ? { client_id: client } : {}) }))};set role authenticated;`;
const write = (op?: any, id?: any, payload?: any, key?: any) =>
	`select sill_private.write_v1(${quote(op)},${id === null ? "null" : quote(id)},${quote(JSON.stringify(payload))}::jsonb,${quote(key)});`;
const parse = (out?: any) => JSON.parse(out.split("\n").filter(Boolean)[0]);
/** Keep the writer's connection open until the competing session is actually blocked. */
async function transaction(statement: string) {
	const p = spawn(
		"docker",
		["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	let signalReady!: () => void;
	let failReady!: (reason?: unknown) => void;
	const ready = new Promise<void>((resolve, reject) => {
		signalReady = resolve;
		failReady = reject;
	});
	let complete!: (output: string) => void;
	let fail!: (reason?: unknown) => void;
	const result = new Promise<string>((resolve, reject) => {
		complete = resolve;
		fail = reject;
	});
	const marker = "sill_transaction_ready";
	let out = "",
		err = "";
	p.stdout.on("data", (data) => {
		out += data;
		if (out.includes(`\n${marker}\n`)) signalReady();
	});
	p.stderr.on("data", (data) => (err += data));
	p.on("error", fail);
	p.stdin.on("error", fail);
	p.on("close", (code) => {
		if (code) fail(new Error(err || out));
		else complete(out.replace(`\n${marker}\n`, "\n").trim());
	});
	result.then(() => failReady(new Error("Transaction ended before its ready signal")), failReady);
	p.stdin.write(`begin;${statement}\n\\echo ${marker}\n`);
	await ready;
	return {
		result,
		commit() {
			p.stdin.end("commit;\n");
		},
		rollback() {
			if (!p.stdin.writableEnded) p.stdin.end("rollback;\n");
		},
	};
}
async function blocked(name: string) {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (
			(await sql(
				`select count(*) from pg_stat_activity where application_name=${quote(name)} and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0;`,
			)) === "1"
		)
			return;
	}
	throw new Error(`Session ${name} never waited for the uncommitted writer`);
}
// @wu-test type=integration | scope=PostgreSQL test entry and installer | protects=Install database drafts with restricted privileges and run PostgreSQL boundary checks
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
		await runPostgresPermissions({
			asUser,
			blocked,
			install,
			other,
			owner,
			parse,
			quote,
			sql,
			t,
			transaction,
			write,
		});

		await runPostgresOauth({ asUser, install, other, owner, quote, sql, t });

		console.log(`ENGINE ${await sql("select version();")}`);
	} finally {
		if (started) await command(["rm", "-f", container]);
	}
});
