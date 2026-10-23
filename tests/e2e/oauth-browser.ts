import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { A } from "../server/helpers/boundary-fixture.ts";
import { AUTH, oauthFixture } from "../server/helpers/oauth-fixture.ts";
import { token } from "../server/helpers/signed-auth.ts";

const callbackServer = createServer((_req?: any, res?: any) => {
	res.writeHead(200, { "Content-Type": "text/html" });
	res.end("<h1>Synthetic callback · not a real Codex connection</h1>");
});
await new Promise((r?: any) => callbackServer.listen(0, "127.0.0.1", r));
const callbackOrigin =
	"http://127.0.0.1:" + (callbackServer.address() as import("node:net").AddressInfo).port;
const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
await mkdir("tests/artifacts", { recursive: true });
try {
	for (const [name, viewport] of [
		["desktop", { width: 1440, height: 1000 }],
		["iphone12", { width: 390, height: 844 }],
	] as const) {
		const f = await oauthFixture(),
			context = await browser.newContext({ viewport });
		try {
			f.policy.redirectUris[0] = callbackOrigin + "/callback";
			f.details.redirect_uri = f.policy.redirectUris[0];
			await f.sql("update sill_private.oauth_clients set policy=$1 where owner_id=$2", [
				JSON.stringify(f.policy),
				A,
			]);

			await context.route(f.config.appOrigin + "/**", async (route?: any) => {
				const req = route.request();
				const response = await f.runtime(
					new Request(req.url(), {
						method: req.method(),
						headers: await req.allHeaders(),
						...(req.postData() ? { body: req.postData() } : {}),
					}),
				);
				const headers = Object.fromEntries(response.headers);
				if (response.headers.getSetCookie().length)
					headers["set-cookie"] = response.headers.getSetCookie().join("\n");
				await route.fulfill({
					status: response.status,
					headers,
					body: Buffer.from(await response.arrayBuffer()),
				});
			});
			const page = await context.newPage(),
				errors = [];
			page.setDefaultNavigationTimeout(15000);
			page.setDefaultTimeout(15000);
			page.on("pageerror", (e?: any) => errors.push(e.message));
			await page.goto(f.config.appOrigin + "/oauth/consent?authorization_id=" + AUTH);
			await page.getByRole("link", { name: "前往登录", exact: true }).click();
			await page.getByLabel("邮箱", { exact: true }).first().fill("synthetic@example.com");
			await page.getByLabel("密码", { exact: true }).fill("synthetic-password");
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await page.screenshot({ path: `tests/artifacts/password-${name}.png`, fullPage: true });
			await page.getByRole("button", { name: "登录并继续" }).click();
			await page.getByRole("button", { name: "允许访问", exact: true }).waitFor();
			assert.equal(await f.grant(), undefined);
			assert.match(await page.locator("main").innerText(), /读取卡片、创建与修改卡片/);
			assert.match(await page.locator("main").innerText(), /openid/);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await page.getByRole("button", { name: "允许访问", exact: true }).focus();
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLInputElement).value),
				"approve",
			);
			await page.screenshot({ path: `tests/artifacts/oauth-${name}-review.png`, fullPage: true });
			await page.getByRole("button", { name: "拒绝", exact: true }).click();
			await page.waitForURL(callbackOrigin + "/**");
			assert.equal(await f.grant(), undefined);
			await page.goto(f.config.appOrigin + "/oauth/consent?authorization_id=" + AUTH);
			await page.getByRole("button", { name: "允许访问", exact: true }).click();
			await page.waitForURL(callbackOrigin + "/**");
			assert.ok(await f.grant());
			await page.goto(f.config.appOrigin + "/oauth/grants");
			await page.getByRole("button", { name: "撤销此客户端" }).click();
			await page.getByRole("heading", { name: "Sill 访问已撤销" }).waitFor();
			assert.equal(await f.grant(), undefined);
			assert.ok((await context.cookies()).some((c?: any) => c.name === "__Host-sill-access"));
			assert.deepEqual(errors, []);
			console.log(
				name +
					": consent review, keyboard focus, deny, approve, revoke, session preservation passed (synthetic provider)",
			);
		} finally {
			await context.close();
			await f.close();
		}
	}
} finally {
	await browser.close();
	await new Promise((r?: any) => callbackServer.close(r));
}
