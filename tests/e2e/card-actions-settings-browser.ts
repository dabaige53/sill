/** Synthetic settings examples: layout, accessible descriptions and unchanged visibility preferences. */
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
							preferences: { onboarded: true, stack: false, theme, archiveAfter: "never" },
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
			await page.locator('[data-action="action-toggle"]').first().waitFor();
			await page.locator("#modal").evaluate(async (modal) => {
				await document.fonts.ready;
				await Promise.all(
					modal.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})),
				);
			});
			await page
				.locator('[data-action="action-toggle"]')
				.first()
				.evaluate((node) =>
					node.closest(".settings-card").previousElementSibling.scrollIntoView({ block: "start" }),
				);
			const rows = await page.locator('[data-action="action-toggle"]').evaluateAll((nodes) =>
				nodes.map((toggle) => {
					const row = toggle.closest(".setting-row"),
						example = row.querySelector("small"),
						side = row.querySelector(".setting-side");
					return {
						key: toggle.getAttribute("data-id"),
						label: toggle.getAttribute("aria-label"),
						name: row.firstElementChild.firstChild.textContent,
						text: example?.textContent,
						describedBy: toggle.getAttribute("aria-describedby"),
						exampleId: example?.id,
						overflow: row.scrollWidth > row.clientWidth + 1,
						muted: example && getComputedStyle(example).color === getComputedStyle(side).color,
					};
				}),
			);
			assert.equal(rows.length, 9);
			for (const row of rows) {
				assert.ok(row.text);
				assert.equal(row.label, row.name);
				assert.equal(row.describedBy, row.exampleId);
				assert.ok(row.muted);
				assert.equal(row.overflow, false);
			}
			await page.screenshot({
				path: path.join(artifacts, `${width}-${theme}.jpg`),
				type: "jpeg",
				quality: 88,
				animations: "disabled",
			});
			const before = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
			const reply = page.locator('[data-action="action-toggle"][data-id="reply"]');
			assert.equal(await page.locator("#dock").isVisible(), false);
			const originalToggle = await reply.elementHandle();
			await reply.focus();
			await reply.click();
			assert.deepEqual(await page.evaluate(() => window.__store.pref("hiddenActions")), ["reply"]);
			assert.equal(await reply.getAttribute("aria-checked"), "false");
			assert.equal(await originalToggle.evaluate((n) => n.isConnected), true);
			assert.equal(
				await page
					.locator(".settings-layout")
					.evaluate(
						(n) =>
							n
								.getAnimations({ subtree: true })
								.filter(
									(animation) => (animation.effect as KeyframeEffect)?.pseudoElement !== "::before",
								).length,
					),
				0,
			);
			assert.equal(await reply.evaluate((n) => document.activeElement === n), true);
			const last = page.locator('[data-action="action-toggle"][data-id="dismiss"]');
			await last.scrollIntoViewIfNeeded();
			await last.click();
			assert.deepEqual(await page.evaluate(() => window.__store.pref("hiddenActions")), [
				"reply",
				"dismiss",
			]);
			assert.equal(await page.evaluate(() => window.__store.pref("stack")), false);
			assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), before);
			await page.evaluate(() => {
				window.__app.closeNative(false);
				window.__app.openCard("review-article");
			});
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
			await page.locator('[data-action="reader"]').click();
			await page.locator(".reader-body").waitFor();
			assert.deepEqual(await blocks(".reader-body"), previewBlocks);
			assert.equal(new Set(await aligned(".reader-body")).size, 1);
			await page.screenshot({
				path: path.join(artifacts, `article-reader-${width}-${theme}.jpg`),
				animations: "disabled",
			});
			assert.deepEqual(errors, []);
			assert.deepEqual(external, []);
			results.push({
				width,
				theme,
				rows,
				focusPreserved: true,
				lastSwitchReachable: true,
				onlyRequestedPreferencesChanged: true,
				sourceCardsUnchanged: true,
				errors,
				external,
			});
			console.log(
				`PASS action examples, descriptions, toggle focus and scrolling ${width}-${theme}`,
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
