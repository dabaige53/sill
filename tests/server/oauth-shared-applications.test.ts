import assert from "node:assert/strict";
import test from "node:test";
import { A, B, claims, identity, rpc } from "./helpers/boundary-fixture.ts";
import { AUTH, C, oauthFixture } from "./helpers/oauth-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

test("shared application: password login resumes consent without per-account setup", async () => {
	const f = await oauthFixture({ shared: true });
	try {
		f.cookies.clear();
		assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 303);
		assert.equal((await f.sql("select * from sill_private.oauth_clients")).rows.length, 0);
		const login = await f.call("/auth/password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "synthetic@example.com", password: "synthetic-password" }),
		});
		assert.equal(login.status, 200, await login.clone().text());
		assert.equal(
			(await login.json()).location,
			f.config.appOrigin + `/oauth/consent?authorization_id=${AUTH}`,
		);
		const form = await f.form();
		const rows = (await f.sql("select * from sill_private.oauth_clients")).rows;
		assert.equal(rows.length, 1);
		assert.equal(rows[0].owner_id, A);
		assert.deepEqual(rows[0].policy, f.policy);
		assert.equal(await f.grant(), undefined);
		await f.form();
		assert.equal((await f.sql("select * from sill_private.oauth_clients")).rows.length, 1);
		assert.equal((await f.decide(form)).status, 303);
		assert.deepEqual((await f.grant()).scopes, ["content:read"]);
		assert.equal(
			(
				await f.sql("select * from sill_private.caller_grants where owner_id=$1 and caller_id=$2", [
					B,
					`oauth:${C}`,
				])
			).rows.length,
			0,
		);
	} finally {
		await f.close();
	}
});

test("same public client keeps account grants, denial and revocation independent", async () => {
	const f = await oauthFixture({ shared: true });
	try {
		await f.decide(await f.form());
		const firstGrant = await f.grant();
		const otherCookies = new Map([["__Host-sill-access", token({ sub: B })]]);
		f.state.details = { ...f.details, user: { id: B } };
		let response = await f.call(`/oauth/consent?authorization_id=${AUTH}`, {
			cookieJar: otherCookies,
		});
		assert.equal(response.status, 200);
		const form = Object.fromEntries(
			[...(await response.text()).matchAll(/name="(flowId|csrf)" value="([^"]+)"/g)].map(
				(match) => [match[1], match[2]],
			),
		);
		assert.equal((await f.decide(form, "deny", { cookieJar: otherCookies })).status, 303);
		assert.deepEqual(await f.grant(), firstGrant);
		await identity(f.db, claims(B));
		const otherApplications = await rpc(f.db, "sill_oauth_flow", ["list", "{}"]);
		assert.equal(otherApplications[0].grant, null);
		// A second account must explicitly approve its own flow even for the same client.
		response = await f.call(`/oauth/consent?authorization_id=${AUTH}`, {
			cookieJar: otherCookies,
		});
		const nextForm = Object.fromEntries(
			[...(await response.text()).matchAll(/name="(flowId|csrf)" value="([^"]+)"/g)].map(
				(match) => [match[1], match[2]],
			),
		);
		assert.equal((await f.decide(nextForm, "approve", { cookieJar: otherCookies })).status, 303);
		assert.deepEqual(await f.grant(), firstGrant);
		const otherGrant = (
			await f.sql("select * from sill_private.caller_grants where owner_id=$1 and caller_id=$2", [
				B,
				`oauth:${C}`,
			])
		).rows[0];
		assert.deepEqual(otherGrant.scopes, ["content:read"]);
		f.state.details = f.details;
		await f.decide(await f.form("/oauth/grants"), "revoke");
		await f.form();
		assert.equal(await f.grant(), undefined);
		assert.deepEqual(
			(
				await f.sql("select * from sill_private.caller_grants where owner_id=$1 and caller_id=$2", [
					B,
					`oauth:${C}`,
				])
			).rows[0],
			otherGrant,
		);
	} finally {
		await f.close();
	}
});

test("defaults preserve account restrictions and require an existing Sill workspace grant", async () => {
	const f = await oauthFixture({ shared: true });
	try {
		const restricted = { ...f.policy, resources: ["88888888-8888-4888-8888-888888888888"] };
		await f.sql(
			"insert into sill_private.oauth_clients(owner_id,client_id,policy,enabled) values($1,$2,$3,true)",
			[A, C, JSON.stringify(restricted)],
		);
		await identity(f.db);
		assert.deepEqual(
			await rpc(f.db, "sill_oauth_flow", ["policy", JSON.stringify({ clientId: C })]),
			restricted,
		);
		assert.equal(await f.grant(), undefined);
		await f.sql("delete from sill_private.caller_grants where owner_id=$1", [B]);
		await identity(f.db, claims(B));
		await assert.rejects(
			rpc(f.db, "sill_oauth_flow", ["policy", JSON.stringify({ clientId: C })]),
			/forbidden/,
		);
		assert.equal(
			(await f.sql("select * from sill_private.oauth_clients where owner_id=$1", [B])).rows.length,
			0,
		);
	} finally {
		await f.close();
	}
});

test("shared defaults cannot bypass disabled policies, unknown clients or direct table access", async () => {
	const f = await oauthFixture({ shared: true });
	try {
		await f.sql("update sill_private.oauth_applications set enabled=false");
		assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
		assert.equal((await f.sql("select * from sill_private.oauth_clients")).rows.length, 0);
		await f.sql("update sill_private.oauth_applications set enabled=true");
		await f.form();
		await f.sql("update sill_private.oauth_clients set enabled=false");
		assert.equal((await f.call(`/oauth/consent?authorization_id=${AUTH}`)).status, 403);
		assert.equal(
			(await f.sql("select enabled from sill_private.oauth_clients")).rows[0].enabled,
			false,
		);
		assert.equal(await f.grant(), undefined);

		await identity(f.db);
		await assert.rejects(
			f.db.query("select * from sill_private.oauth_applications"),
			/permission denied/,
		);
		await assert.rejects(
			f.db.query(
				"insert into sill_private.oauth_clients(owner_id,client_id,policy) values($1,$2,$3)",
				[A, B, JSON.stringify(f.policy)],
			),
			/permission denied/,
		);
		await identity(f.db, claims(A, { client_id: C, aud: f.policy.audience }));
		await assert.rejects(
			rpc(f.db, "sill_oauth_flow", ["policy", JSON.stringify({ clientId: C })]),
			/forbidden/,
		);
		await identity(f.db);
		await assert.rejects(
			rpc(f.db, "sill_oauth_flow", ["policy", JSON.stringify({ clientId: B })]),
			/forbidden/,
		);
	} finally {
		await f.close();
	}
});
