/** Shared home filters: desktop placement, phone behavior and search isolation, using synthetic cards. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/home-tabs");
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
	{ width: 1440, theme: "light" },
	{ width: 1440, theme: "dark" },
	{ width: 1920, theme: "light" },
	{ width: 320, theme: "light" },
	{ width: 320, theme: "dark" },
	{ width: 390, theme: "light" },
	{ width: 390, theme: "dark" },
] as const;
try {
	for (const { width, theme } of cases) {
		const context = await browser.newContext({
			viewport: { width, height: width > 650 ? 1000 : 844 },
			colorScheme: theme,
			hasTouch: width <= 650,
			isMobile: width <= 650,
			locale: "zh-CN",
		});
		const page = await context.newPage(),
			errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
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
						items: {
							"review-note": { read: true },
							"review-article": { bookmarked: true, later: true },
						},
						preferences: {
							onboarded: true,
							stack: false,
							theme,
							archiveAfter: "never",
							floatTimely: false,
						},
					}),
				);
			},
			{ cards: materialDensityCards(), theme },
		);
		await page.goto(origin);
		await page.waitForFunction(() => window.__app?.layout.frame === 0);
		const head = page.locator("#home-top");
		assert.equal(await head.isVisible(), true);
		assert.equal(await head.locator(".home-mark").innerText(), "Sill");
		assert.deepEqual(await page.locator("#nav .nav-label").allTextContents(), [
			"主页",
			"AI",
			"搜索",
		]);
		for (const label of await page.locator("#nav .nav-label").all()) {
			assert.equal(await label.isVisible(), true);
		}
		assert.deepEqual(await head.locator(".home-tab").allTextContents(), [
			"全部",
			"未读",
			"待办",
			"稍后读",
			"收藏",
		]);
		const geometry = await head.evaluate((n) => {
			const r = n.getBoundingClientRect(),
				grid = document.getElementById("feed-grid").getBoundingClientRect();
			return {
				left: r.left,
				width: r.width,
				bottom: r.bottom,
				gridLeft: document.querySelector("#feed-grid .feed-item").getBoundingClientRect().left,
				gridTop: grid.top,
				mark: getComputedStyle(n.querySelector(".home-mark")).display,
				position: getComputedStyle(n).position,
			};
		});
		if (width > 650) {
			assert.ok(geometry.width <= width);
			assert.equal(geometry.left, geometry.gridLeft);
			assert.equal(geometry.gridTop - geometry.bottom, 16);
			assert.notEqual(geometry.mark, "none");
			assert.equal(geometry.position, "sticky");
		} else {
			assert.equal(geometry.position, "fixed");
			assert.notEqual(geometry.mark, "none");
		}
		await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
		await page.waitForTimeout(1000);
		assert.ok(
			await head.evaluate((n) => {
				const r = n.getBoundingClientRect();
				return (
					r.top >= 0 &&
					r.bottom < innerHeight &&
					!(n as HTMLElement).inert &&
					getComputedStyle(n).opacity !== "0"
				);
			}),
			"home tabs return after scrolling pauses",
		);
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
		const source = await page.evaluate(() => JSON.stringify(window.__store.state.cards));
		await page.evaluate(() => {
			window.__app.searchFilter = { type: "note", status: "all", tag: "", query: "密度" };
		});
		const search = await page.evaluate(() => ({ ...window.__app.searchFilter }));
		const views: Record<string, string[]> = {};
		for (const key of ["unread", "todo", "later", "saved", "all"]) {
			const tab = head.locator(`[data-extra="${key}"]`);
			await tab.click();
			await page.waitForFunction(() => window.__app.layout.frame === 0);
			assert.equal(await tab.getAttribute("aria-pressed"), "true");
			assert.equal(await head.locator('[aria-pressed="true"]').count(), 1);
			assert.deepEqual(await page.evaluate(() => ({ ...window.__app.searchFilter })), search);
			views[key] = await page
				.locator("#feed-grid [data-card]")
				.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")).sort());
		}
		assert.ok(!views.unread.includes("review-note") && views.unread.includes("review-article"));
		assert.deepEqual(views.todo, ["review-reminder", "review-task"]);
		assert.deepEqual(views.saved, ["review-article"]);
		assert.deepEqual(views.later, ["review-article"]);
		assert.equal(views.all.length, materialDensityCards().length);
		assert.equal(await page.evaluate(() => JSON.stringify(window.__store.state.cards)), source);
		await page.locator('#nav [data-extra="search"]').click();
		await page.locator("#filter-search").waitFor();
		assert.equal(await page.locator("#filter-search").inputValue(), "密度");
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !document.getElementById("modal").hasAttribute("open"));
		assert.equal(await head.locator('[data-extra="all"]').getAttribute("aria-pressed"), "true");

		await page.evaluate(() => {
			window.__app.sort = "priority";
		});
		await head.locator('[data-extra="unread"]').click();
		await page.waitForTimeout(400);
		const positions = () =>
			page.locator("#feed-grid [data-card]").evaluateAll((nodes) =>
				nodes.map((n) => {
					const r = n.getBoundingClientRect();
					return {
						id: n.getAttribute("data-card"),
						x: r.x + scrollX,
						y: r.y + scrollY,
						w: r.width,
						h: r.height,
					};
				}),
			);
		const beforeDone = await positions();
		await page.evaluate(() => {
			window.__store.patch("review-article", { read: true, progress: 1 });
			window.__app.refreshCard("review-article");
			window.__app.changeReminder("review-reminder", "complete-reminder");
			window.__app.toggleTask("review-task", "next-a");
			window.__app.toggleTask("review-task", "next-b");
		});
		await page.waitForTimeout(450);
		assert.deepEqual(
			await positions(),
			beforeDone,
			"done updates must retain membership, order and card rectangles",
		);
		assert.equal(
			await page
				.locator('[data-card="review-reminder"]')
				.evaluate((n) => n.classList.contains("is-complete")),
			true,
		);
		await head.locator('[data-extra="all"]').click();
		await head.locator('[data-extra="unread"]').click();
		assert.equal(
			await page.locator('#feed-grid [data-card="review-article"]').count(),
			0,
			"explicit tab change applies latest filter",
		);
		await head.locator('[data-extra="all"]').click();
		{
			await page.evaluate(() => {
				const seed = window.__store.state.cards.find((card) => card.type === "article");
				window.__store.state.cards.push(
					...Array.from({ length: 45 }, (_, i) => ({ ...seed, id: "scroll-fixture-" + i })),
				);
				window.__app.renderCurrent(false);
				window.scrollTo(0, 500);
			});
			await page.waitForFunction(() => scrollY === 500);
			await page.waitForTimeout(1000);
			assert.equal(await head.evaluate((node) => node.getBoundingClientRect().top), 0);
			await head.locator('[data-extra="todo"]').click();
			assert.equal(await page.evaluate(() => scrollY), 0);
			await page.evaluate(() => {
				const frames: { opacity: number; visible: boolean; tucked: boolean }[][] = [];
				const until = performance.now() + 1000;
				(window as any).navigationFrames = frames;
				const sample = () => {
					frames.push(
						["home-top", "dock"].map((id) => {
							const node = document.getElementById(id),
								style = getComputedStyle(node);
							return {
								opacity: Number(style.opacity),
								visible: style.visibility === "visible",
								tucked: node.classList.contains("is-tucked"),
							};
						}),
					);
					if (performance.now() < until) requestAnimationFrame(sample);
				};
				sample();
			});
			await head.locator('[data-extra="all"]').click();
			assert.equal(await page.evaluate(() => scrollY), 500);
			await page.waitForTimeout(1050);
			const frames = await page.evaluate(() => (window as any).navigationFrames);
			assert.ok(frames.length > 10);
			assert.ok(
				frames.flat().every((frame) => frame.opacity === 1 && frame.visible && !frame.tucked),
				"restoring an offscreen reading position never hides or fades the navigation",
			);
			await head.locator('[data-extra="all"]').click();
			assert.equal(await page.evaluate(() => scrollY), 500);
			await page.locator('#nav [data-extra="search"]').click();
			assert.equal(
				await page.locator("#modal").evaluate((node) => getComputedStyle(node).opacity),
				"1",
			);
			assert.equal(
				await page.locator("#modal").evaluate((node) => node.getAnimations().length),
				0,
				"pointer navigation never fades the page over the feed",
			);
			await page.locator('#modal .search-header > [data-action="close"]').click();
			assert.equal(
				await page.locator('#nav [aria-current="page"]').getAttribute("data-extra"),
				"home",
			);
			assert.equal(await page.evaluate(() => scrollY), 500);
			if (width < 650) {
				await page.locator('#nav [data-extra="ai"]').tap();
				assert.equal(
					await page.locator("#modal").evaluate((node) => getComputedStyle(node).opacity),
					"1",
				);
				assert.equal(
					await page
						.locator("#modal")
						.evaluate((node) => node.getAnimations({ subtree: true }).length),
					0,
				);
				assert.equal(
					await page.locator("#dock").evaluate((node) => getComputedStyle(node).opacity),
					"1",
				);
				await page.locator('#nav [data-extra="home"]').tap();
				assert.equal(
					await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
					false,
				);
				assert.equal(await page.evaluate(() => scrollY), 500);
				await page.locator("#account").tap();
				await page.waitForFunction(() => window.__app.modalKind === "settings");
				assert.equal(
					await page.locator("#modal").evaluate((node) => getComputedStyle(node).opacity),
					"1",
				);
				assert.equal(
					await page
						.locator("#modal")
						.evaluate((node) => node.getAnimations({ subtree: true }).length),
					0,
				);
				await page.keyboard.press("Escape");
				await page.waitForFunction(
					() => !(document.getElementById("modal") as HTMLDialogElement).open,
				);
				assert.equal(await page.evaluate(() => document.activeElement.id), "account");
				assert.equal(await head.evaluate((node) => getComputedStyle(node).opacity), "1");
			}
		}
		if (width === 1920) {
			await page.keyboard.press("ControlOrMeta+k");
			assert.equal(
				await page.locator("#filter-search").evaluate((node) => node === document.activeElement),
				true,
			);
			assert.equal(await page.locator("#modal").evaluate((node) => node.getAnimations().length), 0);
			await page.keyboard.press("Escape");
			await page.clock.install();
			await page.evaluate(() => window.__app.toast("Synthetic undo", () => {}));
			await page.clock.runFor(2000);
			await page.locator("#toast").hover();
			await page.clock.runFor(6000);
			assert.equal(await page.locator("#toast").isVisible(), true);
			await page.mouse.move(0, 0);
			await page.clock.runFor(4000);
			await page.locator("#toast").waitFor({ state: "hidden" });
			await page.evaluate(() => window.scrollTo(0, 0));
		}
		await page.screenshot({ path: path.join(artifacts, width + "-" + theme + ".png") });
		assert.deepEqual(errors, []);
		assert.deepEqual(external, []);
		results.push({
			width,
			theme,
			geometry,
			views,
			searchUnchanged: true,
			sourceCardsUnchanged: true,
			errors,
			external,
		});
		console.log(`PASS shared home filters, placement and search isolation ${width}-${theme}`);
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
