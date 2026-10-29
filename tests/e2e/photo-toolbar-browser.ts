/** Photo tools use synthetic cards on an isolated origin; no device or production acceptance. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/photo-toolbar");
fs.mkdirSync(artifacts, { recursive: true });
const photo = {
	id: "photo-tools",
	type: "photo",
	title: "合成照片工具检查",
	images: ["architecture", "coast"],
	location: "合成展厅",
	time: Date.parse("2026-10-19T01:00:00Z"),
};
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
	for (const width of [320, 390, 1440]) {
		for (const theme of ["light", "dark"] as const) {
			const context = await browser.newContext({
				viewport: { width, height: width > 650 ? 1000 : 844 },
				hasTouch: true,
				isMobile: width <= 650,
				colorScheme: theme,
				locale: "zh-CN",
			});
			const page = await context.newPage();
			const errors: string[] = [],
				external: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await context.route("**/*", (route) => {
				const url = route.request().url();
				if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
				external.push(url);
				return route.abort();
			});
			await page.addInitScript(
				({ photo, theme }) => {
					localStorage.setItem(
						"sill-v1",
						JSON.stringify({
							version: 4,
							cards: [photo],
							items: {},
							preferences: { onboarded: true, stack: false, theme, archiveAfter: "never" },
						}),
					);
				},
				{ photo, theme },
			);
			await page.goto(origin);
			await page.waitForFunction(() => window.__app?.layout.frame === 0);
			await page.evaluate(() => window.__app.openCard("photo-tools"));
			await page.locator("#modal.lightbox[open]").waitFor();
			const bar = page.locator("#modal .float-bar");
			assert.equal(await bar.count(), 1);
			assert.deepEqual(
				await bar
					.locator("button")
					.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action"))),
				["bookmark", "edit", "later"],
			);
			await page
				.locator('.photo-carousel-page[aria-hidden="false"] img')
				.evaluate(async (image: HTMLImageElement) => {
					await image.decode();
					await document.fonts.ready;
				});
			await page.locator("#modal").evaluate(async (modal) => {
				await Promise.all(
					modal
						.getAnimations({ subtree: true })
						.map((animation) => animation.finished.catch(() => {})),
				);
			});
			const layout = await bar.evaluate((node) => {
				const r = node.getBoundingClientRect(),
					thumbs = document.querySelector(".lightbox-thumbs").getBoundingClientRect();
				return {
					left: r.left,
					right: r.right,
					top: r.top,
					bottom: r.bottom,
					thumbsBottom: thumbs.bottom,
					color: getComputedStyle(node.querySelector("button")).color,
				};
			});
			assert.ok(layout.left >= 0 && layout.right <= width);
			assert.ok(
				layout.top >= layout.thumbsBottom && layout.bottom <= (width > 650 ? 1000 : 844),
				JSON.stringify(layout),
			);
			assert.equal(
				layout.color,
				theme === "dark" ? "rgb(242, 242, 244)" : "rgb(29, 29, 31)",
				"photo tools follow the page theme",
			);
			await page.screenshot({
				path: path.join(artifacts, `${width}-${theme}.jpg`),
				type: "jpeg",
				quality: 85,
				animations: "disabled",
			});
			let source = await page.evaluate(() => JSON.stringify(window.__store.card("photo-tools")));
			await page.locator('#modal [data-action="bookmark"]').click();
			await page.waitForFunction(() => window.__store.item("photo-tools").bookmarked === true);
			assert.equal(
				await page.locator('#modal [data-action="bookmark"]').getAttribute("aria-label"),
				"取消收藏",
			);
			await page.locator('#modal [data-action="later"]').click();
			await page.waitForFunction(() => window.__store.item("photo-tools").later === true);
			await page.locator('[data-action="photo-go"][data-extra="1"]').click();
			const selectedPhoto = await page
				.locator('.photo-carousel-page[aria-hidden="false"] img')
				.getAttribute("src");
			assert.equal(await page.locator('#modal [data-action="bookmark"].active').count(), 1);
			await page.locator('#modal [data-action="edit"]').click();
			await page.locator("#tag-new").fill("照片核对");
			await page.locator('[data-action="save-note"]').click();
			await page.locator("#modal.lightbox[open]").waitFor();
			assert.equal(
				await page.locator('.photo-carousel-page[aria-hidden="false"] img').getAttribute("src"),
				selectedPhoto,
			);
			assert.deepEqual(
				await page.evaluate(() => [...window.__store.tags(window.__store.card("photo-tools"))]),
				["照片核对"],
			);
			await page.locator('#modal [data-action="edit"]').click();
			source = await page.evaluate(() => JSON.stringify(window.__store.card("photo-tools")));
			await page.locator("#tag-new").fill("不保存");
			await page.locator('#tag-layer [data-action="close"]').click();
			await page.locator("#modal.lightbox[open]").waitFor();
			assert.equal(
				await page.locator('.photo-carousel-page[aria-hidden="false"] img').getAttribute("src"),
				selectedPhoto,
			);
			assert.equal(
				await page.evaluate(() => JSON.stringify(window.__store.card("photo-tools"))),
				source,
			);
			assert.deepEqual(
				await page.evaluate(() => [...window.__store.tags(window.__store.card("photo-tools"))]),
				["照片核对"],
			);
			await page.evaluate(() => {
				window.__app.setPref("hiddenActions", ["bookmark", "tag", "later"]);
				window.__app.openCard("photo-tools");
			});
			assert.equal(await bar.count(), 1);
			assert.deepEqual(
				await bar
					.locator("button")
					.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action"))),
				["bookmark", "edit", "later"],
			);
			assert.equal(await page.locator(".lightbox-thumbs button").count(), 2);
			assert.deepEqual(errors, []);
			assert.deepEqual(external, []);
			results.push({
				width,
				theme,
				layout,
				sourceCardUnchanged: true,
				samePhotoAfterSaveAndCancel: true,
				errors,
				external,
			});
			console.log(`PASS photo tools, tags return, hidden preferences ${width}-${theme}`);
			await context.close();
		}
	}
	const page = await browser.newPage();
	await page.setContent(
		`<style>:root{--ink:#1d1d1f;--card:#fff}${fs.readFileSync(path.join(root, "design-system/components/bundle.css"), "utf8")}</style><div class="lightbox"><div class="float-bar glass"><button class="icon-button">x</button></div></div>`,
	);
	assert.equal(
		await page.locator("button").evaluate((n) => getComputedStyle(n).color),
		"rgb(29, 29, 31)",
	);
	console.log("PASS generated component CSS carries the photo theme in a light host");
	fs.writeFileSync(
		path.join(artifacts, "checks.json"),
		JSON.stringify({ results, generatedComponentDarkContext: true }, null, 2) + "\n",
	);
} finally {
	await browser.close();
	server.close();
}
