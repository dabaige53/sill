/** Synthetic settings layout and legacy action visibility compatibility. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/card-actions-settings");
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
try {
	for (const width of [320, 390, 1440])
		for (const theme of ["light", "dark"] as const) {
			const context = await browser.newContext({
				viewport: { width, height: width > 650 ? 1000 : 844 },
				hasTouch: width < 650,
				isMobile: width < 650,
				colorScheme: theme,
				locale: "zh-CN",
				timezoneId: "Asia/Shanghai",
			});
			const page = await context.newPage(),
				errors: string[] = [],
				external: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
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
							items: { "review-article": { note: "对照现有流程，再确认适用范围。" } },
							preferences: {
								onboarded: true,
								stack: false,
								theme,
								archiveAfter: "never",
								hiddenActions: ["bookmark", "tag", "later", "open"],
							},
						}),
					);
				},
				{ cards: materialDensityCards(), theme },
			);
			await page.goto(origin);
			await page.waitForFunction(() => window.__app?.layout.frame === 0);
			const homeLines = await page.locator("#home-top").evaluate((head) => {
				const first = document.querySelector("#feed-grid .feed-item").getBoundingClientRect();
				const mark = head.querySelector(".home-mark").getBoundingClientRect();
				const account = head.querySelector("#account .account-wrap").getBoundingClientRect();
				return {
					left: mark.left,
					cardLeft: first.left,
					right: account.right,
					gridRight: Math.max(
						...Array.from(document.querySelectorAll("#feed-grid .feed-item")).map(
							(n) => n.getBoundingClientRect().right,
						),
					),
				};
			});
			assert.ok(Math.abs(homeLines.left - homeLines.cardLeft) < 1);
			if (width > 650)
				assert.ok(Math.abs(homeLines.right - homeLines.gridRight) < 1, JSON.stringify(homeLines));
			await page.locator("#account").click();
			await page.locator('.settings-main [data-action="pref-toggle"]').first().waitFor();
			assert.equal(await page.locator('[data-action="action-toggle"]').count(), 0);
			const before = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
			assert.deepEqual(await page.evaluate(() => window.__store.pref("hiddenActions")), [
				"bookmark",
				"tag",
				"later",
				"open",
			]);
			await page.evaluate(() => {
				window.__app.closeNative(false);
				window.__app.openCard("review-article");
			});
			assert.deepEqual(
				await page
					.locator(".float-bar button")
					.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action"))),
				["bookmark", "edit", "later", "external"],
			);
			assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), before);
			const blocks = async (selector: string) =>
				page.locator(selector).evaluate((body) =>
					Array.from(body.children)
						.filter((n) => n.id !== "reader-end")
						.map((n) => [n.tagName, n.className, n.textContent]),
				);
			const previewBlocks = await blocks(".preview-body");
			assert.equal(
				await page.locator("aside.preview-note .preview-note-label").textContent(),
				"备注",
			);
			assert.equal(
				await page.locator("aside.preview-note p").textContent(),
				"对照现有流程，再确认适用范围。",
			);
			assert.ok((await page.locator(".preview-meta").textContent()).includes("约 4 分钟阅读"));
			const aligned = async (selector: string) =>
				page.locator(selector).evaluate((body) => {
					const nodes = body.querySelectorAll(
						":scope > h1, :scope > .preview-meta, :scope > .preview-cover, :scope > .preview-lead, :scope > .preview-full",
					);
					return Array.from(nodes).map((n) => Math.round(n.getBoundingClientRect().left));
				});
			assert.equal(new Set(await aligned(".preview-body")).size, 1);
			await page.screenshot({
				path: path.join(artifacts, `article-preview-${width}-${theme}.jpg`),
				animations: "disabled",
			});
			// The full-screen reader is desktop only; phones keep the drawer (web-interaction handbook).
			// Short content fits the preview, so its expand button stays hidden; the reader still opens directly.
			if (width > 650) {
				assert.equal(await page.locator('[data-action="reader"]').isVisible(), false);
				await page.evaluate(() => window.__app.openCard("review-article", true));
				await page.locator(".reader-body").waitFor();
				// The reader moves the cover after the header (web-interaction handbook); the rest matches the preview.
				const readerBlocks = await blocks(".reader-body");
				assert.equal(readerBlocks[1]?.[1], "preview-cover");
				assert.deepEqual(
					readerBlocks.filter((block) => block[1] !== "preview-cover"),
					previewBlocks,
				);
				assert.equal(new Set(await aligned(".reader-body")).size, 1);
				await page.screenshot({
					path: path.join(artifacts, `article-reader-${width}-${theme}.jpg`),
					animations: "disabled",
				});
			} else assert.equal(await page.locator('[data-action="reader"]').count(), 0);
			assert.deepEqual(errors, []);
			assert.deepEqual(external, []);
			results.push({
				width,
				theme,
				actionHidingControlsAbsent: true,
				legacyPreferencesIgnored: true,
				sourceCardsUnchanged: true,
				errors,
				external,
			});
			console.log(`PASS settings without action hiding controls ${width}-${theme}`);
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
