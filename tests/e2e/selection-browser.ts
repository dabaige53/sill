/** Selection gestures use synthetic cards on an isolated origin, never a user's workspace. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { runSelectionKeyboardActions } from "./selection-browser-keyboard-actions.ts";
import { runSelectionPressMenu } from "./selection-browser-press-menu.ts";

const root = path.resolve(import.meta.dirname, "../..");
const load = createRequire(
	process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
		? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json")
		: import.meta.url,
);
const { chromium } = load("playwright");
const artifacts = path.join(root, "tests/artifacts");
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
const firstIds = ["selection-01", "selection-02"];
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const desktop = { viewport: { width: 1440, height: 1000 } };
let browser: any;

const snapshot = (page: any) =>
	page.evaluate(() => ({
		cards: window.__store.state.cards,
		items: window.__store.state.items,
		stored: JSON.parse(localStorage.getItem("sill-v1")),
	}));
const selection = (page: any) => page.evaluate(() => [...window.__app.selected].sort());
const selectTwo = (page: any) =>
	page.evaluate(
		(ids: string[]) =>
			ids.forEach((id) => {
				window.__app.select(id, { add: true });
			}),
		firstIds,
	);
const isMenuOpen = (page: any) =>
	page
		.locator("#selection-menu")
		.count()
		.then((count: number) => count > 0);
const unchanged = async (page: any, before: any) => {
	assert.deepEqual(await snapshot(page), before, "a gesture or dismissal changed card data");
	assert.deepEqual(await selection(page), firstIds, "dismissal lost the selected cards");
	assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 0);
};
async function point(page: any) {
	const target = page.locator('[data-card="selection-01"] .card-summary');
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	assert.ok(box, "fixture card has no visible summary");
	return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}
async function touch(session: any, type: string, p?: { x: number; y: number }) {
	await session.send("Input.dispatchTouchEvent", {
		type,
		touchPoints: p ? [{ ...p, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [],
	});
}
async function beginLift(page: any, mobile: boolean) {
	const p = await point(page);
	const session = mobile ? await page.context().newCDPSession(page) : null;
	if (mobile) await touch(session, "touchStart", p);
	else {
		await page.mouse.move(p.x, p.y);
		await page.mouse.down();
	}
	await page.waitForTimeout(440);
	assert.equal(await page.locator(".selection-lift,.selected-tick").count(), 0);
	const moved = { x: p.x + 30, y: p.y + 65 };
	if (mobile) await touch(session, "touchMove", moved);
	else await page.mouse.move(moved.x, moved.y, { steps: 3 });
	await checkThumbnail(page, ".selection-drag-preview");
	return {
		moveTo: async (next: { x: number; y: number }) => {
			if (mobile) await touch(session, "touchMove", next);
			else await page.mouse.move(next.x, next.y, { steps: 3 });
		},
		release: async () => {
			if (mobile) await touch(session, "touchEnd");
			else await page.mouse.up();
		},
		cancel: async () => {
			if (mobile) await touch(session, "touchCancel");
			else {
				await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel")));
				await page.mouse.up();
			}
		},
	};
}
async function checkThumbnail(page: any, container: string) {
	// Like Photos: each chosen card (up to three) is a real clone in the pile; the first one chosen lies on top.
	assert.equal(
		await page.locator(`${container} .selection-stack-face > .feed-card`).count(),
		2,
		"every chosen card must be a real card DOM clone",
	);
	const clone = page.locator(`${container} .selection-stack-face[data-layer="0"] > .feed-card`);
	assert.equal(await clone.count(), 1, "the top of the pile must be a real card DOM clone");
	assert.equal(
		await clone.locator(".card-summary").textContent(),
		await page.locator('[data-card="selection-01"] .card-summary').textContent(),
	);
	assert.equal(
		await clone.locator("button,a,input,textarea,select,[tabindex],[contenteditable]").count(),
		0,
	);
	assert.equal(
		await clone.evaluate((node: HTMLElement) =>
			[node, ...node.querySelectorAll("*")].some((child) =>
				[...child.attributes].some(
					(attr) => attr.name === "id" || /^(aria-|data-|on)/.test(attr.name),
				),
			),
		),
		false,
	);
	assert.equal(
		await page
			.locator(`${container} .selection-stack`)
			.evaluate((node: HTMLElement) => node.inert && node.getAttribute("aria-hidden") === "true"),
		true,
	);
}

try {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	async function scenario(name: string, fn: (page: any) => Promise<void>, options: any = desktop) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		page.setDefaultTimeout(6000);
		const errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (error: Error) => errors.push(error.message));
		await context.route("**/*", (route: any) => {
			const url = route.request().url();
			if (url.startsWith(`${origin}/`) || url.startsWith("data:")) return route.continue();
			external.push(url);
			return route.abort();
		});
		await page.addInitScript(() => {
			const cards = Array.from({ length: 40 }, (_, i) => ({
				id: `selection-${String(i + 1).padStart(2, "0")}`,
				type: "article",
				title: `选择测试 ${i + 1}`,
				summary: "这是隔离测试卡片。长按、移动与关闭菜单都不应修改正文或阅读状态。",
				body: "仅用于选择交互的合成数据，不读取真实工作区。",
				tags: [],
				time: Date.now() - i * 60000,
			}));
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards,
					items: {},
					seconds: 0,
					preferences: { stack: false, onboarded: true, sort: "time", archiveAfter: "never" },
				}),
			);
		});
		try {
			await page.goto(`${origin}/index.html`);
			await page.waitForFunction(
				() => window.__app && document.querySelector('[data-card="selection-01"]'),
			);
			await page.evaluate(() => {
				window.__selectionProbe = { patches: 0, refreshes: 0 };
				const patch = window.__store.patch.bind(window.__store);
				window.__store.patch = (...args: any[]) => {
					window.__selectionProbe.patches++;
					return patch(...args);
				};
				const refresh = window.__app.refresh.bind(window.__app);
				window.__app.refresh = (...args: any[]) => {
					window.__selectionProbe.refreshes++;
					return refresh(...args);
				};
			});
			await fn(page);
			assert.deepEqual(errors, [], "uncaught browser errors");
			assert.deepEqual(external, [], "selection must not contact external services");
			results.push({ name, status: "PASS" });
			console.log("PASS", name);
		} catch (error: any) {
			const screenshot = `selection-failure-${results.length + 1}.png`;
			await page
				.screenshot({ path: path.join(artifacts, screenshot), animations: "disabled" })
				.catch(() => {});
			results.push({ name, status: "FAIL", error: error.message, screenshot, errors, external });
			console.error("FAIL", name, error.stack || error.message);
		} finally {
			await context.close();
		}
	}
	await runSelectionPressMenu({
		beginLift,
		desktop,
		firstIds,
		isMenuOpen,
		phone,
		point,
		scenario,
		selectTwo,
		selection,
		snapshot,
		touch,
		unchanged,
	});

	await runSelectionKeyboardActions({
		beginLift,
		desktop,
		firstIds,
		phone,
		scenario,
		selectTwo,
		selection,
		snapshot,
		unchanged,
	});

	const failed = results.filter((result) => result.status === "FAIL");
	assert.equal(
		failed.length,
		0,
		`${failed.length}/${results.length} selection scenarios failed: ${failed.map((result) => result.name).join("; ")}`,
	);
} finally {
	fs.writeFileSync(
		path.join(artifacts, "selection-results.json"),
		`${JSON.stringify(results, null, 2)}\n`,
	);
	if (browser) await browser.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
