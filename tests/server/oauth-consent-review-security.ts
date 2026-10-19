import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { checkedRedirect, oauthProvider } from "../../server/cloud/oauth-provider.ts";
import { A, B, claims, identity } from "./helpers/boundary-fixture.ts";
import { AUTH, C, oauthFixture } from "./helpers/oauth-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

export async function registerReviewSecurityTests() {
	test("actual SQL flow: review, approve, replay rejection, local/provider revoke, web session preserved", async () => {
		const f = await oauthFixture();
		try {
			const initial = f.cookies.get("__Host-sill-access"),
				form = await f.form();
			assert.ok(!(await f.grant()));
			const flow = (await f.sql("select * from sill_private.oauth_flows")).rows[0];
			assert.notEqual(flow.csrf_hash, form.csrf);
			assert.equal(flow.owner_id, A);
			const r = await f.decide(form);
			assert.equal(r.status, 303, await r.clone().text());
			assert.match(r.headers.get("location"), /^http:\/\/127.0.0.1:5876\/callback\?code=/);
			assert.deepEqual((await f.grant()).scopes, ["content:read", "content:write"]);
			assert.equal((await f.decide(form)).status, 409);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 1);
			assert.equal(f.cookies.get("__Host-sill-access"), initial);
			assert.equal((await f.call("/auth/session")).status, 200);
			const revoke = await f.form("/oauth/grants");
			const revoked = await f.decide(revoke, "revoke");
			assert.equal(revoked.status, 200);
			assert.match(await revoked.text(), /身份提供方授权也已撤销/);
			assert.equal(await f.grant(), undefined);
			assert.equal(f.cookies.get("__Host-sill-access"), initial);
			assert.equal(f.providerCalls.at(-1).method, "DELETE");
			assert.equal(f.providerCalls.at(-1).search, `?client_id=${C}`);
			assert.equal((await f.decide(revoke, "revoke")).status, 409);
		} finally {
			await f.close();
		}
	});

	test("failure/deny do not replace existing grants and uncertain calls are not repeated", async () => {
		const f = await oauthFixture();
		try {
			await f.sql(
				"insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values($1,$2,array['content:read'],array['*'],$3)",
				[A, `oauth:${C}`, f.policy.audience],
			);
			const before = await f.grant();
			let form = await f.form();
			assert.equal((await f.decide(form, "deny")).status, 303);
			assert.deepEqual(await f.grant(), before);
			form = await f.form();
			f.state.badRedirect = true;
			assert.equal((await f.decide(form)).status, 403);
			assert.deepEqual(await f.grant(), before);
			const count = f.providerCalls.length;
			assert.equal((await f.decide(form)).status, 409);
			assert.equal(f.providerCalls.length, count);
			const revoke = await f.form("/oauth/grants");
			f.state.fail = true;
			const r = await f.decide(revoke, "revoke");
			assert.equal(r.status, 200);
			assert.match(await r.text(), /身份提供方撤销未确认/);
			assert.equal(await f.grant(), undefined);
		} finally {
			await f.close();
		}
	});

	test("CSRF, origin, bearer-owner, body and browser binding reject before provider mutation", async () => {
		const f = await oauthFixture();
		try {
			const form = await f.form();
			for (const options of [
				{ headers: { Origin: "https://evil.example" } },
				{ headers: { "sec-fetch-site": "cross-site" } },
				{ headers: { Authorization: `Bearer ${token()}` } },
				{ cookieJar: new Map<any, any>([["__Host-sill-access", token()]]) },
				{ headers: { "Content-Type": "application/json" } },
			])
				assert.ok((await f.decide(form, "approve", options)).status >= 400);
			assert.equal((await f.decide({ ...form, csrf: "a".repeat(64) })).status, 403);
			assert.equal(
				(
					await f.call("/oauth/decision", {
						method: "POST",
						body: new URLSearchParams({ ...form, decision: "approve", ownerId: B }),
					})
				).status,
				400,
			);
			assert.equal(
				(await f.call("/oauth/decision", { method: "POST", body: "x".repeat(5000) })).status,
				413,
			);
			assert.equal((await f.call("/oauth/decision?decision=approve")).status, 404);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 0);
			assert.equal(await f.grant(), undefined);
		} finally {
			await f.close();
		}
	});

	test("provider details, policy, expiry, unknown client and cross-owner changes fail closed", async () => {
		const f = await oauthFixture();
		try {
			let form = await f.form();
			f.state.details = { ...f.details, scope: "openid email" };
			assert.equal((await f.decide(form)).status, 403);
			f.state.details = f.details;
			await f.sql("update sill_private.oauth_flows set expires_at=now()-interval '1 second'");
			assert.equal((await f.decide(form)).status, 409);
			form = await f.form();
			await f.sql(
				"update sill_private.oauth_clients set policy=jsonb_set(policy,'{resources}','[\"limited\"]')",
			);
			assert.equal((await f.decide(form)).status, 409);
			f.state.details = { ...f.details, client: { id: B } };
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
			f.state.details = { redirect_url: "https://evil.example/auto" };
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
			assert.equal(
				(
					await f.decide(form, "approve", {
						cookieJar: new Map<any, any>([
							["__Host-sill-access", token({ sub: B })],
							["__Host-sill-consent-browser", f.cookies.get("__Host-sill-consent-browser")],
						]),
					})
				).status,
				404,
			);
			assert.equal(await f.grant(), undefined);
		} finally {
			await f.close();
		}
	});

	test("revocation wins over an in-flight provider approval across independent requests", async () => {
		const f = await oauthFixture();
		try {
			const form = await f.form();
			let release: any;
			f.state.hold = new Promise((r?: any) => (release = r));
			const approving = f.decide(form);
			while (!f.providerCalls.some((c?: any) => c.path.endsWith("/consent")))
				await new Promise((r?: any) => setTimeout(r, 5));
			assert.equal((await f.decide(form)).status, 409);
			const revoke = await f.form("/oauth/grants");
			assert.equal((await f.decide(revoke, "revoke")).status, 200);
			release();
			assert.equal((await approving).status, 409);
			assert.equal(await f.grant(), undefined);
		} finally {
			await f.close();
		}
	});

	test("SQL API independently rejects agent tokens, cross-owner data and grant widening; ACLs remain closed", async () => {
		const f = await oauthFixture();
		try {
			await identity(f.db, claims(A, { client_id: C, aud: f.policy.audience }));
			await assert.rejects(f.db.query("select public.sill_oauth_flow('list','{}')"), /forbidden/);
			await identity(f.db, claims(B));
			assert.deepEqual(
				(await f.db.query("select public.sill_oauth_flow('list','{}') as v")).rows[0].v,
				[],
			);
			await identity(f.db, claims(A));
			for (const table of ["oauth_flows", "oauth_clients", "oauth_audit", "caller_grants"])
				await assert.rejects(
					f.db.query(`select * from sill_private.${table}`),
					/permission denied/,
				);
			const form = await f.form();
			await f.sql(
				"update sill_private.oauth_clients set policy=jsonb_set(policy,'{contentScopes}','[\"content:read\"]')",
			);
			await identity(f.db, claims(A));
			const flow = (
				await f.sql("select * from sill_private.oauth_flows where id=$1", [form.flowId])
			).rows[0];
			flow.review.contentScopes = ["content:read", "content:delete"];
			await identity(f.db, claims(A));
			await assert.rejects(
				f.db.query("select public.sill_oauth_flow('begin',$1)", [
					JSON.stringify({
						flowId: crypto.randomUUID(),
						clientId: C,
						kind: "consent",
						browserHash: "a".repeat(64),
						csrfHash: "b".repeat(64),
						review: flow.review,
					}),
				]),
				/forbidden/,
			);
			const attrs = await f.sql(
				"select rolbypassrls,rolsuper,rolcanlogin from pg_roles where rolname='sill_consent_executor'",
			);
			assert.deepEqual(attrs.rows[0], { rolbypassrls: false, rolsuper: false, rolcanlogin: false });
			assert.equal(
				(
					await f.sql(
						"select count(*)::int n from pg_tables where tableowner='sill_consent_executor'",
					)
				).rows[0].n,
				0,
			);
		} finally {
			await f.close();
		}
	});

	test("login return is an exact bounded self path; successful SDK PKCE resumes without approving", async () => {
		const f = await oauthFixture();
		try {
			const jar = new Map<any, any>();
			const first = await f.call(`/oauth/consent?authorization_id=${AUTH}`, { cookieJar: jar });
			assert.equal(first.status, 401);
			assert.equal(f.providerCalls.length, 0);
			const login = await f.call("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com" }),
				cookieJar: jar,
			});
			assert.equal(login.status, 202);
			const callback = await f.call("/auth/callback?code=synthetic-code", { cookieJar: jar });
			assert.equal(callback.status, 303);
			assert.equal(
				callback.headers.get("location"),
				`${f.config.appOrigin}/oauth/consent?authorization_id=${AUTH}`,
			);
			assert.equal(await f.grant(), undefined);
			assert.equal(jar.get("__Host-sill-oauth-return"), "");
			const invalid = new Map<any, any>([["__Host-sill-oauth-return", "https://evil.example"]]);
			assert.equal(
				(await f.call("/oauth/consent?authorization_id=bad", { cookieJar: invalid })).status,
				401,
			);
		} finally {
			await f.close();
		}
	});

	test("disabled or incomplete configuration never calls provider; ordinary session remains available", async () => {
		const f = await oauthFixture();
		try {
			for (const overrides of [
				{ oauthConsentEnabled: false },
				{ oauthClientIds: [] },
				{ agentAudience: undefined },
			]) {
				const runtime = createSillRuntime(
					{ ...f.config, ...overrides },
					{
						clientFactory: f.factory,
						oauthProviderFactory: () => {
							throw Error("must not execute");
						},
					},
				);
				assert.equal(
					(
						await runtime(
							new Request(`${f.config.appOrigin}/oauth/consent?authorization_id=${AUTH}`),
						)
					).status,
					503,
				);
				assert.equal(
					(
						await runtime(
							new Request(`${f.config.appOrigin}/auth/session`, {
								headers: { cookie: `__Host-sill-access=${token()}` },
							}),
						)
					).status,
					200,
				);
			}
		} finally {
			await f.close();
		}
	});

	test("provider adapter uses supported access-token endpoints, disallows redirects and bounds responses", async () => {
		const config: Record<string, any> = {
				url: "https://project.supabase.co",
				publishableKey: "sb_publishable_test",
			},
			calls = [];
		const p = oauthProvider(config, "synthetic-verified-access", {
			fetchImpl: async (url?: any, init?: any) => {
				calls.push({ url, init });
				return Response.json({ authorization_id: AUTH });
			},
		});
		await p.details(AUTH);
		await p.decide(AUTH, "deny");
		await p.revoke(C);
		assert.equal(calls[0].url, `${config.url}/auth/v1/oauth/authorizations/${AUTH}`);
		assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-verified-access");
		assert.equal(calls[0].init.redirect, "manual");
		assert.ok(!JSON.stringify(calls).includes("refresh_token"));
		const redirected = oauthProvider(config, "x", {
			fetchImpl: async () =>
				new Response(null, { status: 302, headers: { Location: "https://elsewhere.example" } }),
		});
		await assert.rejects(redirected.details(AUTH), /unavailable/);
		const big = oauthProvider(config, "x", {
			fetchImpl: async () => new Response("x".repeat(65537)),
		});
		await assert.rejects(big.details(AUTH), /unavailable/);
		for (const url of [
			"https://evil.example/?code=x&state=y",
			"http://127.0.0.1:5876/callback?code=x&state=y&state=z",
			"http://127.0.0.1:5876/callback?code=x",
			"http://127.0.0.1:5876/callback/other?code=x&state=y",
		])
			assert.throws(() =>
				checkedRedirect(url, { redirectUri: "http://127.0.0.1:5876/callback" }, "approve"),
			);
	});

	test("lost provider decision response consumes the flow without installing a grant", async () => {
		const f = await oauthFixture();
		try {
			const form = await f.form();
			f.state.failDecision = true;
			assert.equal((await f.decide(form)).status, 503);
			assert.equal(await f.grant(), undefined);
			assert.equal((await f.decide(form)).status, 409);
			assert.equal(f.providerCalls.filter((c?: any) => c.path.endsWith("/consent")).length, 1);
		} finally {
			await f.close();
		}
	});
	test("bounded flows, inactive client and changed prior grant prevent widening", async () => {
		const f = await oauthFixture();
		try {
			const form = await f.form();
			await f.sql(
				"insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values($1,$2,array['content:read'],array['*'],$3)",
				[A, `oauth:${C}`, f.policy.audience],
			);
			assert.equal((await f.decide(form)).status, 409);
			await f.sql("update sill_private.oauth_clients set enabled=false");
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
			const revoke = await f.form("/oauth/grants");
			assert.equal((await f.decide(revoke, "revoke")).status, 200);
			await f.sql("update sill_private.oauth_clients set enabled=true");
			await f.sql("delete from sill_private.oauth_flows");
			for (let i = 0; i < 32; i++) await f.form();
			assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 429);
		} finally {
			await f.close();
		}
	});
}
