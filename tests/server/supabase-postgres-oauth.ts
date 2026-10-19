import assert from "node:assert/strict";

export async function runPostgresOauth({
	asUser,
	install,
	other,
	owner,
	quote,
	sql,
	t,
}: {
	asUser: any;
	install: any;
	other: any;
	owner: any;
	quote: any;
	sql: any;
	t: any;
}) {
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
				sql(`${asUser(owner, client)}select public.sill_oauth_flow('list','{}');`),
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
					sql(`${asUser()}select * from sill_private.${table};`),
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
				sql(`${asUser()}select sill_private.oauth_access_token_hook('{}');`),
				/permission denied/,
			);
			await assert.rejects(
				sql(`${asUser()}select * from sill_private.oauth_token_sessions;`),
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
}
