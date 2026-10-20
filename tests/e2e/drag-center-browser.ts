/** Synthetic pointer drags: the card copy stays centered while originals and data remain unchanged. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { materialDensityCards } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/drag-center");
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((_req, res) => {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
const browser = await chromium.launch({ headless: true });
try {
	for (const theme of ["light", "dark"] as const) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			colorScheme: theme,
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.route("**/*", (route) =>
			route.request().url().startsWith(origin) ? route.continue() : route.abort(),
		);
		await page.addInitScript(
			({ cards, theme }) =>
				localStorage.setItem(
					"sill-v1",
					JSON.stringify({
						version: 4,
						cards,
						items: {},
						preferences: { onboarded: true, stack: false, theme, archiveAfter: "never" },
					}),
				),
			{ cards: materialDensityCards(), theme },
		);
		await page.goto(origin);
		await page.waitForFunction(() => window.__app?.layout.frame === 0);
		await page.locator("#feed-grid").evaluate(async (grid) => {
			await document.fonts.ready;
			await Promise.all(
				grid
					.getAnimations({ subtree: true })
					.map((animation) => animation.finished.catch(() => {})),
			);
		});
		for (const multiple of [false, true]) {
			await page.evaluate((multiple) => {
				window.__app.selected.clear();
				if (multiple) window.__app.select("review-note", { add: true });
				window.__app.updateSelection();
			}, multiple);
			const source = page.locator('#feed-grid [data-card="review-article"]');
			const before = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
			const original = await source.boundingBox();
			const text = await source.locator(".card-summary").boundingBox();
			assert.ok(original && text);
			await page.mouse.move(text.x + 12, text.y + 12);
			await page.mouse.down();
			await page.waitForTimeout(420);
			for (const point of [
				{ x: 700, y: 350 },
				{ x: 850, y: 500 },
			]) {
				await page.mouse.move(point.x, point.y);
				const copy = page.locator(".selection-drag-preview");
				const rect = await copy.boundingBox();
				assert.ok(rect);
				assert.ok(Math.abs(rect.x + rect.width / 2 - point.x) < 1);
				assert.ok(Math.abs(rect.y + rect.height / 2 - point.y) < 1);
				assert.equal(
					await copy.locator(".selection-stack-count").textContent(),
					multiple ? "2" : "1",
				);
				assert.equal(
					await copy.locator('[data-layer="0"] .card-title-button').textContent(),
					await source.locator(".card-title-button").textContent(),
				);
				assert.deepEqual(await source.boundingBox(), original);
			}
			await page.screenshot({
				path: path.join(artifacts, `${theme}-${multiple ? "multiple" : "single"}.png`),
			});
			if (multiple) {
				const dock = await page.locator("#ai-dock").boundingBox();
				assert.ok(dock);
				await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height / 2);
				assert.equal(await page.locator("#ai-dock.is-ready").count(), 1);
				await page.mouse.up();
				assert.deepEqual(await page.evaluate(() => window.__app.aiSelectionIds), [
					"review-note",
					"review-article",
				]);
			} else {
				await page.keyboard.press("Escape");
				await page.mouse.up();
			}
			assert.equal(await page.locator(".selection-drag-preview").count(), 0);
			assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), before);
		}
		assert.deepEqual(errors, []);
		console.log(
			`PASS ${theme}: centered single/multiple card copies, original geometry, cancel and AI drop`,
		);
		await context.close();
	}
} finally {
	await browser.close();
	server.close();
}
