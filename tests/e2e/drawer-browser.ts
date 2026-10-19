/** Real keyboard/touch and CSS cascade checks with synthetic cards on an isolated origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { runDetailGestures } from "./drawer-browser-detail-gestures.ts";
import { runRailMaterial } from "./drawer-browser-rail-material.ts";

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
	tags: ["界面布局", "长标签检查"],
	published_at: "2026-10-01",
	created_at: "2026-10-16T01:00:00Z",
});
cards.push(
	{
		id: "motion-mail",
		type: "mail",
		title: "这周的方案，只差最后一个决定",
		sender: "林舟",
		meta: "14:32",
		attachment: "方案对比.txt",
		tags: ["工作", "设计"],
		body: [
			"三种方向已经整理好了。比起增加功能，我们更想先确认什么应该留下。",
			"附件里是三版对比，第二版我比较倾向，但想听听你的判断。",
			"周四之前给我回个话就行。",
		],
		time: Date.now(),
	},
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
		// Linux CI needs software rendering; forcing SwiftShader on macOS can stall animations.
		args:
			process.platform === "linux"
				? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
				: [],
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
	await runRailMaterial({ artifacts, phone, scenario, touch });

	await runDetailGestures({ phone, scenario, touch });
} finally {
	await browser?.close();
	server.close();
	fs.writeFileSync(path.join(artifacts, "drawer-browser.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
