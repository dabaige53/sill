import assert from "node:assert/strict";
import path from "node:path";

export async function runCardActions({
	action,
	artifacts,
	card,
	feedUnopened,
	filter,
	openCard,
	recordLayout,
	scenario,
	state,
}: {
	action: any;
	artifacts: any;
	card: any;
	feedUnopened: any;
	filter: any;
	openCard: any;
	recordLayout: any;
	scenario: any;
	state: any;
}) {
	await scenario(
		"Preview, reader, bookmark undo, tags and task controls remain independent",
		async (page?: any) => {
			assert.equal(
				await page
					.locator(
						'[data-action="applications"],[data-action="application-use"],[data-application-link]',
					)
					.count(),
				0,
				"application connections belong in Codex, not the card page",
			);
			assert.equal(await page.locator('[data-card="article-01"]').count(), 1);
			await openCard(page, "article-01");
			assert.equal((await state(page, "article-01")).seen, true);
			assert.equal((await state(page, "article-01")).read, false);
			await page.locator('#modal [data-action="bookmark"]').click();
			assert.equal((await state(page, "article-01")).bookmarked, true);
			assert.equal(await page.locator("#toast").isVisible(), false, "a single flag needs no toast");
			await page.locator('#modal [data-action="bookmark"]').click();
			assert.equal((await state(page, "article-01")).bookmarked, false);
			await page.locator('#modal [data-action="reader"]').click();
			await page.evaluate(
				() =>
					new Promise((resolve?: any) =>
						requestAnimationFrame(() => requestAnimationFrame(resolve)),
					),
			);
			await page.locator("#reader-scroll").evaluate((el?: any) => {
				el.scrollTop = el.scrollHeight;
				el.dispatchEvent(new Event("scroll"));
			});
			assert.equal((await state(page, "article-01")).read, true);
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => window.__app.modalKind === "preview");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			await action(page, "edit", "note-01");
			await page.locator("#note-editor").fill("<b>本地备注</b>");
			await page.locator('[data-action="save-note"]').click();
			await page.reload();
			assert.equal((await state(page, "note-01")).note, "<b>本地备注</b>");
			assert.equal(await page.locator('#ai-panel,[data-action="card-ai"]').count(), 0);
			const tasks = card(page, "task-01");
			await tasks.locator('[data-action="task"][data-extra="t2"]').focus();
			await page.keyboard.press("Space");
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
				"t2",
				"task update moved focus to a different checkbox",
			);
			await tasks.locator('[data-action="task"][data-extra="t3"]').focus();
			await page.keyboard.press("Space");
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.extra),
				"t3",
			);
			await tasks
				.locator('[data-action="task"][data-extra="t7"]')
				.scrollIntoViewIfNeeded()
				.catch(() => {});
			await action(page, "task", "task-01", "t7");
			await tasks.locator(".card-title-button").focus();
			assert.equal(
				await tasks
					.locator(".card-title-button")
					.evaluate((n?: any) => n === document.activeElement),
				true,
				"completed task must return focus to its title",
			);
		},
	);
	await scenario(
		"Snooze stays on home, survives reload and queues one notification",
		async (page?: any) => {
			await page.clock.install();
			await action(page, "preview", "reminder-01");
			await page
				.locator("#modal")
				.getByRole("button", { name: "在 Sill 内再提醒", exact: true })
				.click();
			assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			const deadline = (await state(page, "reminder-01")).snoozedUntil;
			await page.reload();
			assert.equal((await state(page, "reminder-01")).snoozedUntil, deadline);
			await action(page, "reader", "article-01");
			const order = await page
				.locator(".feed-card")
				.evaluateAll((nodes?: any) => nodes.map((n?: any) => n.dataset.card));
			await page.clock.fastForward(601000);
			assert.equal(await page.evaluate(() => window.__app.modalKind), "reader");
			assert.deepEqual(
				await page
					.locator(".feed-card")
					.evaluateAll((nodes?: any) => nodes.map((n?: any) => n.dataset.card)),
				order,
			);
			await action(page, "show-new");
			assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			await page.locator("#new-count").click();
			assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			await page.clock.fastForward(120000);
			await page.locator("#new-count").evaluate(async (n: HTMLElement) => {
				await Promise.all(n.getAnimations().map((a) => a.finished));
			});
			assert.equal(await page.locator("#new-count").isVisible(), false);
			await page.reload();
			assert.equal(await page.locator("#new-count").isVisible(), false);
		},
	);
	await scenario(
		"Dismiss, completion, status recovery and undo use accessible actions",
		async (page?: any) => {
			await action(page, "preview", "reminder-01");
			await page.locator("#modal").getByRole("button", { name: "忽略此提醒", exact: true }).click();
			assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			// Reminder actions show no toast and no popup undo; the detail restores it (interaction handbook).
			assert.equal(await page.getByRole("button", { name: "撤销操作", exact: true }).count(), 0);
			assert.equal((await state(page, "reminder-01")).dismissed, true);
			await action(page, "preview", "reminder-01");
			await page.locator("#modal").getByRole("button", { name: "恢复提醒", exact: true }).click();
			assert.equal((await state(page, "reminder-01")).dismissed, false);
			assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			await action(page, "preview", "reminder-01");
			// The detail's circle completes the reminder in Sill, as on the card (ADR 0037).
			await page.locator("#modal").getByRole("button", { name: "完成", exact: true }).click();
			assert.equal((await state(page, "reminder-01")).reminderDone, true);
			await filter(page, "all");
			// Search lists results only for typed text or a tag; the type chips alone show nothing.
			await page.locator("#filter-search").fill("小空档");
			await page.locator('#search-results [data-card="reminder-01"]').waitFor();
			assert.equal(await page.locator('#search-results [data-card="reminder-01"]').count(), 1);
			await page.locator('#search-results [data-card="reminder-01"] .card-title-button').click();
			await page.locator("#modal").getByRole("button", { name: "恢复", exact: true }).click();
			await page.locator("#filter-search").waitFor();
			assert.equal((await state(page, "reminder-01")).reminderDone, false);
			await action(page, "clear-filter");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			assert.equal(await page.locator('#feed-grid [data-card="reminder-01"]').count(), 1);
		},
	);
	await scenario(
		"Inline reminder actions work by keyboard without opening or reading the card",
		async (page?: any) => {
			const reminder = card(page, "reminder-01");
			await reminder.locator('[data-action="complete-reminder"]').focus();
			await page.keyboard.press("Enter");
			assert.equal((await state(page, "reminder-01")).reminderDone, true);
			assert.equal(await reminder.count(), 1);
			await feedUnopened(page, "reminder-01");
			assert.equal(
				await page.evaluate(() => document.activeElement !== document.body),
				true,
				"updating the active card lost keyboard focus",
			);
			// No popup undo: the same circle restores the reminder from the keyboard.
			assert.equal(await page.getByRole("button", { name: "撤销操作", exact: true }).count(), 0);
			await reminder.locator('[data-action="restore-reminder"]').focus();
			await page.keyboard.press("Enter");
			assert.equal((await state(page, "reminder-01")).reminderDone, false);
			assert.equal(await reminder.count(), 1);
			assert.equal(
				await page.evaluate(() => document.activeElement !== document.body),
				true,
				"restoring lost keyboard focus",
			);
			// The card only marks Sill's own state; snoozing lives in the detail (ADR 0036).
			assert.equal(await reminder.locator('[data-action="snooze"]').count(), 0);
		},
	);
	await scenario(
		"Card menus close on Escape and outside click, and keep actions separate from preview",
		async (page?: any) => {
			const note = card(page, "note-01"),
				title = note.locator(".card-title-button");
			assert.equal(await page.locator('[data-action="card-more"],.card-more-trigger').count(), 0);
			await title.press("Shift+F10");
			assert.equal(await page.locator(".card-more-menu").count(), 1);
			assert.equal(await title.getAttribute("aria-expanded"), "true");
			await page.keyboard.press("Escape");
			assert.equal(await page.locator(".card-more-menu").count(), 0);
			assert.equal(
				await title.evaluate((n?: any) => document.activeElement === n),
				true,
				"Escape should return to the card title",
			);
			assert.equal(await title.getAttribute("aria-expanded"), "false");
			await feedUnopened(page, "note-01");
			await note.click({ button: "right" });
			await card(page, "article-01").click({ button: "right" });
			assert.equal(await page.locator(".card-more-menu").count(), 1);
			assert.equal(await note.locator(".card-more-menu").count(), 0);
			await page.mouse.click(3, 3);
			assert.equal(await page.locator(".card-more-menu").count(), 0);
			await title.press("ContextMenu");
			await note.locator('.card-more-menu [data-action="later"]').click();
			assert.equal((await state(page, "note-01")).later, true);
			assert.equal(await page.locator(".card-more-menu").count(), 0);
			await feedUnopened(page, "note-01");
			assert.equal(
				await title.evaluate((n?: any) => document.activeElement === n),
				true,
				"a menu action should preserve a usable focus target",
			);
			await title.press("Shift+F10");
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("ArrowDown");
			assert.equal(
				await page.evaluate(() => (document.activeElement as HTMLElement).dataset.action),
				"edit",
			);
			await page.keyboard.press("Enter");
			await page.waitForFunction(() => window.__app.modalKind === "editor");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			assert.equal(
				await note.evaluate((n?: any) => n.contains(document.activeElement)),
				true,
				"closing an editor must not focus a hidden card tool",
			);
		},
	);
	await scenario(
		"Expanded cards return to the same scroll position and focus, including rapid dismissal",
		async (page?: any) => {
			await page.screenshot({
				animations: "disabled",
				path: path.join(artifacts, "desktop-feed.png"),
			});
			await recordLayout(page, 1440);
			await openCard(page, "article-01");
			await page.screenshot({
				animations: "disabled",
				path: path.join(artifacts, "desktop-preview.png"),
			});
			await page.getByRole("button", { name: "关闭预览", exact: true }).click();
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			const title = card(page, "article-03").locator(".card-title-button");
			await title.scrollIntoViewIfNeeded();
			await title.focus();
			const before = await title.evaluate((n?: any) => ({
				y: scrollY,
				top: n.getBoundingClientRect().top,
			}));
			await page.keyboard.press("Enter");
			await page.waitForFunction(() => window.__app.modalKind === "preview");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			const after = await title.evaluate((n?: any) => ({
				y: scrollY,
				top: n.getBoundingClientRect().top,
				focused: document.activeElement === n,
			}));
			assert.ok(
				Math.abs(after.y - before.y) < 3,
				`closing a card moved scroll ${after.y - before.y}px`,
			);
			assert.ok(
				Math.abs(after.top - before.top) < 3,
				`closing a card moved its origin ${after.top - before.top}px`,
			);
			assert.equal(after.focused, true, "preview should return focus to its title trigger");
			assert.equal((await state(page, "article-03")).read, false);
			await page.keyboard.press("Enter");
			await page.waitForFunction(() => window.__app.modalKind === "preview");
			await page.goBack();
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			assert.equal(await title.evaluate((n?: any) => document.activeElement === n), true);
		},
	);
}
