import assert from "node:assert/strict";

export async function runDialogNavigation({
	close,
	open,
	scenario,
}: {
	close: any;
	open: any;
	scenario: any;
}) {
	await scenario(
		"Offline draft survives reload and synchronizes; conflict never overwrites newer state",
		async (page?: any, apply?: any, origin?: any) => {
			await page.route("**/api/local/operations", (r?: any) =>
				r.fulfill({
					status: 503,
					contentType: "application/json",
					body: '{"error":"fixture offline"}',
				}),
			);
			await page.keyboard.press("n");
			await page.locator("#capture-text").fill("恢复验收笔记");
			await page.locator("[data-action=capture-save]").click();
			await page.waitForFunction(
				() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "error",
			);
			await page.unroute("**/api/local/operations");
			await page.reload();
			await page.waitForFunction(
				() =>
					(document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved" &&
					!localStorage.getItem("sill-unsynced"),
			);
			assert.ok(await page.getByRole("button", { name: "恢复验收笔记", exact: true }).count());
			await page.route("**/api/local/operations", (r?: any) =>
				r.fulfill({
					status: 503,
					contentType: "application/json",
					body: '{"error":"fixture offline"}',
				}),
			);
			await page.evaluate(() => __store.patch("article-01", { note: "未同步的本机备注" }));
			await page.waitForFunction(
				() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "error",
			);
			await apply([{ op: "item.patch", id: "article-01", values: { note: "更新的服务端备注" } }]);
			await page.unroute("**/api/local/operations");
			await page.reload();
			await page.waitForFunction(
				() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "error",
			);
			assert.equal(await page.evaluate(() => __store.item("article-01").note), "未同步的本机备注");
			assert.equal(
				(await fetch(`${origin}/api/local/state`).then((r?: any) => r.json())).state.items[
					"article-01"
				].note,
				"更新的服务端备注",
			);
			assert.ok(await page.locator("#sync-status").isVisible());
			const download = page.waitForEvent("download");
			await page.locator("[data-action=sync-export]").click();
			assert.match((await download).suggestedFilename(), /sill.*json/);
		},
	);
	await scenario(
		"GET outage after reload journals new edits before reconnecting",
		async (page?: any) => {
			const offline = (r?: any) =>
				r.fulfill({
					status: 503,
					contentType: "application/json",
					body: '{"error":"fixture read outage"}',
				});
			await page.route("**/api/local/state", offline);
			await page.reload();
			await page.locator("[data-action=sync-retry]").waitFor();
			await page.keyboard.press("n");
			await page.locator("#capture-text").fill("读取离线期间的新草稿");
			await page.locator("[data-action=capture-save]").click();
			await page.waitForFunction(() =>
				localStorage.getItem("sill-unsynced")?.includes("读取离线期间的新草稿"),
			);
			await page.unroute("**/api/local/state");
			await page.locator("[data-action=sync-retry]").click();
			await page.waitForFunction(
				() =>
					(document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved" &&
					!localStorage.getItem("sill-unsynced"),
			);
			await page.reload();
			await page.getByRole("button", { name: "读取离线期间的新草稿", exact: true }).waitFor();
		},
	);
	await scenario(
		"Same-session failed write retry cannot overwrite another client card",
		async (page?: any, apply?: any, origin?: any) => {
			await apply([
				{
					op: "card.upsert",
					card: {
						id: "offline-note",
						type: "note",
						kind: "capture",
						title: "合成原稿",
						body: ["原文"],
					},
				},
			]);
			await page.locator("[data-card=offline-note] .card-title-button").click();
			await page.route("**/api/local/operations", (r?: any) =>
				r.fulfill({
					status: 503,
					contentType: "application/json",
					body: '{"error":"fixture write outage"}',
				}),
			);
			await page.locator("#inline-title").fill("本机离线修改");
			await page.waitForFunction(
				() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "error",
			);
			await page.keyboard.press("Escape");
			await apply([
				{
					op: "card.upsert",
					card: {
						id: "offline-note",
						type: "note",
						kind: "capture",
						title: "另一会话的新稿",
						body: ["不能被旧稿覆盖"],
					},
				},
			]);
			await page.unroute("**/api/local/operations");
			await page.locator("[data-action=sync-retry]").click();
			await page.waitForFunction(
				() =>
					!__app.refreshBusy &&
					(document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "error",
			);
			assert.equal(
				(await fetch(`${origin}/api/local/state`).then((r?: any) => r.json())).state.cards.find(
					(c?: any) => c.id === "offline-note",
				).title,
				"另一会话的新稿",
			);
			assert.equal(await page.evaluate(() => __store.card("offline-note").title), "本机离线修改");
			assert.ok(await page.locator("[data-action=sync-export]").isVisible());
		},
	);
	await scenario(
		"Update arriving during phone dismissal cannot revive the sheet",
		async (page?: any, apply?: any) => {
			await open(page, "article-01");
			await page.waitForFunction(
				() => (document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
			);
			await apply([
				{ op: "item.patch", id: "article-01", values: { note: "关闭过程中的合成更新" } },
			]);
			let release: any, arrived: any;
			const gate = new Promise((r?: any) => (release = r)),
				ready = new Promise((r?: any) => (arrived = r));
			await page.route("**/api/local/state", async (route?: any) => {
				const response = await route.fetch();
				arrived();
				await gate;
				await route.fulfill({ response });
			});
			await ready;
			await page.getByRole("button", { name: "关闭预览", exact: true }).click();
			release();
			await page.waitForFunction(
				() =>
					!document.querySelector("dialog").open &&
					__store.item("article-01").note === "关闭过程中的合成更新",
			);
			assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
			assert.equal(await page.evaluate(() => location.hash), "#feed");
		},
		{ viewport: { width: 390, height: 844 } },
	);
	await scenario(
		"Remote updates preserve preview scroll, focus, full sheet and renewed scroll behavior",
		async (page?: any, apply?: any) => {
			await open(page, "article-01");
			await page.evaluate(() => {
				(window as Window & { originalScroll?: Element }).originalScroll =
					document.querySelector(".sheet-scroll");
				document.querySelector(".sheet-scroll").scrollTop = 160;
				(document.querySelector("[data-action=bookmark]") as HTMLElement).focus();
			});
			await apply([{ op: "item.patch", id: "note-01", values: { note: "无关更新" } }]);
			await page.waitForFunction(() => __store.item("note-01").note === "无关更新");
			assert.equal(
				await page.evaluate(
					() =>
						document.querySelector(".sheet-scroll") ===
						(window as Window & { originalScroll?: Element }).originalScroll,
				),
				true,
			);
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.action),
				"bookmark",
			);
			assert.ok((await page.locator(".sheet-scroll").evaluate((n?: any) => n.scrollTop)) > 100);
			await apply([{ op: "item.patch", id: "article-01", values: { note: "相关更新" } }]);
			await page.getByText("相关更新", { exact: true }).waitFor();
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.action),
				"bookmark",
			);
			assert.ok((await page.locator(".sheet-scroll").evaluate((n?: any) => n.scrollTop)) > 100);
			await page.locator(".sheet-scroll").evaluate((n?: any) => {
				n.scrollTop = 200;
				n.dispatchEvent(new Event("scroll"));
			});
			assert.ok(
				await page.locator(".preview-sheet").evaluate((n?: any) => n.classList.contains("is-full")),
			);
		},
		{ viewport: { width: 390, height: 844 } },
	);
	await scenario(
		"Keyboard task and preference changes retain focus; radio arrows and shortcut opt-out work",
		async (page?: any) => {
			await open(page, "task-01");
			const task = page.locator("#modal [data-action=task][data-extra=t2]");
			await task.focus();
			const before = await task.getAttribute("aria-checked");
			await page.keyboard.press("Space");
			assert.notEqual(await task.getAttribute("aria-checked"), before);
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
				"t2",
			);
			await page.keyboard.press("Tab");
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
				"t3",
			);
			await close(page);
			const settings = page
				.getByRole("navigation", { name: "主导航" })
				.getByRole("button", { name: "设置", exact: true });
			await settings.waitFor({ state: "visible" });
			await settings.focus();
			await page.keyboard.press("Enter");
			const preference = page.getByRole("switch", { name: "读过的卡片慢慢变淡", exact: true });
			await preference.waitFor();
			await preference.focus();
			const previous = await preference.getAttribute("aria-checked");
			await page.keyboard.press("Space");
			assert.notEqual(await preference.getAttribute("aria-checked"), previous);
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id),
				"fadeRead",
			);
			assert.equal(
				await page.evaluate(() => __store.pref("fadeRead")),
				(await preference.getAttribute("aria-checked")) === "true",
			);
			await page.locator("[data-action=settings-group][data-extra=look]").focus();
			await page.keyboard.press("Enter");
			const radios = page.getByRole("radiogroup", { name: "主题" });
			await radios.locator('[tabindex="0"]').focus();
			await page.keyboard.press("ArrowRight");
			assert.equal(await page.evaluate(() => __store.pref("theme")), "light");
			assert.equal(await radios.locator('[tabindex="0"]').count(), 1);
			await page.locator("[data-action=settings-group][data-extra=keys]").click();
			await page.getByRole("switch", { name: "单键快捷键 N / R / T" }).click();
			await close(page);
			await page.keyboard.press("n");
			assert.equal(await page.locator("#modal").evaluate((n?: any) => n.open), false);
			await page.keyboard.press("Control+k");
			assert.equal(await page.getByRole("dialog", { name: "搜索与筛选" }).count(), 1);
		},
	);
}
