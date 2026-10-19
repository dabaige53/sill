/** Isolated Chromium touch checks; not an iPhone/Safari frame-rate claim. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { chromium } from "playwright";

const server = http.createServer((_request, response) => {
	response.setHeader("Content-Type", "text/html; charset=utf-8");
	response.end(fs.readFileSync(new URL("../../dist/web/index.html", import.meta.url)));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
	fs.mkdirSync("tests/artifacts", { recursive: true });
	for (const reducedMotion of ["no-preference", "reduce"] as const) {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			reducedMotion,
		});
		await context.addInitScript(() => {
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards: Array.from({ length: 38 }, (_, i) => ({
						id: `pull-${i}`,
						type: "note",
						title: `合成测试 ${i}`,
						body: ["隔离测试，无私人数据。"],
						time: Date.now() - i,
					})),
					items: {},
					preferences: { onboarded: true, stack: false },
				}),
			);
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(
			`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`,
		);
		await page.waitForFunction(() => window.__app && !window.__app.layout.frame);
		assert.equal(
			await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
			"none",
		);
		assert.notEqual(
			await page.locator(".pull-ring").evaluate((node) => getComputedStyle(node).backdropFilter),
			"none",
			"glass material is preserved",
		);
		assert.equal(
			await page.evaluate(() => {
				const image = document.createElement("img");
				image.className = "card-image";
				document.body.appendChild(image);
				const properties = getComputedStyle(image).transitionProperty;
				image.remove();
				return properties.includes("filter");
			}),
			false,
			"covers must not animate large blur filters",
		);
		await page.evaluate(() => {
			window.__pullCalls = 0;
			window.__app.refresh = () => {
				window.__pullCalls++;
				return new Promise((resolve) => {
					window.__finishPull = resolve;
				});
			};
		});
		const session = await context.newCDPSession(page);
		async function touch(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", y = 200) {
			await session.send("Input.dispatchTouchEvent", {
				type,
				touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x: 180, y, id: 1 }],
			});
		}
		async function pull(cancel = false) {
			await touch("touchStart");
			for (const y of [220, 260, 310, 360]) await touch("touchMove", y);
			await page.waitForTimeout(30);
			const shift = await page
				.locator("main")
				.evaluate((node) => (node as HTMLElement).style.translate);
			assert.equal(reducedMotion === "reduce" ? shift === "" : shift !== "", true);
			await touch(cancel ? "touchCancel" : "touchEnd");
		}
		await pull(true);
		assert.equal(await page.evaluate(() => window.__pullCalls), 0);
		await page.waitForTimeout(300);
		assert.equal(
			await page.locator("main").evaluate((node) => (node as HTMLElement).style.translate),
			"",
		);
		await pull();
		await page.waitForTimeout(300);
		assert.equal(
			await page.locator("main").evaluate((node) => (node as HTMLElement).style.translate),
			reducedMotion === "reduce" ? "" : "0px 36px",
			"the desk pauses open while the ring turns",
		);
		await page.waitForTimeout(850);
		assert.equal(await page.evaluate(() => window.__pullCalls), 1);
		assert.equal(await page.locator(".pull-ring.is-spinning").count(), 1);
		await page.screenshot({ path: `tests/artifacts/refresh-loading-${reducedMotion}.png` });
		assert.equal(
			await page.locator("main").evaluate((node) => (node as HTMLElement).style.translate),
			"",
			"cards return while the real request is pending",
		);
		assert.equal(await page.locator("#pull-ring").getAttribute("aria-busy"), "true");
		assert.equal(
			(await page.locator("#pull-ring").textContent()).trim(),
			"",
			"feedback is icon-only",
		);
		// Another actual touch stream while the first request is pending must not refresh.
		await touch("touchStart");
		await touch("touchMove", 360);
		await touch("touchEnd");
		assert.equal(await page.evaluate(() => window.__pullCalls), 1);
		await page.evaluate(() => window.__finishPull());
		await page.waitForTimeout(30);
		assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "success");
		await page.waitForTimeout(550);
		assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "idle");
		await page.evaluate(() => {
			window.__app.refresh = async () => false;
		});
		await pull();
		await page.waitForTimeout(30);
		assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "error");
		await page.screenshot({ path: `tests/artifacts/refresh-retry-${reducedMotion}.png` });
		assert.equal(await page.locator("#pull-ring").getAttribute("aria-label"), "刷新失败，重试");
		await page.evaluate(() => {
			window.__app.refresh = async () => true;
		});
		await page.locator("#pull-ring").press("Enter");
		await page.waitForTimeout(30);
		assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "success");
		await page.waitForTimeout(550);
		await page.mouse.wheel(0, 400);
		await page.waitForTimeout(300);
		assert.ok((await page.evaluate(() => scrollY)) > 0, "ordinary scrolling remains available");
		assert.deepEqual(errors, []);
		console.log(`PASS refresh ownership, cancel, request lock, scroll: ${reducedMotion}`);
		await context.close();
	}
} finally {
	await browser.close();
	server.close();
}
