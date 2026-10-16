import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

const expired = () => token({ exp: Math.floor(Date.now() / 1000) - 60 });
const cookie = (access: any = expired(), refresh: any = "synthetic-unused-refresh") =>
	"__Host-sill-access=" + access + (refresh ? "; __Host-sill-refresh=" + refresh : "");

test("expired browser session rotates with SDK, serves API, and coalesces concurrent refresh", async () => {
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory });
		const old = cookie(),
			call = (path?: any) =>
				runtime(new Request(f.config.appOrigin + path, { headers: { Cookie: old } }));
		const responses = await Promise.all([
			call("/auth/session"),
			call("/api/v1/contents"),
			call("/auth/session"),
		]);
		assert.ok(responses.every((r?: any) => r.status === 200));
		assert.equal(f.sessionState.refreshCalls, 1);
		for (const r of responses) {
			const values = r.headers.getSetCookie();
			assert.equal(values.length, 2);
			assert.ok(
				values.every((c?: any) => c.includes("HttpOnly; Secure; SameSite=Lax; Max-Age=2592000")),
			);
			assert.ok(
				values.some((c?: any) => c.startsWith("__Host-sill-refresh=synthetic-rotated-refresh;")),
			);
			assert.ok(!(await r.text()).includes("synthetic-rotated-refresh"));
		}
		const renewed = responses[0].headers
			.getSetCookie()
			.map((c?: any) => c.split(";")[0])
			.join("; ");
		const valid = await runtime(
			new Request(f.config.appOrigin + "/auth/session", { headers: { Cookie: renewed } }),
		);
		assert.equal(valid.status, 200);
		assert.equal(valid.headers.get("set-cookie"), null);
		assert.equal(f.sessionState.refreshCalls, 1);
		// A delayed request with the parent token uses the provider reuse/parent rule.
		assert.equal((await call("/auth/session")).status, 200);
		assert.equal(f.sessionState.refreshCalls, 2);
	} finally {
		await f.close();
	}
});

test("missing/revoked refresh clears cookies; temporary upstream failure preserves them", async () => {
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory });
		const call = (c?: any) =>
			runtime(new Request(f.config.appOrigin + "/auth/session", { headers: { Cookie: c } }));
		for (const c of [cookie(expired(), ""), cookie(expired(), "revoked")]) {
			const r = await call(c);
			assert.equal(r.status, 401);
			assert.equal(r.headers.getSetCookie().length, 2);
			assert.ok(r.headers.getSetCookie().every((v?: any) => v.includes("Max-Age=0")));
		}
		f.sessionState.refreshError = { status: 429, code: "over_request_rate_limit" };
		const temporary = await call(cookie());
		assert.equal(temporary.status, 503);
		assert.equal(temporary.headers.get("set-cookie"), null);
		f.sessionState.refreshError = null;
		assert.equal((await call(cookie())).status, 200);
		const before = f.sessionState.refreshCalls;
		const bearer = await runtime(
			new Request(f.config.appOrigin + "/auth/session", {
				headers: { Cookie: cookie(), Authorization: "Bearer " + expired() },
			}),
		);
		assert.equal(bearer.status, 401);
		assert.equal(f.sessionState.refreshCalls, before);
		assert.equal(bearer.headers.get("set-cookie"), null);
	} finally {
		await f.close();
	}
});

test("OAuth pages use renewed browser credentials; logout refreshes before revocation and clears both cookies", async () => {
	const f = await cloudFixture({ oauth: true });
	try {
		const config: Record<string, any> = {
			...f.config,
			oauthConsentEnabled: true,
			oauthClientIds: ["11111111-1111-4111-8111-111111111111"],
		};
		const runtime = createSillRuntime(config, {
			clientFactory: f.factory,
			oauthProviderFactory: () => ({}),
		});
		const page = await runtime(
			new Request(config.appOrigin + "/oauth/grants", { headers: { Cookie: cookie() } }),
		);
		assert.equal(page.status, 200);
		assert.ok((await page.text()).includes("已授权客户端"));
		assert.equal(
			page.headers.getSetCookie().filter((v?: any) => v.startsWith("__Host-sill-refresh=")).length,
			1,
		);
		const logout = await runtime(
			new Request(config.appOrigin + "/auth/logout", {
				method: "POST",
				headers: { Cookie: cookie(), Origin: config.appOrigin },
			}),
		);
		assert.equal(logout.status, 200);
		assert.deepEqual(await logout.json(), { signedOut: true, revoked: true });
		assert.ok(logout.headers.getSetCookie().every((v?: any) => v.includes("Max-Age=0")));
		assert.equal(logout.headers.getSetCookie().length, 2);
		assert.equal(f.sessionState.revoked, true);
		const after = await runtime(
			new Request(config.appOrigin + "/auth/session", { headers: { Cookie: cookie() } }),
		);
		assert.equal(after.status, 401);
	} finally {
		await f.close();
	}
});

test("transport exceptions preserve browser credentials and failed logout reports unconfirmed revocation", async () => {
	const f = await cloudFixture();
	try {
		const factory = (url?: any, key?: any, options?: any) => {
			const client = f.factory(url, key, options);
			if (options.auth.persistSession) {
				client.auth.refreshSession = async () => {
					throw new TypeError("Synthetic network unavailable");
				};
				client.auth.admin.signOut = async () => ({ error: { status: 503 } });
			}
			return client;
		};
		const runtime = createSillRuntime(f.config, { clientFactory: factory });
		const session = await runtime(
			new Request(f.config.appOrigin + "/auth/session", { headers: { Cookie: cookie() } }),
		);
		assert.equal(session.status, 503);
		assert.equal(session.headers.get("set-cookie"), null);
		assert.ok(!(await session.text()).includes("Synthetic network"));
		const logout = await runtime(
			new Request(f.config.appOrigin + "/auth/logout", {
				method: "POST",
				headers: { Cookie: cookie(), Origin: f.config.appOrigin },
			}),
		);
		assert.deepEqual(await logout.json(), { signedOut: true, revoked: false });
		assert.equal(logout.headers.getSetCookie().length, 2);
		assert.ok(logout.headers.getSetCookie().every((v?: any) => v.includes("Max-Age=0")));
		const crossSite = await runtime(
			new Request(f.config.appOrigin + "/auth/logout", {
				method: "POST",
				headers: { Cookie: cookie(), Origin: "https://evil.example" },
			}),
		);
		assert.equal(crossSite.status, 403);
		assert.equal(crossSite.headers.get("set-cookie"), null);
	} finally {
		await f.close();
	}
});
