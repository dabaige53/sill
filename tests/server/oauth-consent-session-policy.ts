import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { A, B, claims, identity } from "./helpers/boundary-fixture.ts";
import { AUTH, C, oauthFixture } from "./helpers/oauth-fixture.ts";

export async function registerSessionPolicyTests() {
	test("draft issuer binds versions to immutable OAuth sessions; old access/refresh cannot revive after reconsent", async () => {
		const f = await oauthFixture();
		try {
			await f.sql("create role supabase_auth_admin nologin");
			await f.db.exec(
				await readFile(
					new URL("../../supabase/drafts/sill_v1_oauth_token_hook.sql", import.meta.url),
					"utf8",
				),
			);
			const hook = async (event?: any) => {
				await f.sql("set role supabase_auth_admin");
				return (
					await f.db.query("select sill_private.oauth_access_token_hook($1) as result", [
						JSON.stringify(event),
					])
				).rows[0].result.claims;
			};
			const session = "77777777-7777-4777-8777-777777777777";
			const event: Record<string, any> = {
				user_id: A,
				authentication_method: "oauth_provider/authorization_code",
				claims: claims(A, { client_id: C, session_id: session }),
			};
			const web: Record<string, any> = {
				user_id: A,
				authentication_method: "magiclink",
				claims: claims(),
			};
			assert.deepEqual(await hook(web), web.claims);
			const unknown: Record<string, any> = { ...event, claims: { ...event.claims, client_id: B } };
			assert.deepEqual(await hook(unknown), unknown.claims);
			assert.equal((await hook(event)).sill_consent_version, undefined);
			await f.decide(await f.form());
			const issued = await hook(event);
			assert.equal(issued.aud, f.policy.audience);
			assert.equal(issued.sill_consent_version, 1);
			const authorized = async (c?: any) => {
				await identity(f.db, c);
				return f.db.query("select public.sill_session_info()");
			};
			await authorized(issued);
			await assert.rejects(authorized({ ...issued, sill_consent_version: undefined }), /forbidden/);
			assert.equal(
				(await hook({ ...event, authentication_method: "token_refresh" })).sill_consent_version,
				1,
			);
			await f.decide(await f.form("/oauth/grants"), "revoke");
			await assert.rejects(authorized(issued), /forbidden/);
			await f.decide(await f.form());
			const newVersion = (await f.grant()).consent_version;
			assert.equal(newVersion, 3);
			await assert.rejects(authorized(issued), /forbidden/);
			const oldRefresh = await hook({ ...event, authentication_method: "token_refresh" });
			assert.equal(oldRefresh.sill_consent_version, undefined);
			await assert.rejects(authorized(oldRefresh), /forbidden/);
			const reusedSession = await hook(event);
			assert.equal(reusedSession.sill_consent_version, undefined);
			const newEvent: Record<string, any> = {
				...event,
				claims: {
					...event.claims,
					session_id: "88888888-8888-4888-8888-888888888888",
					sill_consent_version: 999,
				},
			};
			const preexistingRefresh = await hook({
				...newEvent,
				authentication_method: "token_refresh",
			});
			assert.equal(preexistingRefresh.sill_consent_version, undefined);
			const fresh = await hook(newEvent);
			assert.equal(fresh.sill_consent_version, 3);
			await authorized(fresh);
			await identity(f.db);
			await assert.rejects(
				f.db.query("select sill_private.oauth_access_token_hook($1)", [JSON.stringify(newEvent)]),
				/permission denied/,
			);
			await assert.rejects(
				f.db.query("select * from sill_private.oauth_token_sessions"),
				/permission denied/,
			);
			assert.deepEqual(await hook(web), web.claims);
		} finally {
			await f.close();
		}
	});

	test("owner-reviewed full Sill policy persists all five scopes without widening another client", async () => {
		const f = await oauthFixture();
		try {
			f.policy.contentScopes = [
				"content:read",
				"content:write",
				"content:delete",
				"event:submit",
				"event:read",
			];
			await f.sql("update sill_private.oauth_clients set policy=$1", [JSON.stringify(f.policy)]);
			const form = await f.form();
			assert.equal((await f.decide(form)).status, 303);
			assert.deepEqual((await f.grant()).scopes, f.policy.contentScopes);
		} finally {
			await f.close();
		}
	});

	test("opaque provider authorization IDs survive review, login return and SQL without UUID coercion", async () => {
		const opaque = "synthetic_authorization_handle_01",
			f = await oauthFixture({ authorizationId: opaque });
		try {
			const form = await f.form();
			assert.equal((await f.decide(form)).status, 303);
			assert.equal(
				(await f.sql("select authorization_id from sill_private.oauth_flows")).rows[0]
					.authorization_id,
				opaque,
			);
			const jar = new Map<any, any>();
			assert.equal(
				(await f.call(`/oauth/consent?authorization_id=${opaque}`, { cookieJar: jar })).status,
				401,
			);
			assert.ok(decodeURIComponent(jar.get("__Host-sill-oauth-return")).startsWith(`${opaque}.`));
			for (const id of ["../outside", "short", "a".repeat(129)])
				assert.throws(
					() => f.providerFactory(f.config, "synthetic").details(id),
					/invalid_request/,
				);
		} finally {
			await f.close();
		}
	});

	test("production upgrade preserves existing UUID flow handles as text", async () => {
		const { cloudFixture } = await import("./helpers/cloud-fixture.ts");
		const f = await cloudFixture();
		try {
			await f.db.exec("create role supabase_auth_admin nologin");
			await f.db.exec(
				await readFile(
					new URL(
						"../../supabase/migrations/20261015010603_sill_codex_oauth_consent.sql",
						import.meta.url,
					),
					"utf8",
				),
			);
			await f.db.exec(`insert into sill_private.oauth_clients(owner_id,client_id,policy) values('${A}','${C}','{}');
   insert into sill_private.oauth_flows(owner_id,id,client_id,authorization_id,kind,browser_hash,csrf_hash,policy_snapshot,generation) values('${A}','${AUTH}','${C}','${AUTH}','consent','a','b','{}',0);`);
			await f.db.exec(
				await readFile(
					new URL(
						"../../supabase/migrations/20261015012954_sill_opaque_oauth_authorization_ids.sql",
						import.meta.url,
					),
					"utf8",
				),
			);
			assert.equal(
				(await f.db.query("select authorization_id from sill_private.oauth_flows")).rows[0]
					.authorization_id,
				AUTH,
			);
			await f.db.query("update sill_private.oauth_flows set authorization_id=$1", [
				"opaque_authorization_handle_002",
			]);
			assert.equal(
				(await f.db.query("select authorization_id from sill_private.oauth_flows")).rows[0]
					.authorization_id,
				"opaque_authorization_handle_002",
			);
		} finally {
			await f.close();
		}
	});

	test("provider automatic consent resumes only one existing exact Sill grant without writes", async () => {
		const f = await oauthFixture();
		try {
			await f.decide(await f.form());
			const before = await f.grant();
			const flows = (await f.sql("select count(*) as n from sill_private.oauth_flows")).rows[0].n;
			f.state.details = {
				redirect_url: `${f.policy.redirectUris[0]}?code=synthetic-resumed-code&state=bound`,
			};
			const resumed = await f.call(`/oauth/consent?authorization_id=${AUTH}`);
			assert.equal(resumed.status, 303);
			assert.equal(resumed.headers.get("location"), f.state.details.redirect_url);
			assert.deepEqual(await f.grant(), before);
			assert.equal(
				(await f.sql("select count(*) as n from sill_private.oauth_flows")).rows[0].n,
				flows,
			);
			f.state.details.redirect_url = "https://evil.example/?code=synthetic&state=bound";
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
			f.state.details.redirect_url = `${f.policy.redirectUris[0]}?code=synthetic-resumed-code&state=bound`;
			await f.sql(
				"update sill_private.caller_grants set scopes=array['content:read'] where caller_id=$1",
				[`oauth:${C}`],
			);
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
			await f.sql("delete from sill_private.caller_grants where caller_id=$1", [`oauth:${C}`]);
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
		} finally {
			await f.close();
		}
	});

	test("full login handoff reaches review, while another browser and expired return cannot resume", async () => {
		const f = await oauthFixture();
		try {
			const jar = new Map<any, any>();
			await f.call(`/oauth/consent?authorization_id=${AUTH}`, { cookieJar: jar });
			await f.call("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com" }),
				cookieJar: jar,
			});
			const other = await f.call("/auth/callback?code=synthetic-code", {
				cookieJar: new Map<any, any>(),
				headers: { Accept: "text/html" },
			});
			assert.equal(other.status, 303);
			assert.equal(
				other.headers.get("location"),
				`${f.config.appOrigin}/auth/recovery?reason=expired`,
			);
			const callback = await f.call("/auth/callback?code=synthetic-code", { cookieJar: jar });
			const review = await f.call(
				new URL(callback.headers.get("location")).pathname +
					new URL(callback.headers.get("location")).search,
				{ cookieJar: jar },
			);
			assert.equal(review.status, 200);
			assert.match(await review.text(), /value="approve">允许访问<\/button>/);
			assert.equal(await f.grant(), undefined, "login does not approve access");
			const expired = new Map<any, any>([
				["__Host-sill-oauth-return", `${AUTH}.${Date.now() - 1000}`],
			]);
			await f.call("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com" }),
				cookieJar: expired,
			});
			const resumed = await f.call("/auth/callback?code=synthetic-code", { cookieJar: expired });
			assert.equal(resumed.headers.get("location"), `${f.config.appOrigin}/oauth/expired`);
		} finally {
			await f.close();
		}
	});

	test("actual host default five scopes fail against the current openid-only policy", async () => {
		const f = await oauthFixture();
		try {
			f.state.details = { ...f.details, scope: "openid profile email phone offline_access" };
			const response = await f.call(`/oauth/consent?authorization_id=${AUTH}`);
			assert.equal(response.status, 403);
			assert.equal(response.headers.get("X-Sill-Consent-Stage"), "review");
			assert.equal(await f.grant(), undefined);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 0);
		} finally {
			await f.close();
		}
	});

	test("observed ChatGPT openid email offline_access reaches explicit review under matching client policy", async () => {
		const f = await oauthFixture();
		try {
			const scopes = ["openid", "email", "offline_access"];
			f.state.details = { ...f.details, scope: scopes.join(" ") };
			f.policy.identityScopes = scopes;
			await f.sql(
				"update sill_private.oauth_clients set policy=jsonb_set(policy,'{identityScopes}',$1::jsonb)",
				[JSON.stringify(scopes)],
			);
			const response = await f.call(`/oauth/consent?authorization_id=${AUTH}`);
			assert.equal(response.status, 200, await response.clone().text());
			assert.equal(await f.grant(), undefined);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 0);
		} finally {
			await f.close();
		}
	});

	test("ChatGPT five identity scopes reach review only when explicitly allowed for this client", async () => {
		const f = await oauthFixture();
		try {
			const scopes = ["openid", "email", "offline_access", "profile", "phone"];
			f.state.details = { ...f.details, scope: scopes.join(" ") };
			await f.sql(
				"update sill_private.oauth_clients set policy=jsonb_set(policy,'{identityScopes}',$1::jsonb)",
				[JSON.stringify(scopes)],
			);
			const response = await f.call(`/oauth/consent?authorization_id=${AUTH}`);
			assert.equal(response.status, 200, await response.clone().text());
			const html = await response.text();
			assert.match(html, /openid、email、offline_access、profile、phone/);
			assert.equal(
				await f.grant(),
				undefined,
				"supporting identity scopes does not grant card access",
			);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 0);
		} finally {
			await f.close();
		}
	});
}
