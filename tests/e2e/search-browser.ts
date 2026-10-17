/** Real keyboard/touch and CSS cascade checks with synthetic cards on an isolated origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const load = createRequire(
	process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
		? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json")
		: import.meta.url,
);
const { chromium } = load("playwright");
const artifacts = path.join(root, "tests/artifacts");
const server = http.createServer((request, response) => {
	if (request.url !== "/index.html") {
		response.writeHead(404);
		response.end();
		return;
	}
	response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	response.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
// Synthetic content only; no production account or private card data.
const cards: any[] = Array.from({ length: 38 }, (_, index) => ({
	id: `motion-${index}`,
	type: "article",
	title: `阅读卡片 ${index + 1}`,
	summary: "保持简洁的摘要，点开查看完整正文。",
	body: Array(30).fill("这段合成正文用于验证手势取消、工具条和键盘导航，不包含个人资料。"),
	time: Date.now() - index * 3600000,
}));
Object.assign(cards[0], {
	title: "一个很长的标题用来检查小屏幕上文字与关闭按钮不会互相遮挡",
	sources: [{ kind: "readwise", name: "Reader 来源名称很长时仍保持头部整洁" }],
	meta: "来源中的长备注保留在详情中，不挤在头部。",
	tags: ["界面布局", "长标签检查"],
	published_at: "2026-10-01",
	created_at: "2026-10-16T01:00:00Z",
});
cards.push(
	{
		id: "short-task",
		type: "task",
		title: "短任务",
		summary: "只有一小段。",
		tasks: [{ id: "one", text: "核对清单" }],
		tags: ["测试"],
		time: Date.now(),
	},
	{
		id: "motion-digest",
		type: "digest",
		title: "正文末尾的交接动作",
		summary: "这张摘要没有悬浮操作栏，末尾操作应该完整可见。",
		body: Array(12).fill("这段合成摘要用于验证阅读到底部之后，完整正文和交接动作仍然清晰。"),
		time: Date.now() - 7200000,
	},
	{
		id: "motion-photo",
		type: "photo",
		title: "照片详情",
		summary: "独立网页只展示照片，不提供复制给助手功能。",
		image: "architecture",
		photos: ["architecture", "architecture"],
		time: Date.now() - 10800000,
	},
);
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const results: { name: string; status: string; error?: string }[] = [];
let browser: any;

async function touch(session: any, type: string, x = 200, y = 300) {
	await session.send("Input.dispatchTouchEvent", {
		type,
		touchPoints: type === "touchCancel" || type === "touchEnd" ? [] : [{ x, y, id: 1 }],
	});
}

try {
	fs.mkdirSync(artifacts, { recursive: true });
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	});
	async function scenario(
		name: string,
		run: (page: any, context: any) => Promise<void>,
		options = {},
	) {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 900 },
			...options,
		});
		const page = await context.newPage(),
			errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (error: Error) => errors.push(error.message));
		await context.route("**/*", (route: any) => {
			const url = route.request().url();
			if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
			external.push(url);
			return route.abort();
		});
		await context.addInitScript((cards: any[]) => {
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards,
					items: {},
					preferences: { onboarded: true, stack: false },
				}),
			);
		}, cards);
		try {
			await page.goto(`${origin}/index.html`);
			await page.waitForFunction(
				() =>
					window.__app &&
					window.__app.layout.frame === 0 &&
					document.documentElement.scrollHeight > 1200,
			);
			await run(page, context);
			assert.deepEqual(errors, []);
			assert.deepEqual(external, []);
			results.push({ name, status: "PASS" });
			console.log("PASS", name);
		} catch (error: any) {
			results.push({ name, status: "FAIL", error: error.message });
			await page.screenshot({
				path: path.join(artifacts, `drawer-failure-${results.length}.png`),
			});
			console.error("FAIL", name, error.stack || error.message);
		} finally {
			await context.close();
		}
	}

	for (const width of [390, 1280]) {
		await scenario(
			`search and home remain independent at ${width}px`,
			async (page) => {
				await page.evaluate(() => window.scrollTo(0, 600));
				await page.waitForTimeout(100);
				const home = await page.evaluate(() => ({
					y: scrollY,
					ids: [...document.querySelectorAll("#feed-grid [data-card]")].map(
						(n: HTMLElement) => n.dataset.card,
					),
				}));
				await page.keyboard.press("Control+k");
				await page.locator("#filter-search").fill("阅读");
				await page.waitForFunction(
					() =>
						window.__app.searchFilter.query === "阅读" &&
						document.querySelectorAll("#search-results .feed-card").length === 38,
					undefined,
					{ timeout: 3000 },
				);
				assert.equal(await page.locator("#search-results .feed-card").count(), 38);
				assert.deepEqual(
					await page.evaluate(() =>
						[...document.querySelectorAll("#feed-grid [data-card]")].map(
							(n: HTMLElement) => n.dataset.card,
						),
					),
					home.ids,
				);
				await page.locator('[data-action="filter-type"][data-extra="task"]').click();
				assert.equal(await page.locator("#search-results .feed-card").count(), 0);
				await page.locator('[data-action="filter-type"][data-extra="all"]').click();
				await page.evaluate(() => (document.getElementById("search-results").scrollTop = 650));
				await page.waitForTimeout(80);
				const target = page.locator('#search-results [data-card="motion-12"] .card-title-button');
				await target.scrollIntoViewIfNeeded();
				const searchY = await page.locator("#search-results").evaluate((n) => n.scrollTop);
				await target.click();
				await page.waitForSelector("#modal.preview[open]");
				await page.screenshot({ path: path.join(artifacts, `search-drawer-${width}.png`) });
				assert.equal(await page.locator("#search-background[open] .feed-card").count(), 38);
				assert.equal(await page.locator("#search-background #filter-search").inputValue(), "阅读");
				assert.equal(
					await page.locator("#search-background #search-results").evaluate((n) => n.scrollTop),
					searchY,
				);
				await page.keyboard.press("Escape");
				await page.waitForSelector("#modal.search[open]");
				assert.equal(await page.locator("#filter-search").inputValue(), "阅读");
				assert.equal(await page.locator("#search-results").evaluate((n) => n.scrollTop), searchY);
				assert.equal(await page.locator("#search-background").count(), 0);
				await page.goForward();
				await page.waitForSelector("#modal.preview[open]");
				await page.goBack();
				await page.waitForSelector("#modal.search[open]");
				assert.equal(await page.locator("#search-results").evaluate((n) => n.scrollTop), searchY);
				await page.locator('.search-header > [data-action="close"]').click();
				await page.waitForTimeout(150);
				assert.equal(await page.evaluate(() => scrollY), home.y);
				assert.deepEqual(
					await page.evaluate(() =>
						[...document.querySelectorAll("#feed-grid [data-card]")].map(
							(n: HTMLElement) => n.dataset.card,
						),
					),
					home.ids,
				);
				await page.keyboard.press("Control+k");
				await page.waitForSelector("#modal.search[open]");
				assert.equal(await page.locator("#filter-search").inputValue(), "阅读");
				assert.equal(await page.locator("#search-results").evaluate((n) => n.scrollTop), searchY);
				await page.screenshot({ path: path.join(artifacts, `search-${width}.png`) });
			},
			{
				viewport: { width, height: 844 },
				...(width < 650 ? { hasTouch: true, isMobile: true } : {}),
			},
		);
	}
} finally {
	await browser?.close();
	server.close();
	fs.writeFileSync(path.join(artifacts, "search-browser.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
