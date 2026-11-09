import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { AUTH, oauthFixture } from "./helpers/oauth-fixture.ts";

// @wu-test type=integration | scope=password login and OAuth handoff | protects=Reject invalid login attempts and avoid automatic consent after login
test("password login resumes consent without approval, rejects wrong credentials and cross-origin", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map<any, any>();
		const page = await f.call("/auth/login", { cookieJar: jar });
		assert.equal(page.status, 200);
		assert.match(await page.text(), /current-password/);
		const start = await f.call("/oauth/consent?authorization_id=" + AUTH, { cookieJar: jar });
		assert.equal(start.status, 303);
		assert.equal(start.headers.get("location"), f.config.appOrigin + "/auth/login");
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
// @wu-test type=integration | scope=email password setup | protects=Require verified password setup while preserving the pending authorization
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

// @wu-test type=integration | scope=native email authentication | protects=Prevent native code redemption without the original verifier
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

// @wu-test type=boundary | scope=native authentication callback | protects=Reject duplicate authorization codes and cross-origin redemption
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

// @wu-test type=integration | scope=native email authentication | protects=Request the native HTTPS callback when sending the login email
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

// @wu-test type=boundary | scope=authentication recovery pages | protects=Prevent recovery pages from echoing untrusted input and misrepresenting login intent
test("login copy distinguishes workspace entry from consent and recovery never echoes input", async () => {
	const f = await oauthFixture();
	try {
		const jar = new Map();
		let page = await f.call("/auth/login", { cookieJar: jar });
		assert.match(await page.text(), /登录窗台/);
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
// @wu-test type=integration | scope=signed-in password change | protects=Prevent password changes without the current password
test("signed-in password change requires the current password", async () => {
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
		const login = await post("/auth/password", {
			email: "synthetic@example.com",
			password: "synthetic-password",
		});
		assert.equal(login.status, 200);
		const page = await f.call("/auth/password/new", { cookieJar: jar });
		assert.match(await page.text(), /name="currentPassword"/);
		const missing = await post("/auth/password/update", { password: "synthetic-new-password" });
		assert.equal(missing.status, 400);
		assert.equal((await missing.json()).error.code, "current_password");
		const wrong = await post("/auth/password/update", {
			password: "synthetic-new-password",
			currentPassword: "wrong",
		});
		assert.equal((await wrong.json()).error.code, "current_password");
		assert.notEqual(f.sessionState.passwordUpdated, true);
		const saved = await post("/auth/password/update", {
			password: "synthetic-new-password",
			currentPassword: "synthetic-password",
		});
		assert.equal(saved.status, 200);
		assert.equal(f.sessionState.passwordUpdated, true);
		assert.deepEqual(f.sessionState.logoutScopes, ["local"], "the check session is ended");
	} finally {
		await f.close();
	}
});
// @wu-test type=integration | scope=authentication logout | protects=Apply the requested logout scope and clear browser credentials
test("logout ends this browser by default and every device on request", async () => {
	const f = await oauthFixture();
	try {
		for (const scope of ["local", "global"]) {
			const jar = new Map<any, any>();
			await f.call("/auth/password", {
				cookieJar: jar,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com", password: "synthetic-password" }),
			});
			const out = await f.call("/auth/logout", {
				cookieJar: jar,
				method: "POST",
				...(scope === "global" && {
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ scope }),
				}),
			});
			assert.equal(out.status, 200);
			assert.equal(f.sessionState.logoutScopes.at(-1), scope);
			assert.ok(!jar.get("__Host-sill-access"));
		}
	} finally {
		await f.close();
	}
});
// @wu-test type=behavior | scope=server/cloud login page | protects=Show recovery only when email login is enabled
test("login page explains invitation and offers recovery only when email is enabled", async () => {
	const { loginPage } = await import("../../server/cloud/login-page.ts");
	const closed = loginPage();
	assert.doesNotMatch(closed, /id="forgot"/);
	assert.match(closed, /联系管理员重置/);
	assert.match(closed, /仅限受邀使用/);
	assert.match(loginPage({ emailEnabled: true }), /id="forgot"/);
});

// @wu-test type=integration | scope=authentication account-page return | protects=Return users to the requested account page after login
test("signed-out account pages go to login and come back after signing in", async () => {
	const f = await oauthFixture();
	try {
		for (const path of ["/oauth/grants", "/auth/password/new"]) {
			const jar = new Map<any, any>();
			const start = await f.call(path, { cookieJar: jar });
			assert.equal(start.status, 303);
			assert.equal(start.headers.get("location"), f.config.appOrigin + "/auth/login");
			const login = await f.call("/auth/password", {
				cookieJar: jar,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com", password: "synthetic-password" }),
			});
			assert.equal(login.status, 200);
			assert.equal((await login.json()).location, f.config.appOrigin + path);
			assert.equal((await f.call(path, { cookieJar: jar })).status, 200);
		}
	} finally {
		await f.close();
	}
});
