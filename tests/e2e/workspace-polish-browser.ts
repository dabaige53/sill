import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startLocal } from "../../server/local/index.ts";

const directory = await mkdtemp(join(tmpdir(), "sill-polish-"));
const server = await startLocal({ port: 0, file: join(directory, "cards.json") });
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
let browser: any;
const request = async (path?: any, body?: any) => {
	const response = await fetch(
		origin + "/api/local/" + path,
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: {},
	);
	assert.equal(response.status, 200);
	return response.json();
};
try {
	await request("initialize", {
		cards: [
			{
				id: "note-polish",
				type: "note",
				kind: "capture",
				title: "让想法有处安放",
				body: ["先记下来，再慢慢整理。"],
				time: Date.now(),
			},
			{
				id: "note-other",
				type: "note",
				kind: "capture",
				title: "留一点阅读的时间",
				body: ["卡片保留内容，工具在需要时出现。"],
				time: Date.now() - 1000,
			},
		],
		items: {},
		seconds: 0,
		preferences: { onboarded: true, theme: "system", stack: false },
		sources: [],
	});
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	const page = await browser.newPage({
			viewport: { width: 1200, height: 900 },
			colorScheme: "dark",
		}),
		errors = [];
	page.on("pageerror", (error?: any) => errors.push(error.message));
	await page.goto(origin);
	await page.waitForFunction(() => __app.grid.dataset.sync === "saved");
	assert.equal(
		await page.locator("html").getAttribute("data-theme"),
		"dark",
		"system appearance applies at first render",
	);
	// Only the embedded container changes size; no window resize is dispatched.
	await page.locator("#feed-grid").evaluate((e?: any) => (e.style.width = "340px"));
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.columns === "1",
	);
	const cards = await page
		.locator(".feed-item")
		.evaluateAll((nodes?: any) =>
			nodes.map((n?: any) => ({ top: n.offsetTop, height: n.offsetHeight, width: n.offsetWidth })),
		);
	assert.ok(
		cards[1].top >= cards[0].top + cards[0].height,
		"container resize does not overlap cards",
	);
	assert.ok(cards.every((c?: any) => c.width === 340));
	await page.locator("#feed-grid").evaluate((e?: any) => (e.style.width = ""));
	await page.evaluate(() =>
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "k", ctrlKey: true, isComposing: true, bubbles: true }),
		),
	);
	assert.equal(
		await page.locator("dialog").evaluate((e?: any) => e.open),
		false,
		"IME composition does not trigger a shortcut",
	);
	await page.evaluate(() => {
		clearInterval(__app.readTicker);
		__app.startInlineEdit("note-polish");
	});
	await page.waitForFunction(() => __app.grid.dataset.sync === "saved");
	const before = await request("state");
	await request("operations", {
		expectedRevision: before.revision,
		operations: [
			{
				op: "card.upsert",
				card: {
					...before.state.cards.find((c?: any) => c.id === "note-polish"),
					title: "另一处的新标题",
					body: ["不能被旧页面覆盖。"],
				},
			},
		],
	});
	// An explicit refresh while typing must not adopt a newer revision for an older draft.
	await page.evaluate(() => __app.refresh());
	await page.locator("#inline-title").fill("我的未提交草稿");
	await page.locator("#inline-body").fill("保留我刚输入的文字。");
	await page.evaluate(() => __app.saveInlineEdit());
	await page.waitForFunction(() => __app.grid.dataset.sync === "error");
	const remote = await request("state");
	assert.equal(
		remote.state.cards.find((c?: any) => c.id === "note-polish").title,
		"另一处的新标题",
	);
	assert.equal(await page.locator("#inline-title").inputValue(), "我的未提交草稿");
	assert.ok(
		await page.evaluate(() => JSON.parse(localStorage.getItem("sill-unsynced")).pending.length > 0),
		"conflict preserves a durable local draft",
	);
	await page.reload();
	await page.waitForFunction(() => __app.grid.dataset.sync === "error");
	assert.equal(
		await page.evaluate(() => __store.card("note-polish").title),
		"我的未提交草稿",
		"draft survives reload without overwriting remote data",
	);
	await page.evaluate(() => __app.action("sync-discard-confirm"));
	await page.waitForFunction(() => __app.grid.dataset.sync === "saved");
	await page.evaluate(() => __app.action("permission-allow", "", "photos"));
	await page.waitForFunction(() => __app.grid.dataset.sync === "saved");
	const source = (await request("state")).state.sources.find((s?: any) => s.id === "src-photos");
	assert.equal(source.status, "attention");
	assert.equal(source.syncedAt, undefined);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector("dialog").open);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.keyboard.press("Control+k");
	assert.equal(
		await page.locator("#filter-search").evaluate((e?: any) => e === document.activeElement),
		true,
	);
	await mkdir("tests/artifacts", { recursive: true });
	await page.screenshot({
		path: "tests/artifacts/workspace-polish-dark.png",
		animations: "disabled",
	});
	assert.deepEqual(errors, []);
	console.log(
		"PASS workspace polish: embedded resize, system theme, IME, live conflict, durable draft, honest source state, reduced motion",
	);
} finally {
	await browser?.close();
	await new Promise((resolve?: any) => server.close(resolve));
	await rm(directory, { recursive: true, force: true });
}
