/** Search categories, type chips, # conditions and narrow keyboard space, using synthetic cards. */
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
		if (width > 650) await page.evaluate(() => window.__app.action("search"));
		else await page.locator('#nav [data-extra="search"]').click();
		await page.locator("#filter-search").waitFor();
		assert.equal(
			await page.locator(".search-category").count(),
			6,
			"empty search shows category cards",
		);
		assert.equal(
			await page.locator("#feed-grid").evaluate((el) => getComputedStyle(el).visibility),
			"hidden",
		);
		await page.locator("#filter-search").fill("密度");
		await page.locator(".search-chips:not([hidden])").waitFor();
		const chips = page.locator(".search-chips fieldset");
		assert.equal(await chips.getAttribute("aria-label"), "类型");
		await page.locator('[data-action="filter-type"][data-extra="note"]').focus();
		await page.keyboard.press("Space");
		assert.equal(
			await page
				.locator('[data-action="filter-type"][data-extra="note"]')
				.getAttribute("aria-pressed"),
			"true",
		);
		const bounds = await page.locator("#search-results").boundingBox();
		assert.ok(bounds.height > 0);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
			false,
		);
		assert.equal(
			await page.locator("#modal").evaluate((n) => n.scrollWidth > n.clientWidth + 1),
			false,
		);
		await page.locator('[data-action="search-reset"]').click();
		if (width < 650 && height === 844) {
			await page.locator("#filter-search").fill("jje");
			await page.waitForFunction(
				() =>
					window.__app.searchFilter.query === "jje" &&
					document.querySelectorAll("#search-results [data-card]").length === 0,
			);
			const keyboard = await page.evaluate(async () => {
				const viewport = window.visualViewport;
				const visibleHeight = viewport.height;
				let keyboardHeight = 0;
				Object.defineProperty(viewport, "height", {
					configurable: true,
					get: () => visibleHeight - keyboardHeight,
				});
				const nextFrame = () =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
					);
				const measure = () => ({
					page: document.getElementById("modal").getBoundingClientRect().bottom,
					input: document.getElementById("filter-search").getBoundingClientRect().top,
					results: document.getElementById("search-results").getBoundingClientRect().height,
					inset: document.documentElement.style.getPropertyValue("--kb"),
				});
				try {
					const before = measure();
					// WebKit may report geometry only after the viewport event handler returns.
					viewport.dispatchEvent(new Event("resize"));
					keyboardHeight = 300;
					await nextFrame();
					const open = measure();
					keyboardHeight = 0;
					window.dispatchEvent(new Event("resize"));
					await nextFrame();
					return { before, open, closed: measure(), height: innerHeight };
				} finally {
					Reflect.deleteProperty(viewport, "height");
					viewport.dispatchEvent(new Event("resize"));
				}
			});
			assert.equal(keyboard.before.page, keyboard.height);
			assert.equal(keyboard.open.page, keyboard.height, "keyboard never cuts the page background");
			assert.equal(keyboard.open.input, keyboard.before.input, "input remains anchored");
			assert.ok(keyboard.open.results > 0 && keyboard.open.results < keyboard.before.results);
			assert.equal(keyboard.open.inset, "300px");
			assert.deepEqual(
				keyboard.closed,
				keyboard.before,
				"dismissal restores the full results area",
			);
			await page.screenshot({ path: path.join(artifacts, width + "-" + theme + "-empty.png") });
			await page.locator("#filter-search").fill("");
			await page.waitForFunction(
				() =>
					window.__app.searchFilter.query === "" &&
					document.querySelectorAll(".search-category").length === 6,
			);
		}
		await page.locator('.search-category[data-extra="note"]').focus();
		await page.keyboard.press("Enter");
		assert.equal(await page.locator('.search-token[data-extra="type"]').innerText(), "笔记");
		const ids = () =>
			page
				.locator("#search-results [data-card]")
				.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-card")).sort());
		assert.deepEqual(await ids(), ["review-note", "review-note-2"]);
		await page.locator('[data-action="search-reset"]').click();
		await page.locator("#filter-search").fill("#");
		const status = page.locator('[data-action="search-hash"][data-extra="status:saved"]');
		await status.focus();
		await page.keyboard.press("Enter");
		assert.deepEqual(await ids(), ["review-article"]);
		assert.equal(await page.locator('.search-token[data-extra="status"]').innerText(), "#收藏");
		await page.locator("#filter-search").press("Backspace");
		assert.equal(await page.locator('.search-token[data-extra="status"]').count(), 0);
		await page.locator("#filter-search").fill("#交互");
		await page.locator('[data-action="search-hash"][data-extra="tag:交互"]').focus();
		await page.keyboard.press("Space");
		assert.deepEqual(await ids(), ["review-note-2"]);
		assert.equal(await page.locator('.search-token[data-extra="tag"]').innerText(), "#交互");
		await page.locator('.search-token[data-extra="tag"]').click();
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
		assert.equal(await page.locator("#search-background .search-chips").count(), 1);
		await page.keyboard.press("Escape");
		await page.locator("#modal.search[open]").waitFor();
		assert.equal(await page.locator("#filter-search").inputValue(), "密度");
		assert.equal(await page.locator("#modal .search-chips").count(), 1);
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
			resultsHeight: bounds.height,
			keyboardTypeAndTag: true,
			searchAndHomeIndependent: true,
			sourceCardsUnchanged: true,
			errors,
			external,
		});
		console.log(
			"PASS search conditions, keyboard controls and retained detail " +
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
