import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { AUTH, oauthFixture } from "./helpers/oauth-fixture.ts";

test("production defaults to password login and cannot send verification email", async () => {
	const f = await cloudFixture();
	try {
		const { emailLoginEnabled: _enabled, ...config } = f.config;
		const runtime = createSillRuntime(config, { clientFactory: f.factory });
		const page = await runtime(new Request(config.appOrigin + "/auth/login"));
		const html = await page.text();
		assert.ok(html.includes('id="password-form"'));
		assert.ok(!html.includes('id="email-form"'));
		assert.ok(!html.includes('id="forgot"'));
		const response = await runtime(
			new Request(config.appOrigin + "/auth/login", {
				method: "POST",
				headers: { Origin: config.appOrigin, "Content-Type": "application/json" },
				body: JSON.stringify({ email: "synthetic@example.com" }),
			}),
		);
		assert.equal(response.status, 403);
		assert.equal(f.calls.filter((call: any) => call.path === "/auth/v1/otp").length, 0);
	} finally {
		await f.close();
	}
});

test("recovery checks an existing session before displaying a stale email-link failure", async () => {
	const f = await oauthFixture();
	try {
		const recovered = await f.call("/auth/recovery?reason=expired");
		assert.equal(recovered.status, 303);
		assert.equal(recovered.headers.get("location"), f.config.appOrigin + "/auth/complete");
		assert.equal(f.calls.filter((call: any) => call.path === "/auth/v1/token").length, 0);
		assert.equal((await f.call("/auth/recovery?reason=forbidden")).status, 200);
	} finally {
		await f.close();
	}
});

test("email completion stays out of the host callback tab and recovery recognizes the established session", async () => {
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory });
		const jar = new Map<string, string>();
		const call = async (path: string, payload?: object) => {
			const response = await runtime(
				new Request(f.config.appOrigin + path, {
					method: payload ? "POST" : "GET",
					headers: {
						Origin: f.config.appOrigin,
						Accept: "text/html",
						"Content-Type": "application/json",
						Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
					},
					...(payload ? { body: JSON.stringify(payload) } : {}),
				}),
			);
			for (const value of response.headers.getSetCookie()) {
				const [name, content] = value.split(";")[0].split("=");
				if (value.includes("Max-Age=0")) jar.delete(name);
				else jar.set(name, content);
			}
			return response;
		};
		assert.equal((await call("/auth/login", { email: "synthetic@example.com" })).status, 202);
		const completed = await call("/auth/callback?code=synthetic-code");
		assert.equal(
			completed.headers.get("location"),
			f.config.appOrigin + "/auth/complete",
			"email tab must not consume the initiating tab's OAuth return",
		);
		assert.equal((await call("/auth/session")).status, 200);
		const tokensBefore = f.calls.filter((c: any) => c.path === "/auth/v1/token").length;
		const replay = await call("/auth/callback?code=synthetic-code");
		const recovered = await call(
			new URL(replay.headers.get("location")!).pathname + "?reason=expired",
		);
		assert.equal(
			recovered.headers.get("location"),
			f.config.appOrigin + "/auth/complete",
			"an already signed-in browser must not show an expired login error",
		);
		assert.equal(
			f.calls.filter((c: any) => c.path === "/auth/v1/token").length,
			tokensBefore,
			"recovery uses the session, never exchanges the used code again",
		);
		await call("/auth/logout", {});
		assert.equal((await call("/auth/session")).status, 401);
		assert.equal((await call("/auth/recovery?reason=expired")).status, 200);
		assert.equal((await call("/auth/complete")).status, 401);
	} finally {
		await f.close();
	}
});

test("email tab establishes only the session; the initiating tab resumes the existing OAuth grant", async () => {
	const f = await oauthFixture();
	try {
		await f.decide(await f.form());
		const grant = await f.grant();
		f.state.details = {
			redirect_url: f.policy.redirectUris[0] + "?code=synthetic-code&state=bound",
		};
		f.cookies.clear();
		const consent = `/oauth/consent?authorization_id=${AUTH}`;
		assert.equal((await f.call(consent)).status, 401);
		const originalPage = await (await f.call("/auth/login")).text();
		assert.ok(originalPage.includes(f.config.appOrigin + consent));
		const callsBefore = f.providerCalls.length;
		assert.equal(
			(
				await f.call("/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: "synthetic@example.com" }),
				})
			).status,
			202,
		);
		const email = await f.call("/auth/callback?code=synthetic-code", {
			headers: { Accept: "text/html" },
		});
		assert.equal(email.headers.get("location"), f.config.appOrigin + "/auth/complete");
		const completion = await f.call("/auth/complete");
		assert.equal(completion.status, 200);
		assert.match(await completion.text(), /session-changed/);
		assert.equal(
			f.providerCalls.length,
			callsBefore,
			"email tab cannot complete the host's OAuth flow",
		);
		assert.equal((await f.call("/auth/session")).status, 200);
		const original = await f.call(consent);
		assert.equal(original.status, 303);
		assert.equal(original.headers.get("location"), f.state.details.redirect_url);
		assert.equal((await f.grant()).consent_version, grant.consent_version);
	} finally {
		await f.close();
	}
});
