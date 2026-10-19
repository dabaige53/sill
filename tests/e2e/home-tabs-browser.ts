/** Shared home filters: desktop placement, phone behavior and search isolation, using synthetic cards. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/home-tabs");
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((_request, response) => {
	response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	response.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const results: unknown[] = [];
const cases = [
	{ width: 1440, theme: "light" },
	{ width: 1440, theme: "dark" },
	{ width: 1920, theme: "light" },
	{ width: 320, theme: "light" },
	{ width: 320, theme: "dark" },
	{ width: 390, theme: "light" },
	{ width: 390, theme: "dark" },
] as const;
try {
	for (const { width, theme } of cases) {
		const context = await browser.newContext({
			viewport: { width, height: width > 650 ? 1000 : 844 },
			colorScheme: theme,
			hasTouch: width <= 650,
			isMobile: width <= 650,
			locale: "zh-CN",
		});
		const page = await context.newPage(),
			errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await context.route("**/*", (route) => {
			const url = route.request().url();
			if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
			external.push(url);
			return route.abort();
		});
		await page.clock.setFixedTime(new Date(reviewTime));
		await page.addInitScript(
			({ cards, theme }) => {
				localStorage.setItem(
					"sill-v1",
					JSON.stringify({
						version: 4,
						cards,
						items: {
							"review-note": { read: true },
							"review-article": { bookmarked: true, later: true },
						},
						preferences: {
							onboarded: true,
							stack: false,
							theme,
							archiveAfter: "never",
							floatTimely: false,
						},
					}),
				);
			},
			{ cards: materialDensityCards(), theme },
		);
		await page.goto(origin);
		await page.waitForFunction(() => window.__app?.layout.frame === 0);
		const head = page.locator("#home-top");
		assert.equal(await head.isVisible(), true);
		assert.deepEqual(await head.locator(".home-tab").allTextContents(), [
			"全部",
			"未读",
			"待办",
			"稍后读",
			"收藏",
		]);
		const geometry = await head.evaluate((n) => {
			const r = n.getBoundingClientRect(),
				grid = document.getElementById("feed-grid").getBoundingClientRect();
			return {
				left: r.left,
				width: r.width,
				bottom: r.bottom,
				gridLeft: grid.left,
				gridTop: grid.top,
				mark: getComputedStyle(n.querySelector(".home-mark")).display,
				position: getComputedStyle(n).position,
			};
		});
		if (width > 650) {
			assert.ok(geometry.width < width / 2);
			assert.equal(geometry.left, geometry.gridLeft);
			assert.equal(geometry.gridTop - geometry.bottom, 16);
			assert.equal(geometry.mark, "none");
			assert.equal(geometry.position, "relative");
		} else {
			assert.equal(geometry.position, "fixed");
			assert.notEqual(geometry.mark, "none");
		}
		const source = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
		await page.evaluate(() => {
			window.__app.searchFilter = { type: "note", status: "all", tag: "", query: "密度" };
		});
		const search = await page.evaluate(() => ({ ...window.__app.searchFilter }));
		const views: Record<string, string[]> = {};
		for (const key of ["unread", "todo", "later", "saved", "all"]) {
			const tab = head.locator(`[data-extra="${key}"]`);
			await tab.click();
			await page.waitForFunction(() => window.__app.layout.frame === 0);
			assert.equal(await tab.getAttribute("aria-pressed"), "true");
			assert.equal(await head.locator('[aria-pressed="true"]').count(), 1);
			assert.deepEqual(await page.evaluate(() => ({ ...window.__app.searchFilter })), search);
			views[key] = await page
				.locator("#feed-grid [data-card]")
				.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")).sort());
		}
		assert.ok(!views.unread.includes("review-note") && views.unread.includes("review-article"));
		assert.deepEqual(views.todo, ["review-reminder", "review-task"]);
		assert.deepEqual(views.saved, ["review-article"]);
		assert.deepEqual(views.later, ["review-article"]);
		assert.equal(views.all.length, materialDensityCards().length);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), source);
		await page.locator('#nav [data-extra="search"]').click();
		await page.locator("#filter-search").waitFor();
		assert.equal(await page.locator("#filter-search").inputValue(), "密度");
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !document.getElementById("modal").hasAttribute("open"));
		assert.equal(await head.locator('[data-extra="all"]').getAttribute("aria-pressed"), "true");
		assert.deepEqual(errors, []);
		assert.deepEqual(external, []);
		results.push({
			width,
			theme,
			geometry,
			views,
			searchUnchanged: true,
			sourceCardsUnchanged: true,
			errors,
			external,
		});
		console.log(`PASS shared home filters, placement and search isolation ${width}-${theme}`);
		await context.close();
	}
	fs.writeFileSync(
		path.join(artifacts, "checks.json"),
		JSON.stringify({ results }, null, 2) + "\n",
	);
} finally {
	await browser.close();
	server.close();
}
