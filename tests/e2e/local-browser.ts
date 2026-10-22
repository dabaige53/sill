import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startLocal } from "../../server/local/index.ts";

const dir = await mkdtemp(join(tmpdir(), "qg-browser-")),
	file = join(dir, "cards.json");
const artifacts = join(import.meta.dirname, "../artifacts");
await mkdir(artifacts, { recursive: true });
let server = await startLocal({ port: 0, file }),
	browser: any;
const errors = [];
try {
	const port = (server.address() as import("node:net").AddressInfo).port,
		origin = "http://127.0.0.1:" + port;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	page.setDefaultTimeout(8000);
	page.on("pageerror", (e?: any) => errors.push(e.message));
	await page.addInitScript(() => {
		if (!localStorage.getItem("sill-v1"))
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 2,
					items: {
						"note-01": { note: "旧备注", bookmarked: true },
						"task-01": { taskDone: ["t1", "t2"] },
					},
					sources: [{ id: "legacy-source", status: "ok", syncedAt: 123 }],
					seconds: 37,
					sort: "time",
				}),
			);
	});
	await page.goto(origin);
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved",
	);
	let value = await fetch(origin + "/api/local/state").then((r?: any) => r.json());
	assert.equal(value.state.items["note-01"].note, "旧备注");
	assert.equal(value.state.items["note-01"].bookmarked, true);
	assert.deepEqual(value.state.items["task-01"].taskDone, ["t1", "t2"]);
	assert.equal(value.state.seconds, 37);
	assert.equal(
		await page.locator('#ai-panel,[data-action="applications"],[data-action="card-ai"]').count(),
		0,
	);
	const apply = async (operations?: any) => {
		const response = await fetch(origin + "/api/local/operations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operations }),
		});
		const value = await response.json();
		assert.equal(response.status, 200, JSON.stringify(value));
		return value;
	};
	await apply([
		{
			op: "card.upsert",
			card: {
				id: "agent-test",
				type: "note",
				title: "AI 同步验收",
				body: ["AI 写入本地"],
				url: "https://example.com",
			},
		},
		{ op: "item.patch", id: "agent-test", values: { note: "AI 备注", bookmarked: true } },
	]);
	await page.locator('[data-card="agent-test"]').waitFor();
	await page.locator('[data-card="agent-test"] .card-title-button').click();
	await page.getByRole("button", { name: "取消收藏", exact: false }).click();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
	);
	value = await fetch(origin + "/api/local/state").then((r?: any) => r.json());
	assert.equal(value.state.items["agent-test"].bookmarked, false);
	await apply([
		{ op: "item.patch", id: "agent-test", values: { note: "新 AI 备注" } },
		{ op: "preferences.patch", values: { density: "compact" } },
	]);
	await page.getByText("新 AI 备注", { exact: true }).waitFor();
	assert.equal(await page.evaluate(() => window.__store.pref("density")), "compact");
	await page.getByRole("button", { name: "编辑标签与备注", exact: true }).click();
	await page.locator("#note-editor").fill("页面写回给 AI");
	await page.locator('[data-action="save-note"]').click();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
	);
	value = await fetch(origin + "/api/local/state").then((r?: any) => r.json());
	assert.equal(value.state.items["agent-test"].note, "页面写回给 AI");
	// A response started before opening the editor must not replace its baseline.
	let releaseSave: () => void;
	const saveGate = new Promise<void>((resolve) => {
		releaseSave = resolve;
	});
	let notifySave: () => void;
	const saveStarted = new Promise<void>((resolve) => {
		notifySave = resolve;
	});
	await page.route(
		"**/api/local/operations",
		async (route) => {
			notifySave();
			await saveGate;
			await route.continue();
		},
		{ times: 1 },
	);
	await page.evaluate(() => window.__app.setPref("density", "standard"));
	await saveStarted;
	await page.evaluate(() => window.__app.openPanel("editor", "agent-test"));
	await apply([{ op: "item.patch", id: "agent-test", values: { note: "并发 AI 备注" } }]);
	releaseSave();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
	);
	await page.locator("#note-editor").fill("保留的冲突草稿");
	await page.locator('[data-action="save-note"]').click();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "error",
	);
	value = await fetch(origin + "/api/local/state").then((r) => r.json());
	assert.equal(value.state.items["agent-test"].note, "并发 AI 备注");
	assert.equal(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem("sill-unsynced")).state.items["agent-test"].note,
		),
		"保留的冲突草稿",
	);
	await page.evaluate(() => window.__app.action("sync-discard"));
	await page.locator('[data-action="sync-discard-confirm"]').click();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
	);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector("dialog").open);
	// Refresh has no button on the rail: the R key (or a pull at the top) runs it.
	await page.keyboard.press("r");
	await page.waitForFunction(() => document.querySelector("#announcer").textContent === "刷新完成");
	assert.equal(value.state.cards.length, 31);
	const box = await page.locator('[data-card="agent-test"]').boundingBox();
	// Desktop columns share the spare width with no col-max cap, so check the card against the grid.
	const grid = await page
		.locator("#feed-grid")
		.evaluate((el: HTMLElement) => ({
			width: el.clientWidth,
			columns: Number(el.dataset.columns),
		}));
	const share = (grid.width - (grid.columns - 1) * 24) / grid.columns;
	assert.ok(
		box.width >= 280 && Math.abs(box.width - share) < 1,
		`card width ${box.width}, share ${share}`,
	);
	await page.screenshot({ path: join(artifacts, "local-cards.png"), animations: "disabled" });
	// A second page sees the same data; a restart reloads the persisted repository.
	const second = await browser.newPage();
	await second.goto(origin);
	await second.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved",
	);
	assert.equal(await second.locator('[data-card="agent-test"]').count(), 1);
	await apply([{ op: "card.delete", id: "agent-test" }]);
	await page.locator('[data-card="agent-test"]').waitFor({ state: "detached" });
	await second.locator('[data-card="agent-test"]').waitFor({ state: "detached" });
	await page.reload();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved",
	);
	assert.equal(await page.locator('[data-card="agent-test"]').count(), 0);
	await new Promise((resolve?: any) => server.close(resolve));
	server = await startLocal({ port, file });
	await page.reload();
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved",
	);
	value = await fetch(origin + "/api/local/state").then((r?: any) => r.json());
	assert.equal(value.state.cards.length, 30);
	assert.equal(value.state.items["note-01"].note, "旧备注");
	// Captured links reach the shared repository while retired source metadata stays unchanged.
	await page.evaluate(() => window.__app.capture("https://example.com/sync 页面收集的链接"));
	await page.waitForFunction(
		() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
	);
	value = await fetch(origin + "/api/local/state").then((r?: any) => r.json());
	assert.ok(
		value.state.cards.some(
			(c?: any) => c.url === "https://example.com/sync" && c.title === "页面收集的链接",
		),
	);
	assert.deepEqual(value.state.sources, [{ id: "legacy-source", status: "ok", syncedAt: 123 }]);
	assert.equal(await page.locator('input[type="file"],#import-rings').count(), 0);
	assert.deepEqual(errors, []);
	await writeFile(
		join(artifacts, "local-browser.json"),
		JSON.stringify(
			{
				status: "passed",
				checks: [
					"旧数据迁移",
					"AI 写入自动显示",
					"页面操作写回",
					"编辑期间回包不覆盖基准，冲突保留草稿",
					"打开预览同步",
					"设置同步",
					"刷新无假数据",
					"双页面同步",
					"删除与重启持久化",
				],
				errors,
			},
			null,
			2,
		),
	);
	console.log("PASS local card UI and agent operations share persistent state");
} finally {
	await browser?.close();
	await new Promise((resolve?: any) => server.close(resolve));
	await rm(dir, { recursive: true, force: true });
}
