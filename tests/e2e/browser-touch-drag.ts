import assert from "node:assert/strict";
import path from "node:path";

export async function runTouchDrag({
	action,
	artifacts,
	card,
	feedUnopened,
	filter,
	recordLayout,
	scenario,
	state,
	touchTargets,
}: {
	action: any;
	artifacts: any;
	card: any;
	feedUnopened: any;
	filter: any;
	recordLayout: any;
	scenario: any;
	state: any;
	touchTargets: any;
}) {
	await scenario(
		"Settings and first run omit retired capture and source connections",
		async (page?: any) => {
			await action(page, "settings");
			await page.locator('[data-action="pref-toggle"][data-id="stack"]').click();
			assert.ok(
				(await page.locator('[data-card^="sspai-"]').count()) > 0,
				"turning stacking off should unfold the burst",
			);
			await page.locator('[data-action="settings-group"][data-extra="look"]').click();
			await page.locator('[data-action="pref"][data-id="theme"][data-extra="dark"]').click();
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
			assert.equal(
				await page.locator('[data-action="settings-group"][data-extra="sources"]').count(),
				0,
			);
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			await page.reload();
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
			await action(page, "clear-all");
			await page.locator('[data-action="clear-confirm"]').click();
			await page.locator(".welcome").waitFor();
			assert.equal(await page.locator(".feed-card").count(), 0);
			assert.deepEqual(await page.locator(".welcome-actions button").allTextContents(), [
				"先看示例",
			]);
			assert.equal(await page.locator('[data-action="capture"], #capture-text').count(), 0);
			await page.locator('[data-action="welcome-demo"]').click();
			await page.locator('[data-card="article-01"]').waitFor();
		},
	);
	for (const width of [680, 700, 810, 1440, 2048])
		await scenario(
			`${width}px desktop uses compact cards across the available screen`,
			async (page?: any) => {
				const geometry = await page.locator(".feed-card").evaluateAll((nodes?: any) =>
					nodes.map((n?: any) => {
						const r = n.getBoundingClientRect();
						return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
					}),
				);
				// Columns are at least 280px and share the spare width with no col-max cap;
				// the first-screen entry (scale .985) may still be settling.
				const widest = Math.max(...geometry.map((r?: any) => r.width));
				assert.ok(
					geometry.every((r?: any) => r.width >= 275 && widest - r.width < 8),
					JSON.stringify(geometry),
				);
				assert.ok(
					geometry.every((r?: any) => r.left >= 0 && r.right <= width),
					"cards overflow the screen",
				);
				for (let i = 0; i < geometry.length; i++)
					for (let j = i + 1; j < geometry.length; j++) {
						const a = geometry[i],
							b = geometry[j];
						assert.ok(
							a.right <= b.left + 1 ||
								b.right <= a.left + 1 ||
								a.bottom <= b.top + 1 ||
								b.bottom <= a.top + 1,
							"cards overlap",
						);
					}
				await recordLayout(page, width);
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `feed-viewport-${width}.png`),
				});
			},
			{ viewport: { width, height: 1000 } },
		);
	await scenario(
		"Motion exits preserve live identity and survive rapid filtering and reselection",
		async (page: any) => {
			await page.evaluate(async () => {
				const app = window.__app;
				app.openPanel("settings");
				app.closeNative();
				if (!app.dialog.open || !app.sheetLeaving) throw new Error("Panel skipped its exit");
				app.openPanel("search");
				await new Promise((resolve) => setTimeout(resolve, 400));
				if (!app.dialog.open || app.modalKind !== "search")
					throw new Error("Old close hid new panel");
				app.closeNative(false);
				app.select("article-01");
				app.selected.clear();
				app.updateSelection();
				app.select("article-01");
				await new Promise((resolve) => setTimeout(resolve, 400));
				const bar = document.getElementById("selection-bar");
				if (bar.hidden || bar.inert) throw new Error("Old selection exit hid new selection");
				app.selected.clear();
				app.updateSelection();
				const liveIds = [...app.grid.querySelectorAll("[data-card]")]
					.map((n: HTMLElement) => n.dataset.card)
					.join(",");
				app.filter.query = "no matching card for motion regression";
				app.withFeedAnchor(() => {}, true);
				const exit = document.querySelector<HTMLElement>(".motion-exit");
				if (!exit?.inert || exit.querySelector("[data-card],[data-action],[id]"))
					throw new Error("Removed card retained an interactive identity");
				app.filter.query = "";
				app.withFeedAnchor(() => {}, true);
				if (exit.isConnected) throw new Error("Restoring filter left duplicate exit surface");
				if (
					[...app.grid.querySelectorAll("[data-card]")]
						.map((n: HTMLElement) => n.dataset.card)
						.join(",") !== liveIds
				)
					throw new Error("Restoring filter duplicated or lost the card");
			});
		},
	);
	await scenario(
		"Phone drawer waits for its exit motion and cancels stale opening callbacks",
		async (page: any) => {
			await page.evaluate(() => window.__app.openCard("article-01"));
			await page.waitForTimeout(1000);
			// The exit is a Motion animation on the sheet (motion handbook); the dialog stays open while it runs.
			const leaving = await page.evaluate(async () => {
				window.__app.closeNative();
				await new Promise((resolve) => requestAnimationFrame(resolve));
				return {
					open: (document.getElementById("modal") as HTMLDialogElement).open,
					running: document
						.querySelector("#modal .phone-drawer")
						.getAnimations()
						.some((a) => a.playState === "running"),
				};
			});
			assert.deepEqual(leaving, { open: true, running: true });
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			await page.evaluate(async () => {
				const app = window.__app;
				app.openCard("article-01");
				app.closeNative();
				app.openCard("mail-01");
				await new Promise((resolve) => setTimeout(resolve, 1000));
				if (!app.dialog.open || app.currentId !== "mail-01" || app.sheetLeaving)
					throw new Error("Stale drawer callback affected new card");
				if (app.dialog.querySelector(".preview-sheet").classList.contains("is-off"))
					throw new Error("New drawer stayed off screen");
			});
		},
		{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
	);
	for (const width of [390, 320])
		await scenario(
			`${width}px touch layout, reminder controls`,
			async (page?: any) => {
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `feed-${width}.png`),
					fullPage: true,
				});
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `feed-viewport-${width}.png`),
				});
				await recordLayout(page, width);
				assert.equal(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
					),
					true,
				);
				const reminder = card(page, "reminder-01");
				await reminder.scrollIntoViewIfNeeded();
				await touchTargets(reminder.locator(".reminder-check"), width);
				await reminder.locator('[data-action="complete-reminder"]').tap();
				assert.equal((await state(page, "reminder-01")).reminderDone, true);
				assert.equal(await reminder.count(), 1);
				await feedUnopened(page, "reminder-01");
				// No popup undo (interaction handbook): the same circle restores it.
				assert.equal(await page.getByRole("button", { name: "撤销操作", exact: true }).count(), 0);
				await reminder.locator('[data-action="restore-reminder"]').tap();
				assert.equal((await state(page, "reminder-01")).reminderDone, false);
				assert.equal(await reminder.count(), 1);
				await page.getByRole("button", { name: "搜索", exact: true }).tap();
				await page.waitForFunction(() => window.__app.modalKind === "search");
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `filter-${width}.png`),
				});
				await page.keyboard.press("Escape");
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				await action(page, "preview", "reminder-01");
				const controls = page.locator("#modal .icon-button");
				const boxes = await controls.evaluateAll((nodes?: any) =>
					nodes.map((n?: any) => {
						const r = n.getBoundingClientRect();
						return { width: r.width, height: r.height, right: r.right };
					}),
				);
				assert.ok(boxes.every((r?: any) => r.width >= 44 && r.height >= 44 && r.right <= width));
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `reminder-${width}.png`),
				});
				await page
					.locator("#modal")
					.getByRole("button", {
						name: "在 Sill 内再提醒",
						exact: true,
					})
					.tap();
				assert.ok(
					(await state(page, "reminder-01")).snoozedUntil > (await page.evaluate(() => Date.now())),
				);
				await filter(page, "all");
				// Search lists results only for typed text or a tag.
				await page.locator("#filter-search").fill("小空档");
				await page.locator('#search-results [data-card="reminder-01"]').waitFor();
				assert.equal(await page.locator('#search-results [data-card="reminder-01"]').count(), 1);
				await page.evaluate(() => window.__app.goTo("home"));
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				await action(page, "card-open", "article-01");
				await page.screenshot({
					animations: "disabled",
					path: path.join(artifacts, `preview-${width}.png`),
				});
				const bar = await page.locator("#modal .float-bar").boundingBox();
				assert.ok(bar.x >= 0 && bar.x + bar.width <= width, "toolbar overflows the phone");
			},
			{
				viewport: { width, height: 844 },
				isMobile: true,
				hasTouch: true,
			},
		);
	await scenario("Desktop drag cancellation preserves cards and read state", async (page?: any) => {
		const box = await card(page, "article-01").locator(".card-head").boundingBox();
		const x = box.x + box.width / 2,
			y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.waitForTimeout(440);
		await page.mouse.up();
		assert.equal(await page.evaluate(() => window.__app.selected.has("article-01")), true);
		await page.mouse.down();
		await page.waitForFunction(() => !!window.__app.drag.active);
		await page.mouse.move(x + 30, y + 30, { steps: 3 });
		assert.equal(await page.locator(".selection-drag-preview").isVisible(), true);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		assert.equal(await page.locator(".selection-drag-preview").count(), 0);
		assert.equal((await state(page, "article-01"))?.seen || false, false);
		assert.equal(await page.locator('[data-card="article-01"]').count(), 1);
	});
}
