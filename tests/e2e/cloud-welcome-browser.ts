import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, devices, type Route } from "playwright";
import { workspaceBatch, workspaceSnapshot } from "../../contracts/cloud.ts";
import { loginPage } from "../../server/cloud/login-page.ts";
import { cloudLogout, cloudTool, waitCloud } from "../server/helpers/cloud-ui.ts";

const html = await readFile("dist/cloud/index.html", "utf8");
const server = createServer((req?: any, res?: any) => {
	if (new URL(req.url, "http://localhost").pathname !== "/") {
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: { code: "unmocked_route" } }));
		return;
	}
	res.setHeader("Content-Type", "text/html");
	res.end(html);
});
await new Promise((r?: any) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
	args: ["--no-sandbox"],
});
await mkdir("tests/artifacts/cloud-recovery", { recursive: true });
try {
	for (const mobile of [false, true]) {
		const context = await browser.newContext({
			...(mobile
				? { ...devices["iPhone 12"], viewport: { width: 390, height: 844 } }
				: { viewport: { width: 1440, height: 1000 } }),
			recordVideo: {
				dir: "tests/artifacts/cloud-recovery",
				size: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
			},
		});
		const page = await context.newPage(),
			errors = [];
		page.on("pageerror", (e?: any) => errors.push(e.message));
		let signedIn = false,
			sessionStatus = 401,
			loginRequests = 0;
		const workspace = workspaceSnapshot.parse({
			revision: 0,
			state: { cards: [], items: {}, preferences: {}, seconds: 0 },
		});
		let holdWorkspace = false;
		let holdRequest: (route: Route) => void;
		const heldWorkspace = new Promise<Route>((resolve) => (holdRequest = resolve));
		const receipts = new Map<string, ReturnType<typeof workspaceSnapshot.parse>>();
		await page.route("**/auth/**", (route?: any) => {
			const path = new URL(route.request().url()).pathname;
			if (path === "/auth/login") {
				assert.equal(route.request().method(), "GET", "email login is disabled");
				return route.fulfill({
					contentType: "text/html",
					body: loginPage({
						failed: new URL(route.request().url()).searchParams.has("login_error"),
					}),
				});
			}
			if (path === "/auth/password") {
				assert.equal(route.request().method(), "POST");
				assert.deepEqual(route.request().postDataJSON(), {
					email: "synthetic@example.com",
					password: "synthetic-password",
				});
				loginRequests++;
				signedIn = true;
				return route.fulfill({ json: { location: "/" } });
			}
			if (path === "/auth/logout") {
				signedIn = false;
				return route.fulfill({ json: { revoked: true } });
			}
			assert.equal(
				path,
				"/auth/session",
				"welcome fixture must handle every auth route explicitly",
			);
			return route.fulfill({
				status: signedIn ? 200 : sessionStatus,
				json: signedIn
					? { userId: "synthetic-owner" }
					: {
							error: {
								code:
									sessionStatus === 401
										? "unauthenticated"
										: sessionStatus === 403
											? "forbidden"
											: "unavailable",
							},
						},
			});
		});
		await page.route("**/api/v1/**", (route: Route) => {
			const request = route.request(),
				path = new URL(request.url()).pathname;
			assert.equal(request.headers()["x-sill-owner"], "synthetic-owner");
			if (path === "/api/v1/backups" && request.method() === "GET")
				return route.fulfill({ json: { targets: [], backups: [] } });
			if (path === "/api/v1/workspace" && request.method() === "GET") {
				if (holdWorkspace) {
					holdRequest(route);
					return;
				}
				return route.fulfill({ json: workspaceSnapshot.parse(workspace) });
			}
			assert.equal(path, "/api/v1/workspace/operations", "unexpected API in welcome fixture");
			assert.equal(request.method(), "POST");
			const key = request.headers()["idempotency-key"];
			assert.ok(key, "workspace writes carry an idempotency key");
			if (receipts.has(key)) return route.fulfill({ json: receipts.get(key) });
			// Only the reading state and preference operations exercised by this UI scenario.
			// Real atomic writes, conflicts and ownership are covered by cloud-operations-browser.
			for (const operation of workspaceBatch.parse(request.postDataJSON()).operations) {
				if (operation.op === "preferences.patch")
					Object.assign(workspace.state.preferences, operation.values);
				else if (operation.op === "item.patch") {
					assert.ok(workspace.state.cards.some((card) => card.id === operation.id));
					workspace.state.items[operation.id] = {
						...workspace.state.items[operation.id],
						...operation.values,
					};
				} else if (operation.op === "reading.add") workspace.state.seconds += operation.seconds;
				else assert.fail(`unexpected content mutation in welcome fixture: ${operation.op}`);
			}
			workspace.revision++;
			const response = workspaceSnapshot.parse(workspace);
			receipts.set(key, response);
			return route.fulfill({ json: response });
		});
		await page.goto(base);
		await page.locator("#password-form").waitFor();
		assert.deepEqual(
			await page.evaluate(() => [innerWidth, innerHeight]),
			mobile ? [390, 844] : [1440, 1000],
		);
		await page.waitForTimeout(150);
		assert.equal(await page.locator("#title").textContent(), "登录窗台");
		assert.equal(await page.locator("#cloud-account").count(), 0);
		assert.equal(await page.locator("[data-card]").count(), 0);
		assert.equal(await page.locator("#toast").count(), 0);
		if (mobile) {
			await page.setViewportSize({ width: 320, height: 844 });
			assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight]), [320, 844]);
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
			for (const selector of [
				".login-page",
				"#password-form",
				"#email",
				"#password-form button[type=submit]",
			]) {
				const bounds = await page.locator(selector).boundingBox();
				assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, `${selector} fits 320px`);
			}
			await page.screenshot({
				animations: "disabled",
				scale: "css",
				path: "tests/artifacts/cloud-recovery/mobile-320-welcome.png",
			});
			await page.setViewportSize({ width: 390, height: 844 });
			assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight]), [390, 844]);
		}
		await page.waitForTimeout(400);
		await page.screenshot({
			animations: "disabled",
			scale: "css",
			path: `tests/artifacts/cloud-recovery/${mobile ? "mobile" : "desktop"}-welcome.png`,
		});
		assert.equal(await page.locator("#email-login, #email-form").count(), 0);
		await page.locator("#email").fill("synthetic@example.com");
		await page.locator("#password").fill("synthetic-password");
		await page.locator("#password-form button[type=submit]").click();
		await waitCloud(page);
		assert.equal(loginRequests, 1);
		signedIn = false;
		await page.goto(base + "/?login_error=1");
		await page.waitForFunction(() =>
			document.querySelector("#status")?.textContent.includes("链接无效或已过期"),
		);
		assert.ok(page.url().includes("/auth/login"));
		signedIn = true;
		await page.goto(base);
		await waitCloud(page);
		await page.locator(".welcome [data-action=capture]").click();
		await page.locator("#cloud-editor").waitFor();
		await page.keyboard.press("Tab");
		assert.ok(
			await page.evaluate(() => document.querySelector("#modal").contains(document.activeElement)),
		);
		await page.locator("#cloud-title").fill("验收测试笔记（合成数据）");
		await page.locator("#cloud-body").fill("这是隔离测试内容，不是真实云端数据。\n".repeat(30));
		if (mobile) {
			await page.setViewportSize({ width: 390, height: 450 });
			await page.locator("#cloud-editor [data-action=close]").scrollIntoViewIfNeeded();
			assert.ok(await page.locator("#cloud-editor [data-action=close]").isVisible());
			await page.setViewportSize({ width: 390, height: 844 });
		}
		await page.waitForTimeout(400);
		await page.screenshot({
			animations: "disabled",
			scale: "css",
			path: `tests/artifacts/cloud-recovery/${mobile ? "mobile" : "desktop"}-editor.png`,
		});
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
		assert.equal(
			await page.evaluate(() => (document.activeElement as HTMLElement).dataset.action),
			"capture",
		);
		workspace.state.cards = Array.from({ length: 24 }, (_?: any, i?: any) => ({
			id: "test-" + i,
			type: "note",
			title: "测试笔记 " + (i + 1),
			body: "隔离验收数据，不是真实账号内容。",
			state: { read: false },
			revision: 1,
			updated_at: new Date().toISOString(),
		}));
		workspace.state.items = Object.fromEntries(
			workspace.state.cards.map((card) => [card.id, { read: false }]),
		);
		workspace.revision++;
		await cloudTool(page, "refresh");
		await page.waitForFunction(() => window.__store.state.cards.length === 24);
		await page.evaluate(() => window.__store.setPref("stack", false));
		await page.evaluate(() => window.__app.renderCurrent(true));
		await page.waitForFunction(
			() => document.querySelector("#feed-grid").getAttribute("data-sync") === "saved",
		);
		assert.equal(workspace.state.preferences.stack, false);
		// The phone home bar floats over the top of main; click the margin just under it.
		const below = await page.evaluate(() => {
			const bar = document.querySelector("#home-top");
			const top = document.querySelector("main").getBoundingClientRect().top;
			return bar && getComputedStyle(bar).display !== "none"
				? Math.max(0, bar.getBoundingClientRect().bottom - top)
				: 0;
		});
		await page.locator("main").click({ position: { x: 5, y: below + 5 } });
		await page.mouse.move(0, 0);
		await page.waitForTimeout(600);
		await page.screenshot({
			animations: "disabled",
			scale: "css",
			path: `tests/artifacts/cloud-recovery/${mobile ? "mobile" : "desktop"}-cards.png`,
		});
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.waitForFunction(
			() => window.__app.layout.frame === 0 && document.documentElement.scrollHeight > innerHeight,
		);
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
		);
		assert.ok(await page.evaluate(() => scrollY > 0));
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
		await page.locator(".card-title-button").first().click();
		await page.waitForFunction(() => (document.querySelector("#modal") as HTMLDialogElement).open);
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
		await page.locator("#account").click();
		await page.locator(".settings-nav").waitFor();
		assert.equal(
			await page.locator("[data-action=settings-group][data-extra=sources]").count(),
			0,
			"ADR 0033 removes source connections from settings",
		);
		await page.locator("[data-action=settings-group][data-extra=add]").click();
		await page.locator(".settings-main #capture-text").waitFor();
		assert.equal(await page.locator("#nav [data-action=capture]").count(), 0);
		assert.equal(
			await page.locator("#modal").evaluate((e) => e.classList.contains("page")),
			mobile,
		);
		await page.locator("[data-action=settings-group][data-extra=data]").click();
		assert.equal(
			await page.locator(".settings-main .setting-row").first().textContent(),
			"存放位置云端账号",
		);
		assert.equal(
			await page.locator(".settings-main [data-action=export-all]").textContent(),
			"导出",
		);
		assert.ok(
			await page.locator(".settings-main").evaluate((el) => el.scrollWidth <= el.clientWidth),
		);
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
		await page.waitForFunction(
			() => document.querySelector("#feed-grid").getAttribute("data-sync") === "saved",
		);
		holdWorkspace = true;
		await cloudTool(page, "refresh");
		let holdTimer: ReturnType<typeof setTimeout>;
		const heldRoute = await Promise.race([
			heldWorkspace,
			new Promise<never>((_, reject) => {
				holdTimer = setTimeout(
					() => reject(new Error("refresh did not request the workspace")),
					5000,
				);
			}),
		]).finally(() => clearTimeout(holdTimer));
		await cloudLogout(page);
		await page.locator("#cloud-confirm").waitFor();
		assert.match(await page.locator("#modal").textContent(), /放弃未保存的草稿/);
		const logout = page.locator("#cloud-confirm").click();
		holdWorkspace = false;
		await heldRoute.fulfill({ json: workspaceSnapshot.parse(workspace) });
		await logout;
		await page.locator("#password-form").waitFor();
		assert.equal(
			await page.locator("[data-card]").count(),
			0,
			"logout and refresh cannot revive signed-out content",
		);
		assert.equal(await page.locator("body.cloud-signed-in").count(), 0);
		assert.equal(await page.evaluate(() => localStorage.length), 0);
		for (const code of [403, 503]) {
			sessionStatus = code;
			await page.goto(base);
			await page.locator("#toast").waitFor({ state: "visible" });
			assert.equal(await page.locator("[data-card]").count(), 0);
			assert.match(await page.locator("#toast").textContent(), code === 403 ? /权限/ : /连接暂时/);
		}
		signedIn = true;
		await cloudTool(page, "refresh");
		await waitCloud(page);
		await page.waitForFunction(() => window.__store.state.cards.length === 24);
		assert.equal(await page.evaluate(() => localStorage.length), 0);
		assert.deepEqual(errors, []);
		await context.close();
		await page
			.video()
			.saveAs(`tests/artifacts/cloud-recovery/${mobile ? "mobile" : "desktop"}-walkthrough.webm`);
		console.log(
			`PASS welcome/editor/navigation/keyboard/focus/scroll/privacy/logout/late-response/retry ${mobile ? "iPhone12 390x844" : "desktop 1440x1000"}`,
		);
	}
} finally {
	await browser.close();
	await new Promise((r?: any) => server.close(r));
}
