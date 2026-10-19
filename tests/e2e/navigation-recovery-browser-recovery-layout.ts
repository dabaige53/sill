import assert from "node:assert/strict";

export async function runRecoveryLayout({
	close,
	open,
	scenario,
	settle,
}: {
	close: any;
	open: any;
	scenario: any;
	settle: any;
}) {
	await scenario(
		"Keyboard navigation reaches settings Add, persists a note, and exposes no removed source or import entries",
		async (page?: any) => {
			// ADR 0033 removes sources and imports; ADR 0035 keeps four places and moves Add into settings.
			const removed = page.locator(
				'#file-input,[data-action="sources"],[data-action="source-toggle"],[data-action="import"],[data-action="import-run"],[data-action="import-toggle"],[data-action="settings-group"][data-extra="sources"]',
			);
			assert.equal(await removed.count(), 0);
			const nav = page.getByRole("navigation", { name: "主导航" });
			assert.deepEqual(
				await nav
					.locator(".nav-tab")
					.evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.extra)),
				["home", "search", "ai", "settings"],
			);
			assert.equal(await nav.locator('[data-action="capture"]').count(), 0);
			await nav.getByRole("button", { name: "主页", exact: true }).focus();
			for (const key of ["search", "ai", "settings"]) {
				await page.keyboard.press("Tab");
				assert.equal(
					await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
					key,
				);
			}
			await page.keyboard.press("Enter");
			const groups = page.getByRole("navigation", { name: "设置分组" });
			await groups.waitFor();
			assert.equal(await groups.getByRole("button").first().getAttribute("data-extra"), "add");
			await groups.locator('[data-extra="data"]').focus();
			await page.keyboard.press("Enter");
			await page.locator('[data-action="export-all"]').waitFor();
			assert.equal(await removed.count(), 0, "data settings must not reintroduce file import");
			await groups.getByRole("button", { name: "添加", exact: true }).focus();
			await page.keyboard.press("Enter");
			assert.equal(await removed.count(), 0);
			for (const key of ["desk", "look", "keys", "data"]) {
				await page.keyboard.press("Tab");
				assert.equal(
					await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
					key,
				);
			}
			await page.keyboard.press("Tab");
			assert.equal(await page.evaluate(() => document.activeElement.id), "capture-text");
			assert.equal(
				await page.getByRole("textbox", { name: "记一笔，或粘贴链接", exact: true }).count(),
				1,
			);
			await page.keyboard.insertText("键盘添加验收笔记");
			await page.keyboard.press("Tab");
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.action),
				"capture-save",
			);
			await page.keyboard.press("Enter");
			await page.waitForFunction(
				() =>
					!document.querySelector("dialog").open &&
					(document.querySelector("#feed-grid") as HTMLElement).dataset.sync === "saved",
			);
			await page.getByRole("button", { name: "键盘添加验收笔记", exact: true }).waitFor();
			await page.reload();
			await page.getByRole("button", { name: "键盘添加验收笔记", exact: true }).waitFor();
			assert.equal(await removed.count(), 0);
		},
	);
	await scenario(
		"Empty desk retains an actionable archive",
		async (page?: any, apply?: any, origin?: any) => {
			const state = (await fetch(`${origin}/api/local/state`).then((r?: any) => r.json())).state;
			await apply([
				...state.cards
					.filter((c?: any) => c.id !== "article-01")
					.map((c?: any) => ({ op: "card.delete", id: c.id })),
				{
					op: "item.patch",
					id: "article-01",
					values: { read: true, readAt: Date.now() - 10 * 86400000 },
				},
			]);
			// Reading and age do not archive a card; only the explicit action empties the desk.
			await page.locator("[data-card=article-01]").waitFor();
			await apply([{ op: "item.patch", id: "article-01", values: { archived: true } }]);
			await page.getByText("桌面上都处理完了", { exact: true }).waitFor();
			await page.locator("[data-action=archive]").click();
			await page.locator("[data-action=restore-card]").click();
			await page.keyboard.press("Escape");
			await page.locator("[data-card=article-01]").waitFor();
		},
	);
	for (const width of [320, 390, 768, 1440])
		await scenario(
			`${width}px keyboard search, panel reachability, light/dark layout`,
			async (page?: any) => {
				for (const theme of ["light", "dark"]) {
					await page.evaluate((t?: any) => {
						__store.setPref("theme", t);
						__app.applyPreferences();
					}, theme);
					await settle(page);
					for (const panel of ["feed", "search", "preview", "settings"]) {
						if (panel === "search") {
							await page.keyboard.press("Control+k");
							await page.locator("#filter-search").fill("无匹配999");
							assert.equal(await page.locator("#filter-result").getAttribute("role"), "status");
							assert.equal(await page.getByRole("dialog", { name: "搜索与筛选" }).count(), 1);
							assert.notEqual(
								await page
									.locator(".search-pill")
									.evaluate((n?: any) => getComputedStyle(n).outlineStyle),
								"none",
							);
						}
						if (panel === "preview") await open(page, "article-01");
						if (panel === "settings") {
							await page.evaluate(() => __app.action("settings"));
							await page.locator("[data-action=settings-group][data-extra=look]").click();
						}
						await settle(page);
						assert.ok(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
						);
						if (panel !== "feed") await close(page);
						if (panel === "search")
							await page.evaluate(() => {
								__app.searchFilter.query = "";
								__app.renderCurrent(false);
							});
					}
				}
				await page.keyboard.press("n");
				await page.waitForTimeout(150);
				assert.equal(await page.locator("#modal").evaluate((n?: any) => n.open), true);
				await close(page);
			},
			{ viewport: { width, height: 900 } },
		);
	await scenario(
		"Short viewport can scroll capture save into view and submit by keyboard",
		async (page?: any) => {
			await page.keyboard.press("n");
			await page.locator("#capture-text").fill("短窗口验收");
			const save = page.locator("[data-action=capture-save]");
			await save.focus();
			await settle(page);
			const rect = await save.boundingBox();
			assert.ok(rect.y >= 0 && rect.y + rect.height <= 225, JSON.stringify(rect));
			await page.keyboard.press("Enter");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			assert.ok(await page.getByRole("button", { name: "短窗口验收", exact: true }).count());
		},
		{ viewport: { width: 320, height: 225 } },
	);
}
