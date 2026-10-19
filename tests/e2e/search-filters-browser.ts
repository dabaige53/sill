/** Search filter rows, real controls and narrow keyboard space, using synthetic cards. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/search-filters");
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
	{ width: 1440, theme: "light", height: 1000 },
	{ width: 1440, theme: "dark", height: 1000 },
	{ width: 320, theme: "light", height: 844 },
	{ width: 320, theme: "dark", height: 844 },
	{ width: 390, theme: "light", height: 844 },
	{ width: 390, theme: "dark", height: 844 },
	{ width: 390, theme: "light", height: 430 },
] as const;
try {
	for (const { width, theme, height } of cases) {
		const context = await browser.newContext({
			viewport: { width, height },
			colorScheme: theme,
			isMobile: width < 650,
			hasTouch: width < 650,
			locale: "zh-CN",
		});
		const page = await context.newPage(),
			errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await context.route("**/*", (route) => {
			const u = route.request().url();
			if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
			external.push(u);
			return route.abort();
		});
		await page.clock.setFixedTime(new Date(reviewTime));
		await page.addInitScript(
			({ cards, theme }) =>
				localStorage.setItem(
					"sill-v1",
					JSON.stringify({
						version: 4,
						cards,
						items: { "review-article": { bookmarked: true, later: true } },
						preferences: {
							onboarded: true,
							stack: false,
							theme,
							archiveAfter: "never",
							floatTimely: false,
						},
					}),
				),
			{ cards: materialDensityCards(), theme },
		);
		await page.goto(origin);
		await page.waitForFunction(() => window.__app?.layout.frame === 0);
		const source = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
		const home = await page.evaluate(() => JSON.stringify(window.__app.filter));
		await page.locator('#nav [data-extra="search"]').click();
		await page.locator("#filter-search").waitFor();
		const rows = page.locator("#modal .search-filter-row");
		assert.equal(await rows.count(), 3, "three named filter rows");
		assert.deepEqual(await rows.locator(".search-filter-label").allTextContents(), [
			"类型",
			"状态",
			"标签",
		]);
		assert.deepEqual(
			await rows
				.locator('[role="group"]')
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label"))),
			["类型", "状态", "标签"],
		);
		const geometry = await rows.evaluateAll((ns) =>
			ns.map((n) => {
				const r = n.getBoundingClientRect(),
					items = n.querySelector(".search-filter-items") as HTMLElement;
				return {
					y: r.y,
					bottom: r.bottom,
					height: r.height,
					clientWidth: items.clientWidth,
					scrollWidth: items.scrollWidth,
				};
			}),
		);
		assert.equal(geometry[1].y - geometry[0].bottom, 8);
		assert.equal(geometry[2].y - geometry[1].bottom, 8);
		const bounds = await page.locator("#search-results").boundingBox();
		assert.ok(bounds.height > 0 && bounds.y >= geometry[2].bottom);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
			false,
		);
		assert.equal(
			await page.locator("#modal").evaluate((n) => n.scrollWidth > n.clientWidth + 1),
			false,
		);
		await page.locator('[data-action="filter-type"][data-extra="note"]').focus();
		await page.keyboard.press("Enter");
		assert.equal(
			await page
				.locator('[data-action="filter-type"][data-extra="note"]')
				.getAttribute("aria-pressed"),
			"true",
		);
		assert.deepEqual(
			await page
				.locator("#search-results [data-card]")
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-card")).sort()),
			["review-note", "review-note-2"],
		);
		await page.locator('[data-action="filter-type"][data-extra="all"]').click();
		await page.locator('[data-action="filter-status"][data-extra="saved"]').click();
		assert.deepEqual(
			await page
				.locator("#search-results [data-card]")
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-card"))),
			["review-article"],
		);
		await page.locator('[data-action="filter-status"][data-extra="saved"]').click();
		const tag = page.locator('[data-action="filter-tag"][data-extra="交互"]');
		await tag.focus();
		await page.keyboard.press("Space");
		assert.equal(await tag.getAttribute("aria-pressed"), "true");
		assert.equal(
			await tag.evaluate((n) => {
				const r = n.getBoundingClientRect(),
					p = n.parentElement.getBoundingClientRect();
				return document.activeElement === n && r.left >= p.left && r.right <= p.right;
			}),
			true,
			"keyboard-selected tag remains visible in its row",
		);
		assert.deepEqual(
			await page
				.locator("#search-results [data-card]")
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-card"))),
			["review-note-2"],
		);
		await page.locator('[data-action="filter-tag"][data-extra="交互"]').click();
		await page.locator("#filter-search").fill("密度");
		await page.waitForFunction(
			() =>
				window.__app.searchFilter.query === "密度" &&
				document.querySelectorAll("#search-results [data-card]").length === 1,
		);
		assert.deepEqual(
			await page
				.locator("#search-results [data-card]")
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-card"))),
			["review-note"],
		);
		await page.locator('#search-results [data-card="review-note"] .card-title-button').click();
		await page.locator("#search-background[open]").waitFor();
		assert.equal(await page.locator("#search-background .search-filter-row").count(), 3);
		await page.keyboard.press("Escape");
		await page.locator("#modal.search[open]").waitFor();
		assert.equal(await page.locator("#filter-search").inputValue(), "密度");
		assert.equal(await page.locator("#modal .search-filter-row").count(), 3);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__app.filter)), home);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), source);
		await page.screenshot({
			path: path.join(artifacts, width + "-" + theme + "-" + height + ".jpg"),
			type: "jpeg",
			quality: 88,
			animations: "disabled",
		});
		assert.deepEqual(errors, []);
		assert.deepEqual(external, []);
		results.push({
			width,
			theme,
			height,
			geometry,
			resultsHeight: bounds.height,
			keyboardTypeAndTag: true,
			searchAndHomeIndependent: true,
			sourceCardsUnchanged: true,
			errors,
			external,
		});
		console.log(
			"PASS search filter rows, keyboard controls and retained detail " +
				width +
				"-" +
				theme +
				"-" +
				height,
		);
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
