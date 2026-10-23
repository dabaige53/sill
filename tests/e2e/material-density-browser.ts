/** Real layout and reading checks; all cards and writes stay on an isolated localhost origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const load = createRequire(
	process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
		? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json")
		: import.meta.url,
);
const { chromium } = load("playwright");
const artifacts = path.join(root, "tests/artifacts/material-density");
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req, res) => {
	if (req.url !== "/index.html") {
		res.writeHead(404);
		res.end();
		return;
	}
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
	res.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
const results: any[] = [];
let browser: any;

async function run(
	name: string,
	viewport: { width: number; height: number },
	check: (page: any) => Promise<void>,
	options: any = {},
) {
	const context = await browser.newContext({ viewport, ...options });
	const page = await context.newPage();
	const errors: string[] = [];
	const external: string[] = [];
	page.on("pageerror", (error: Error) => errors.push(error.message));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	await context.route("**/*", (route: any) => {
		const url = route.request().url();
		if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
		external.push(url);
		return route.abort();
	});
	try {
		await page.clock.setFixedTime(new Date(reviewTime));
		await page.addInitScript((cards: any[]) => {
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards,
					items: {},
					preferences: {
						stack: false,
						archiveAfter: "never",
						floatTimely: false,
						sort: "time",
						theme: "light",
						density: "standard",
					},
				}),
			);
		}, materialDensityCards());
		await page.goto(origin + "/index.html");
		await page.waitForFunction(
			() => window.__app && document.querySelectorAll(".feed-card").length === 9,
		);
		await page.evaluate(async () => {
			await document.fonts.ready;
			await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
			window.__app.renderCurrent(false);
		});
		await check(page);
		assert.deepEqual(errors, []);
		assert.deepEqual(external, []);
		results.push({ name, status: "PASS" });
		console.log("PASS", name);
	} catch (error: any) {
		await page.screenshot({
			path: path.join(artifacts, `${name}-failure.png`),
			animations: "disabled",
		});
		results.push({ name, status: "FAIL", error: error.message });
		console.error("FAIL", name, error.stack || error.message);
	} finally {
		await context.close();
	}
}

async function geometry(page: any) {
	return page.locator(".feed-card").evaluateAll((nodes: HTMLElement[]) =>
		nodes.map((node) => {
			const r = node.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
		}),
	);
}
async function noOverflow(page: any, width: number) {
	const boxes = await geometry(page);
	assert.ok(
		boxes.every((box: any) => box.left >= 0 && box.right <= width),
		"cards leave the viewport",
	);
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i],
				b = boxes[j];
			assert.ok(
				a.right <= b.left + 1 ||
					b.right <= a.left + 1 ||
					a.bottom <= b.top + 1 ||
					b.bottom <= a.top + 1,
				"cards overlap",
			);
		}
	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		"horizontal page overflow",
	);
	return boxes;
}
const shot = async (page: any, name: string) => {
	// Screenshots finish CSS animation, but do not advance the separate toolbar show timer.
	await page.waitForFunction(
		() =>
			!document.querySelector(
				"#modal[open] .is-off, #modal[open] .is-drag, #modal[open] .float-bar.is-hidden",
			),
	);
	return page.screenshot({ path: path.join(artifacts, `${name}.png`), animations: "disabled" });
};

try {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	await run("desktop-content", { width: 1320, height: 900 }, async (page) => {
		const cards = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
		const boxes = await noOverflow(page, 1320);
		assert.equal(new Set(boxes.map((box: any) => Math.round(box.left))).size, 3);
		assert.ok(boxes.every((box: any) => box.width >= 340));
		const digest = page.locator('[data-card="review-digest"]');
		assert.match(await digest.innerText(), /本次关注可读性/);
		assert.equal(await digest.locator(".stats-trio").count(), 0);
		const task = page.locator('[data-card="review-task"]');
		assert.deepEqual(
			await task
				.locator(".check-item")
				.evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.extra)),
			["next-a", "next-b", "done-a"],
		);
		assert.equal(await task.locator(".task-count").innerText(), "3/5");
		await task.hover();
		assert.equal(
			await task
				.locator(".card-head-right")
				.evaluate((node: HTMLElement) => getComputedStyle(node).opacity),
			"1",
		);
		await page.mouse.move(2, 2);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), cards);
		await shot(page, "desktop-light");
		await page.evaluate(() => {
			window.__store.state.preferences.theme = "dark";
			window.__app.applyPreferences();
		});
		await shot(page, "desktop-dark");
	});
	await run("keyboard-task-preview", { width: 1320, height: 900 }, async (page) => {
		await page.evaluate(() => {
			window.__app.sort = "priority";
			window.__app.renderCurrent(false);
		});
		const cards = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
		const task = page.locator('[data-card="review-task"]');
		const previewIds = () =>
			task
				.locator('.checklist [data-action="task"]')
				.evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.extra));
		const focusedTask = () =>
			page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra);
		const assertFeed = async () => {
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				false,
			);
			assert.equal(await page.evaluate(() => location.hash), "#feed");
		};
		const digest = await page.locator('[data-card="review-digest"]').elementHandle();
		await task.locator('[data-action="task"][data-extra="next-a"]').focus();
		await page.keyboard.press("Space");
		assert.equal(await focusedTask(), "next-a", "completing a task moved focus to the card title");
		assert.equal(await task.locator(".task-count").innerText(), "4/5");
		assert.deepEqual(await previewIds(), ["next-a", "next-b", "done-a"]);
		assert.equal(
			await digest.evaluate((node: HTMLElement) => node.isConnected),
			true,
			"a task update unnecessarily replaced the digest",
		);
		await assertFeed();
		await page.keyboard.press("Space");
		assert.equal(await focusedTask(), "next-a");
		assert.equal(await task.locator(".task-count").innerText(), "3/5");
		await assertFeed();
		await page.keyboard.press("Space");
		await page.keyboard.press("Shift+Tab");
		assert.equal(
			await task
				.locator(".card-title-button")
				.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
		);
		await page.evaluate(() => window.__app.refreshCard("review-task"));
		assert.deepEqual(
			await previewIds(),
			["next-a", "next-b", "done-a"],
			"moving focus inside the card must retain the preview",
		);
		const outside = page.locator('[data-card="review-digest"] .card-title-button');
		await outside.focus();
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('[data-card="review-task"] .checklist [data-action="task"]')]
					.map((node: HTMLElement) => node.dataset.extra)
					.join() === "next-a,next-b,done-a",
		);
		assert.equal(
			await outside.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
		);
		await task.locator('[data-action="task"][data-extra="next-b"]').focus();
		const position = await task.evaluate((node: HTMLElement) =>
			[...node.parentElement.querySelectorAll("[data-card]")].indexOf(node),
		);
		await page.keyboard.press("Space");
		assert.equal(await focusedTask(), "next-b", "feed reordering lost the last task's focus");
		assert.equal(await task.locator(".task-count").innerText(), "5/5");
		assert.deepEqual(await previewIds(), ["next-a", "next-b", "done-a"]);
		assert.equal(await task.locator(".done-row").count(), 0);
		assert.equal(
			await task.evaluate((node: HTMLElement) =>
				[...node.parentElement.querySelectorAll("[data-card]")].indexOf(node),
			),
			position,
			"completion must retain the card position until refresh",
		);
		await assertFeed();
		await page.keyboard.press("Space");
		assert.equal(await focusedTask(), "next-b");
		assert.equal(await task.locator(".task-count").innerText(), "4/5");
		await assertFeed();
		await page.keyboard.press("Space");
		await outside.focus();
		await page.waitForFunction(
			() => document.querySelector('[data-card="review-task"] .task-count')?.textContent === "5/5",
		);
		assert.equal(await task.locator(".done-row").count(), 0);
		assert.equal(await task.locator(".check-item").count(), 3);
		assert.equal(
			await outside.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
		);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), cards);
		await task.locator(".card-title-button").click();
		assert.deepEqual(
			await page
				.locator('#modal .detail-task-list [data-action="task"]')
				.evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.extra)),
			["done-a", "done-b", "done-c", "next-a", "next-b"],
			"the detail must retain the complete stored task order",
		);
	});
	await run("pagination-keeps-card-focus", { width: 1320, height: 720 }, async (page) => {
		await page.evaluate(() => {
			window.__store.insert(
				Array.from({ length: 33 }, (_, index) => ({
					id: `pagination-${index}`,
					type: "article",
					title: `后续阅读 ${index + 1}`,
					summary: "用于验证真实滚动加载的合成卡片，新增内容应保留正在操作的卡片及其键盘焦点。",
					time: Date.now() - (index + 10) * 3600000,
				})),
			);
			window.__app.renderCurrent(false);
		});
		assert.equal(await page.locator(".feed-card").count(), 40);
		const title = page.locator('[data-card="review-note"] .card-title-button');
		await title.focus();
		await page.mouse.wheel(0, 3000);
		await page.waitForFunction(() => document.querySelectorAll(".feed-card").length === 42);
		assert.equal(await page.evaluate(() => window.__app.pageLimit), 80);
		assert.equal(
			await title.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
			"loading the next page lost the existing card title's focus",
		);
		assert.ok(await page.evaluate(() => scrollY > 0), "restoring focus jumped back to the card");
		await page.evaluate(() => {
			window.scrollTo({ top: 0, behavior: "instant" });
			window.__app.pageLimit = 40;
			window.__app.renderCurrent(false);
		});
		await page.waitForFunction(
			() => scrollY === 0 && document.querySelectorAll(".feed-card").length === 40,
		);
		const task = page.locator('[data-card="review-task"]');
		await task.locator('[data-action="task"][data-extra="next-a"]').focus();
		await page.keyboard.press("Space");
		assert.equal(await task.locator(".task-count").innerText(), "4/5");
		await page.mouse.wheel(0, 3000);
		await page.waitForFunction(() => document.querySelectorAll(".feed-card").length === 42);
		assert.equal(await page.evaluate(() => window.__app.pageLimit), 80);
		assert.deepEqual(
			await page.evaluate(() => {
				const active = document.activeElement as HTMLElement;
				return [active.dataset.action, active.dataset.id, active.dataset.extra];
			}),
			["task", "review-task", "next-a"],
			"pagination moved focus to a different task or card",
		);
		assert.deepEqual(
			await task
				.locator('.checklist [data-action="task"]')
				.evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.extra)),
			["next-a", "next-b", "done-a"],
			"pagination discarded the held keyboard preview",
		);
		assert.ok(await page.evaluate(() => scrollY > 0), "restoring the task jumped the page");
		await page.keyboard.press("Space");
		assert.equal(await task.locator(".task-count").innerText(), "3/5");
		assert.equal(
			await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
			false,
		);
		await page.keyboard.press("Space");
		await title.focus();
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('[data-card="review-task"] .checklist [data-action="task"]')]
					.map((node: HTMLElement) => node.dataset.extra)
					.join() === "next-a,next-b,done-a",
		);
	});
	await run("compact-density", { width: 1720, height: 900 }, async (page) => {
		await page.evaluate(() => {
			window.__store.state.preferences.density = "compact";
			window.__app.applyPreferences();
			window.__app.renderCurrent(false);
		});
		const boxes = await noOverflow(page, 1720);
		assert.equal(new Set(boxes.map((box: any) => Math.round(box.left))).size, 5);
		assert.equal(
			await page
				.locator('[data-card="review-note"] .card-summary')
				.evaluate((node: HTMLElement) => getComputedStyle(node).webkitLineClamp),
			"none",
		);
	});
	for (const width of [390, 320])
		await run(
			`phone-${width}`,
			{ width, height: 844 },
			async (page) => {
				const boxes = await noOverflow(page, width);
				assert.equal(new Set(boxes.map((box: any) => Math.round(box.left))).size, 1);
				if (width === 390) await shot(page, "phone-feed");
				await page.locator('[data-card="review-digest"] .card-title-button').click();
				await page.waitForFunction(() => window.__app.modalKind === "preview");
				const points = await page
					.locator("#modal .markdown p")
					.evaluateAll((nodes: HTMLElement[]) =>
						nodes.map((node) => ({
							text: node.textContent,
							whiteSpace: getComputedStyle(node).whiteSpace,
							width: node.clientWidth,
							scroll: node.scrollWidth,
						})),
					);
				assert.equal(points.length, 2);
				assert.ok(
					points.every(
						(point: any) =>
							["normal", "pre-wrap"].includes(point.whiteSpace) && point.scroll <= point.width + 1,
					),
					JSON.stringify(points),
				);
				assert.match(await page.locator("#modal").innerText(), /摘要范围仅限本次产品评审/);
				assert.equal(await page.locator('#modal [data-action="agent-handoff"]').count(), 0);
				assert.ok(
					await page
						.locator("#modal .sheet-scroll")
						.evaluate((node: HTMLElement) => node.scrollWidth <= node.clientWidth),
				);
				if (width === 390) await shot(page, "phone-detail");
				await page.locator("#modal .sheet-scroll").evaluate((node: HTMLElement) => {
					node.scrollTop = node.scrollHeight;
				});
				await page.waitForFunction(() => {
					const node = document.querySelector<HTMLElement>("#modal .sheet-scroll");
					return node && node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
				});
				if (width === 390) await shot(page, "phone-detail-end");
				await page.keyboard.press("Escape");
				await page.waitForFunction(
					() => !(document.getElementById("modal") as HTMLDialogElement).open,
				);
				await page.locator('[data-card="review-task"] .card-title-button').click();
				await page.waitForFunction(() => window.__app.modalKind === "preview");
				const taskText = page.locator(
					'#modal [data-action="task"][data-extra="next-a"] > span:last-child',
				);
				assert.ok(
					await taskText.evaluate(
						(node: HTMLElement) =>
							getComputedStyle(node).whiteSpace === "normal" &&
							node.scrollWidth <= node.clientWidth + 1,
					),
					"detail task text is truncated",
				);
				assert.equal(
					await page.locator("#modal .check-item").count(),
					5,
					"detail preserves the complete task list",
				);
			},
			{ isMobile: true, hasTouch: true },
		);
	if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
} finally {
	fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2) + "\n");
	if (browser) await browser.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
