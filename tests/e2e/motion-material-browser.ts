/** Real keyboard/touch and CSS cascade checks with synthetic cards on an isolated origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { runGestureInterruption } from "./motion-material-browser-gesture-interruption.ts";
import { runMaterialFocus } from "./motion-material-browser-material-focus.ts";

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
// Stay within the first 40-card page so this suite isolates chrome and detail interactions.
const cards: any[] = Array.from({ length: 38 }, (_, index) => ({
	id: `motion-${index}`,
	type: "article",
	title: `阅读卡片 ${index + 1}`,
	summary: "保持简洁的摘要，点开查看完整正文。",
	body: Array(30)
		.fill("这段合成正文用于验证手势取消、工具条和键盘导航，不包含个人资料。")
		.join("\n\n"),
	time: Date.now() - index * 3600000,
}));
cards.push(
	{
		id: "motion-digest",
		type: "digest",
		title: "正文末尾的交接动作",
		summary: "这张摘要没有悬浮操作栏，末尾操作应该完整可见。",
		body: Array(12)
			.fill("这段合成摘要用于验证阅读到底部之后，完整正文和交接动作仍然清晰。")
			.join("\n\n"),
		time: Date.now() - 7200000,
	},
	{
		id: "motion-photo",
		type: "photo",
		title: "照片详情",
		summary: "独立网页只展示照片，不提供复制给助手功能。",
		images: ["architecture", "architecture"],
		time: Date.now() - 10800000,
	},
);
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const results: { name: string; status: string; error?: string }[] = [];
let browser: any;

async function openSelection(page: any) {
	await page.evaluate(() => {
		window.__app.select("motion-0", { add: true });
		window.__app.select("motion-1", { add: true });
	});
}
async function material(page: any) {
	return page.evaluate(() => {
		const menu = document.querySelector("#selection-bar"),
			style = getComputedStyle(menu),
			lens = getComputedStyle(document.querySelector(".nav-lens"));
		return {
			background: style.backgroundColor,
			blur: style.backdropFilter,
			shadow: style.boxShadow,
			lensBackground: lens.backgroundColor,
			lensShadow: lens.boxShadow,
		};
	});
}
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
				path: path.join(artifacts, `motion-material-failure-${results.length}.png`),
			});
			console.error("FAIL", name, error.message);
		} finally {
			await context.close();
		}
	}
	await runMaterialFocus({ material, openSelection, phone, scenario, touch });

	await runGestureInterruption({ phone, scenario });
} finally {
	await browser?.close();
	server.close();
	fs.writeFileSync(
		path.join(artifacts, "motion-material-browser.json"),
		JSON.stringify(results, null, 2),
	);
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
