import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { AUTH, oauthFixture } from "./helpers/oauth-fixture.ts";

test("password login resumes consent without approval, rejects wrong credentials and cross-origin", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map<any, any>();
		const page = await f.call("/auth/login", { cookieJar: jar });
		assert.equal(page.status, 200);
		assert.match(await page.text(), /current-password/);
		const start = await f.call("/oauth/consent?authorization_id=" + AUTH, { cookieJar: jar });
		assert.match(await start.text(), /href="\/auth\/login"/);
		const post = (password?: any, headers: any = {}) =>
			f.call("/auth/password", {
				cookieJar: jar,
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify({ email: "synthetic@example.com", password }),
			});
		assert.equal((await post("wrong")).status, 401);
		assert.ok(!jar.get("__Host-sill-access"));
		assert.equal(
			(await post("synthetic-password", { Origin: "https://evil.example" })).status,
			403,
		);
		const login = await post("synthetic-password");
		assert.equal(login.status, 200);
		assert.equal(
			(await login.json()).location,
			f.config.appOrigin + "/oauth/consent?authorization_id=" + AUTH,
		);
		assert.ok(jar.get("__Host-sill-refresh"));
		assert.equal(await f.grant(), undefined);
		assert.equal(
			(await f.call("/oauth/consent?authorization_id=" + AUTH, { cookieJar: jar })).status,
			200,
		);
	} finally {
		await f.close();
	}
});
test("email verification can set a password and preserve the pending authorization", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map<any, any>();
		const post = (path?: any, value?: any) =>
			f.call(path, {
				cookieJar: jar,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(value),
			});
		assert.equal(
			(await post("/auth/password/update", { password: "synthetic-password" })).status,
			401,
		);
		await f.call("/oauth/consent?authorization_id=" + AUTH, { cookieJar: jar });
		assert.equal(
			(await post("/auth/login", { email: "synthetic@example.com", setupPassword: true })).status,
			202,
		);
		const callback = await f.call("/auth/callback?code=synthetic-code", { cookieJar: jar });
		assert.equal(callback.headers.get("location"), f.config.appOrigin + "/auth/password/new");
		assert.equal((await f.call("/auth/password/new", { cookieJar: jar })).status, 200);
		assert.equal((await post("/auth/password/update", { password: "short" })).status, 400);
		const saved = await post("/auth/password/update", { password: "synthetic-new-password" });
		assert.equal(saved.status, 200);
		assert.equal(
			(await saved.json()).location,
			f.config.appOrigin + "/oauth/consent?authorization_id=" + AUTH,
		);
		assert.equal(f.sessionState.passwordUpdated, true);
		assert.equal(await f.grant(), undefined);
	} finally {
		await f.close();
	}
});

test("native email forwards only a PKCE code and redeems it only with native verifier", async () => {
	const f = await oauthFixture();
	try {
		const nativeJar = new Map<string, string>();
		const login = await f.call("/auth/login", {
			cookieJar: nativeJar,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "synthetic@example.com", client: "macos" }),
		});
		assert.equal(login.status, 202);
		assert.ok(nativeJar.get("__Host-sill-pkce"));
		const browser = await f.call("/auth/callback?client=macos&code=synthetic-code", {
			cookieJar: new Map(),
		});
		assert.equal(browser.status, 303);
		assert.equal(browser.headers.get("location"), "sill://auth/callback?code=synthetic-code");
		assert.equal(browser.headers.get("set-cookie"), null);
		assert.equal(await browser.text(), "");
		const missingVerifier = await f.call("/auth/callback?client=macos&code=synthetic-code", {
			cookieJar: new Map(),
			headers: { "X-Sill-Client": "macos", Origin: f.config.appOrigin },
		});
		assert.equal(missingVerifier.status, 401);
		const complete = await f.call("/auth/callback?client=macos&code=synthetic-code", {
			cookieJar: nativeJar,
			headers: { "X-Sill-Client": "macos", Origin: f.config.appOrigin },
		});
		assert.equal(complete.status, 303);
		assert.equal(complete.headers.get("location"), f.config.appOrigin + "/");
		assert.ok(nativeJar.get("__Host-sill-refresh"));
		assert.equal((await f.call("/auth/session", { cookieJar: nativeJar })).status, 200);
	} finally {
		await f.close();
	}
});

test("native callback rejects ambiguous codes and foreign-origin redemption", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map<string, string>();
		await f.call("/auth/login", {
			cookieJar: jar,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "synthetic@example.com", client: "macos" }),
		});
		assert.equal(
			(await f.call("/auth/callback?client=macos&code=first&code=second", { cookieJar: jar }))
				.status,
			401,
		);
		assert.equal(
			(
				await f.call("/auth/callback?client=macos&code=synthetic-code", {
					cookieJar: jar,
					headers: { "X-Sill-Client": "macos", Origin: "https://evil.example" },
				})
			).status,
			403,
		);
	} finally {
		await f.close();
	}
});

test("native email requests the exact HTTPS callback query from Supabase", async () => {
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory });
		const result = await runtime(
			new Request(f.config.appOrigin + "/auth/login", {
				method: "POST",
				headers: { Origin: f.config.appOrigin, "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com", client: "macos" }),
			}),
		);
		assert.equal(result.status, 202);
		assert.equal(f.redirect, f.config.appOrigin + "/auth/callback?client=macos");
	} finally {
		await f.close();
	}
});

test("login copy distinguishes workspace entry from consent and recovery never echoes input", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map();
		let page = await f.call("/auth/login", { cookieJar: jar });
		assert.match(await page.text(), /登录后进入你的 Sill 工作台/);
		await f.call("/oauth/consent?authorization_id=" + AUTH, { cookieJar: jar });
		page = await f.call("/auth/login", { cookieJar: jar });
		assert.match(await page.text(), /登录后返回本次授权/);
		for (const [reason, message] of [
			["expired", "链接无效或已过期"],
			["forbidden", "尚未获得此工作区"],
			["unavailable", "服务暂时不可用"],
		]) {
			const recovery = await f.call("/auth/recovery?reason=" + reason, { cookieJar: jar });
			assert.equal(recovery.status, 200);
			const html = await recovery.text();
			assert.ok(html.includes(message));
			assert.match(html, /href="\/auth\/login"/);
			assert.match(recovery.headers.get("cache-control"), /no-store/);
			assert.equal(recovery.headers.get("set-cookie"), null);
		}
		const html = await (
			await f.call("/auth/recovery?reason=%3Cscript%3Esecret", { cookieJar: jar })
		).text();
		assert.doesNotMatch(html, /secret|<script>/);
	} finally {
		await f.db.close();
	}
});
