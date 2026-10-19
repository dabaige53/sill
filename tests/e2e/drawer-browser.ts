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

	await scenario(
		"rail notices fade and survive interrupted dismissal",
		async (page) => {
			// Sample the real animation at its midpoint, independently of CI scheduling.
			const entering = await page.evaluate(() => {
				window.__app.setOffline(true);
				const notice = document.getElementById("offline");
				const animation = notice.getAnimations()[0];
				if (!animation) return { active: false, opacity: Number(getComputedStyle(notice).opacity) };
				animation.pause();
				animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
				return { active: true, opacity: Number(getComputedStyle(notice).opacity) };
			});
			assert.equal(entering.active, true, "notice has a real entrance animation");
			assert.ok(entering.opacity > 0 && entering.opacity < 1, JSON.stringify(entering));
			await page.evaluate(() => window.__app.setOffline(false));
			assert.equal(
				await page.locator("#offline").evaluate((n: HTMLElement) => n.inert),
				true,
				"offline disables input immediately",
			);
			await page.evaluate(() => window.__app.setOffline(true));
			await page.waitForTimeout(300);
			assert.equal(await page.locator("#offline").evaluate((n: HTMLElement) => n.hidden), false);
			await page.evaluate(() => window.__app.setOffline(false));
			await page.waitForFunction(() => document.getElementById("offline").hidden, null, {
				timeout: 3000,
			});
			assert.equal(
				await page.locator("#offline").evaluate((n: HTMLElement) => n.hidden),
				true,
				"offline hides after exit completes",
			);
			await page.evaluate(() => {
				window.__app.pendingCards = [{ id: "synthetic-pending" }];
				window.__app.paintPending();
			});
			await page.waitForTimeout(250);
			assert.equal(await page.locator("#new-count").evaluate((n: HTMLElement) => n.hidden), false);
			await page.evaluate(() => {
				window.__app.pendingCards = [];
				window.__app.paintPending();
			});
			assert.equal(
				await page.locator("#new-count").evaluate((n: HTMLElement) => n.inert),
				true,
				"pending notice disables input immediately",
			);
			await page.waitForFunction(() => document.getElementById("new-count").hidden, null, {
				timeout: 3000,
			});
			assert.equal(
				await page.locator("#new-count").evaluate((n: HTMLElement) => n.hidden),
				true,
				"pending notice hides after exit completes",
			);
		},
		phone,
	);

	await scenario(
		"capsule fades during scrolling, pause and interruption",
		async (page) => {
			const dock = page.locator("#dock");
			await page.evaluate(() => {
				window.scrollTo(0, 400);
			});
			await page.waitForFunction(() =>
				document.querySelector("#dock").classList.contains("is-tucked"),
			);
			await page.waitForTimeout(70);
			const fading = await dock.evaluate((n: HTMLElement) => ({
				opacity: Number(getComputedStyle(n).opacity),
				inert: n.inert,
			}));
			assert.ok(fading.opacity > 0 && fading.opacity < 1);
			assert.equal(fading.inert, true);
			assert.equal(
				await page
					.locator("#account")
					.evaluate((n: HTMLElement) => getComputedStyle(n).pointerEvents),
				"none",
			);
			await page.waitForFunction(
				() => !document.querySelector("#dock").classList.contains("is-tucked"),
			);
			await page.waitForTimeout(70);
			const returning = await dock.evaluate((n: HTMLElement) =>
				Number(getComputedStyle(n).opacity),
			);
			assert.ok(returning > 0 && returning < 1);
			await page.waitForTimeout(450);
			assert.equal(await dock.evaluate((n: HTMLElement) => getComputedStyle(n).opacity), "1");
			await page.locator('[data-extra="search"]').click();
			await page.waitForFunction(() => window.__app.modalKind === "search");
			assert.equal(
				await page
					.locator("#account")
					.evaluate((n: HTMLElement) => getComputedStyle(n).pointerEvents),
				"none",
			);
		},
		phone,
	);

	for (const colorScheme of ["light", "dark"]) {
		await scenario(
			`Sill settings icon: ${colorScheme}`,
			async (page) => {
				const settings = page.locator("#account");
				assert.equal(await settings.getAttribute("aria-label"), "设置");
				assert.equal(await settings.locator(".account-face,.nav-label,img").count(), 0);
				assert.equal(await settings.locator(".account-wrap > .icon path").count(), 1);
				const size = await settings.boundingBox();
				assert.ok(size.width >= 44 && size.height >= 44);
				// Read inherited currentColor and its parent in the same animation frame.
				const colors = await settings.evaluate((n: HTMLElement) => ({
					stroke: getComputedStyle(n.querySelector(".account-wrap > .icon")).stroke,
					color: getComputedStyle(n).color,
				}));
				assert.equal(colors.stroke, colors.color);
				await settings.focus();
				await page.keyboard.press("Enter");
				await page.waitForFunction(() => window.__app.modalKind === "settings");
				assert.equal(await settings.getAttribute("aria-current"), "page");
			},
			{ ...phone, colorScheme },
		);
	}

	for (const width of [320, 390, 1280]) {
		await scenario(
			`Layout stays inside ${width}px with long titles, tags and dates`,
			async (page) => {
				await page.evaluate(() => window.__app.openCard("motion-0"));
				await page.waitForTimeout(500);
				const dimensions = await page
					.locator(".sheet-scroll")
					.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
				assert.ok(dimensions.scroll <= dimensions.client + 1);
				assert.equal(
					await page.locator("#modal-title + .preview-tags + .preview-details").count(),
					1,
				);
				await page.screenshot({ path: path.join(artifacts, `drawer-layout-${width}.png`) });
			},
			{ viewport: { width, height: 844 }, colorScheme: width === 320 ? "dark" : "light" },
		);
	}

	await scenario(
		"Phone short drawers fit content; long articles cap and expand while reading",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			const short = await page.locator(".preview-sheet").boundingBox();
			assert.ok(short.height < 650, JSON.stringify(short));
			assert.ok(Math.abs(short.y + short.height - 844) <= 2);
			assert.equal(await page.locator("#modal-title + .preview-tags").count(), 1);
			await page.screenshot({ path: path.join(artifacts, "drawer-short-phone.png") });
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(500);
			const long = await page.locator(".preview-sheet").boundingBox();
			assert.ok(long.height <= 781 && long.height > 700, JSON.stringify(long));
			await page.locator(".sheet-scroll").evaluate((node) => {
				node.scrollTop = 120;
			});
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			const full = await page.locator(".preview-sheet").boundingBox();
			assert.ok(full.height >= 840, JSON.stringify(full));
			await page.screenshot({ path: path.join(artifacts, "drawer-long-phone.png") });
		},
		phone,
	);
	await scenario(
		"Preview edge resistance stays bounded and restores the locked background",
		async (page, context) => {
			await page.evaluate(() => {
				window.scrollTo({ top: 500, behavior: "instant" });
			});
			await page.waitForTimeout(50);
			const before = await page.evaluate(() => scrollY);
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			assert.equal(await page.locator("body.modal-scroll-locked").count(), 1);
			const session = await context.newCDPSession(page);
			const box = await page.locator(".sheet-scroll").boundingBox();
			const y = box.y + 150;
			await touch(session, "touchStart", 180, y);
			await touch(session, "touchMove", 180, y + 55);
			await page.waitForTimeout(40);
			const offset = await page
				.locator(".sheet-scroll")
				.evaluate((node) => parseFloat(node.style.translate.split(" ")[1]) || 0);
			assert.ok(offset > 0 && offset <= 14, String(offset));
			await touch(session, "touchCancel");
			await page.waitForTimeout(260);
			assert.equal(
				await page.locator(".sheet-scroll").evaluate((node) => node.style.translate),
				"",
			);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			await page.evaluate(() => window.__app.closeNative());
			await page.waitForTimeout(450);
			assert.equal(await page.locator("body.modal-scroll-locked").count(), 0);
			assert.equal(await page.evaluate(() => scrollY), before);
		},
		phone,
	);
	await scenario(
		"Handle drags up to expand, down to collapse, and cancels without changing state",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			const session = await context.newCDPSession(page);
			const handle = page.locator(".sheet-handle");
			let box = await handle.boundingBox();
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y - 90);
			await touch(session, "touchEnd");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			box = await handle.boundingBox();
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y + 100);
			await touch(session, "touchCancel");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y + 100);
			await touch(session, "touchEnd");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 0);
			assert.ok((await page.locator(".preview-sheet").boundingBox()).height < 650);
			// The close disc centres on the source row above the title (ADR 0037).
			const alignment = await page.evaluate(() => {
				const row = document.querySelector(".preview-body > .preview-meta");
				const close = document.querySelector('.sheet-head [data-action="close"]');
				const r = row.getBoundingClientRect();
				return Math.abs(close.getBoundingClientRect().top + 22 - r.top - r.height / 2);
			});
			assert.ok(alignment < 3, String(alignment));
			assert.equal(
				await page
					.locator(".sheet-scroll")
					.evaluate((node) => getComputedStyle(node).scrollbarWidth),
				"none",
			);
		},
		phone,
	);

	await scenario(
		"PWA has no maximize button; reduced motion opens and closes without travel",
		async (page) => {
			await page.evaluate(() => Object.defineProperty(navigator, "standalone", { value: true }));
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(100);
			assert.equal(await page.locator('.sheet-head [data-action="reader"]').count(), 0);
			const frames = await page
				.locator("#modal")
				.evaluate((node) =>
					node
						.getAnimations({ subtree: true })
						.flatMap((animation) => animation.effect?.getKeyframes() || []),
				);
			assert.ok(frames.every((frame) => !frame.transform || frame.transform === "none"));
			await page.evaluate(() => window.__app.closeNative());
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
				null,
				{ timeout: 1000 },
			);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), false);
		},
		{ ...phone, reducedMotion: "reduce" },
	);
} finally {
	await browser?.close();
	server.close();
	fs.writeFileSync(path.join(artifacts, "drawer-browser.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
