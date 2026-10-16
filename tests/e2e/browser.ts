import { createRequire as createNodeRequire } from "node:module";

const require = createNodeRequire(import.meta.url);

/** Real browser regression checks. Run against an isolated localhost origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const load = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
	? createRequire(
			path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json"),
		)
	: require;
const { chromium } = load("playwright");
const artifacts = path.join(import.meta.dirname, "../artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const pages = new Set<any>(["/index.html"]);
const server = http.createServer((req?: any, res?: any) => {
	const file = (req.url || "").split("?")[0];
	if (!pages.has(file)) {
		res.writeHead(404);
		return res.end();
	}
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
	res.end(fs.readFileSync(path.join(root, "dist/web", file.slice(1))));
});
const results = [];
const layoutMetrics = [];
async function recordLayout(page?: any, width?: any) {
	layoutMetrics.push({
		viewport: width,
		cards: await page.locator(".feed-card").evaluateAll((nodes?: any) =>
			nodes.map((n?: any) => {
				const r = n.getBoundingClientRect();
				return { id: n.dataset.card, width: Math.round(r.width), height: Math.round(r.height) };
			}),
		),
	});
	fs.writeFileSync(
		path.join(artifacts, "v05-layout-metrics.json"),
		JSON.stringify(layoutMetrics, null, 2),
	);
}
(async () => {
	await new Promise((resolve?: any) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	let browser: any;
	try {
		browser = await chromium.launch({
			headless: true,
			...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		});
		async function scenario(name?: any, fn?: any, options: any = {}, entry: any = "/index.html") {
			const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
				...options,
			});
			const page = await context.newPage(),
				errors = [],
				external = [];
			page.on("pageerror", (e?: any) => errors.push(e.message));
			await context.route("**/*", (route?: any) => {
				const url = route.request().url();
				if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
				external.push(url);
				return route.abort();
			});
			try {
				await page.goto(origin + entry);
				await page.waitForFunction(() => window.__app);
				await fn(page, context);
				assert.deepEqual(errors, []);
				assert.deepEqual(external, []);
				results.push({ name, status: "PASS" });
				console.log("PASS", name);
			} catch (e) {
				const screenshot = `failure-${results.length + 1}.png`;
				await page
					.screenshot({ animations: "disabled", path: path.join(artifacts, screenshot) })
					.catch(() => {});
				results.push({
					name,
					status: "FAIL",
					error: e.message,
					screenshot,
					pageErrors: errors,
					externalRequests: external,
				});
				console.error("FAIL", name, e.message);
			} finally {
				await context.close();
			}
		}
		const action = (page?: any, name?: any, id: any = "", extra: any = "") =>
			page.evaluate(
				([name, id, extra]: any) => window.__app.action(name, id, extra),
				[name, id, extra],
			);
		const state = (page?: any, id?: any) =>
			page.evaluate((id?: any) => JSON.parse(localStorage.getItem("sill-v1")).items[id], id);
		const card = (page?: any, id?: any) => page.locator(`[data-card="${id}"]`);
		const openCard = (page?: any, id?: any) => card(page, id).locator(".card-title-button").click();
		const feedUnopened = async (page?: any, id?: any) => {
			assert.equal(
				await page.locator("dialog").evaluate((n?: any) => n.open),
				false,
				"inline action opened a dialog",
			);
			assert.equal(
				await page.evaluate(() => location.hash),
				"#feed",
				"inline action changed the route",
			);
			const item = await state(page, id);
			assert.equal(item?.seen || false, false, "inline action marked the card as seen");
			assert.equal(item?.read || false, false, "inline action marked the card as read");
		};
		const touchTargets = async (locator?: any, width?: any) => {
			const boxes = await locator.evaluateAll((nodes?: any) =>
				nodes.map((n?: any) => {
					const r = n.getBoundingClientRect();
					return {
						label: n.getAttribute("aria-label") || n.textContent,
						width: r.width,
						height: r.height,
						left: r.left,
						right: r.right,
					};
				}),
			);
			assert.ok(boxes.length > 0, "no touch actions found");
			assert.ok(
				boxes.every(
					(r?: any) => r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= width,
				),
				JSON.stringify(boxes),
			);
		};
		const filter = (page?: any, status?: any) => action(page, "filter-status", "", status);
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
				await page.locator('dialog [data-action="bookmark"]').click();
				assert.equal((await state(page, "article-01")).bookmarked, true);
				assert.equal(
					await page.locator("#toast").isVisible(),
					false,
					"a single flag needs no toast",
				);
				await page.locator('dialog [data-action="bookmark"]').click();
				assert.equal((await state(page, "article-01")).bookmarked, false);
				await page.locator('dialog [data-action="reader"]').click();
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
			"Snooze survives reload, queues once, waits during reading and reappears on demand",
			async (page?: any) => {
				await page.clock.install();
				await action(page, "preview", "reminder-01");
				await page
					.locator("dialog")
					.getByRole("button", { name: "延后十分钟", exact: true })
					.click();
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 0);
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
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 0);
				await page.keyboard.press("Escape");
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				await page.locator("#new-count").click();
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
				await page.clock.fastForward(120000);
				assert.equal(await page.locator("#new-count").isVisible(), false);
				await page.reload();
				assert.equal(await page.locator("#new-count").isVisible(), false);
			},
		);
		await scenario(
			"Dismiss, completion, status recovery and undo use accessible actions",
			async (page?: any) => {
				await action(page, "preview", "reminder-01");
				await page
					.locator("dialog")
					.getByRole("button", { name: "忽略此提醒", exact: true })
					.click();
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 0);
				await page.getByRole("button", { name: "撤销操作", exact: true }).click();
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
				await action(page, "preview", "reminder-01");
				await page.locator("dialog").getByRole("button", { name: "完成提醒", exact: true }).click();
				await filter(page, "done");
				assert.equal(await page.locator(".feed-card").count(), 1);
				await openCard(page, "reminder-01");
				await page.locator("dialog").getByRole("button", { name: "恢复提醒", exact: true }).click();
				await action(page, "clear-filter");
				assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
			},
		);
		await scenario(
			"Inline reminder actions work by keyboard without opening or reading the card",
			async (page?: any) => {
				const reminder = card(page, "reminder-01");
				await reminder.locator('[data-action="complete-reminder"]').focus();
				await page.keyboard.press("Enter");
				assert.equal((await state(page, "reminder-01")).reminderDone, true);
				assert.equal(await reminder.count(), 0);
				await feedUnopened(page, "reminder-01");
				assert.equal(
					await page.evaluate(() => document.activeElement !== document.body),
					true,
					"removing the active card lost keyboard focus",
				);
				await page.getByRole("button", { name: "撤销操作", exact: true }).click();
				assert.equal((await state(page, "reminder-01")).reminderDone, false);
				assert.equal(await reminder.count(), 1);
				assert.equal(
					await page.evaluate(() => document.activeElement !== document.body),
					true,
					"undo lost keyboard focus",
				);
				await reminder.locator('[data-action="snooze"]').focus();
				await page.keyboard.press("Space");
				assert.ok(
					(await state(page, "reminder-01")).snoozedUntil > (await page.evaluate(() => Date.now())),
				);
				assert.equal(await reminder.count(), 0);
				await feedUnopened(page, "reminder-01");
				await page.getByRole("button", { name: "撤销操作", exact: true }).click();
				assert.equal((await state(page, "reminder-01")).snoozedUntil, 0);
				assert.equal(await reminder.count(), 1);
			},
		);
		await scenario(
			"Card menus close on Escape and outside click, and keep actions separate from preview",
			async (page?: any) => {
				const note = card(page, "note-01"),
					more = note.locator('[data-action="card-more"]');
				await note.focus();
				await more.focus();
				await page.keyboard.press("Enter");
				assert.equal(await page.locator(".card-more-menu").count(), 1);
				assert.equal(await more.getAttribute("aria-expanded"), "true");
				await page.keyboard.press("Escape");
				assert.equal(await page.locator(".card-more-menu").count(), 0);
				assert.equal(
					await more.evaluate((n?: any) => document.activeElement === n),
					true,
					"Escape should return to the card menu trigger",
				);
				assert.equal(await more.getAttribute("aria-expanded"), "false");
				await feedUnopened(page, "note-01");
				await more.click();
				await card(page, "article-01").hover();
				await card(page, "article-01").locator('[data-action="card-more"]').click();
				assert.equal(await page.locator(".card-more-menu").count(), 1);
				assert.equal(await note.locator(".card-more-menu").count(), 0);
				await page.mouse.click(3, 3);
				assert.equal(await page.locator(".card-more-menu").count(), 0);
				await note.hover();
				await more.click();
				await note.locator('.card-more-menu [data-action="later"]').click();
				assert.equal((await state(page, "note-01")).later, true);
				assert.equal(await page.locator(".card-more-menu").count(), 0);
				await feedUnopened(page, "note-01");
				assert.equal(
					await more.evaluate((n?: any) => document.activeElement === n),
					true,
					"a menu action should preserve a usable focus target",
				);
				await page.mouse.move(3, 3);
				await note.focus();
				await more.focus();
				await page.keyboard.press("Enter");
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
		await scenario(
			"Search filters the desk live, reaches archived cards and clears in one step",
			async (page?: any) => {
				await page.keyboard.press("Control+k");
				await page.waitForFunction(() => window.__app.modalKind === "search");
				await page.locator("#filter-search").fill("不存在的关键词");
				await page.waitForFunction(
					() => document.querySelector("#filter-result").textContent === "0 张",
				);
				await page.locator(".search-empty").waitFor();
				await page.keyboard.press("Enter");
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				assert.equal(await page.locator(".empty-card").count(), 1);
				assert.equal(
					await page.locator("#dock").evaluate((n?: any) => n.classList.contains("filter-active")),
					true,
				);
				await action(page, "clear-filter");
				assert.ok((await page.locator(".feed-card").count()) > 10);
				await action(page, "search");
				await page.locator("#filter-search").fill("留白");
				await page.waitForFunction(
					() => document.querySelectorAll('#search-results [data-action="card-open"]').length === 2,
				);
				assert.equal(await page.locator("#search-results mark").first().textContent(), "留白");
				assert.match(await page.locator("#search-results").textContent(), /已收起/);
				await page.locator('[data-action="filter-type"][data-extra="mail"]').click();
				assert.equal(await page.evaluate(() => window.__app.filter.type), "mail");
				await page.keyboard.press("Escape");
				await action(page, "clear-filter");
			},
		);
		await scenario(
			"Refresh keeps the reading position, new content waits off the top and state survives reload",
			async (page?: any) => {
				await action(page, "bookmark", "note-01");
				await page.evaluate(() => window.scrollTo(0, 600));
				await page.waitForTimeout(50);
				const before = await page.evaluate(() => scrollY);
				await action(page, "refresh");
				await page.locator("#new-count").waitFor();
				assert.ok(
					Math.abs((await page.evaluate(() => scrollY)) - before) < 3,
					"refresh moved the reading position",
				);
				assert.equal(
					await page.locator('[data-card="fresh-reminder"]').count(),
					0,
					"new content jumped into the desk",
				);
				await page.locator("#new-count").click();
				await page.locator('[data-card="fresh-reminder"]').waitFor();
				await page.reload();
				assert.equal((await state(page, "note-01")).bookmarked, true);
				assert.equal(await page.locator('[data-card="fresh-reminder"]').count(), 1);
			},
		);
		await scenario(
			"Read state is color only, stacks open in place and time moves cards to the shelves",
			async (page?: any) => {
				assert.equal(
					await card(page, "article-04").evaluate((n?: any) => n.classList.contains("is-read")),
					true,
				);
				assert.equal(
					await card(page, "article-01").evaluate((n?: any) => n.classList.contains("is-read")),
					false,
				);
				assert.doesNotMatch(
					await page.locator(".is-read").first().innerText(),
					/已读/,
					"read state is the card's color, not a label",
				);
				assert.match(await page.locator(".is-read").first().getAttribute("aria-label"), /已读/);
				assert.equal(
					await page.locator('[data-card^="sspai-"]').count(),
					0,
					"a burst from one source should be stacked",
				);
				await page.locator("[data-stack] .card-title-button").click();
				assert.equal(await page.locator('[data-stack-open] [data-card^="sspai-"]').count(), 6);
				await page.locator('[data-action="stack-close"]').click();
				assert.equal(await page.locator("[data-stack]").count(), 1);
				for (const id of ["old-01", "old-03"])
					assert.equal(await card(page, id).count(), 0, id + " should have left the desk");
				await page.locator('[data-action="archive"][data-extra="read"]').click();
				await page.locator("dialog .list-row", { hasText: "安静的界面" }).hover();
				await page.locator('dialog [data-action="restore-card"][data-id="old-01"]').click();
				await page.keyboard.press("Escape");
				await card(page, "old-01").waitFor();
				await action(page, "toggle-read", "article-01");
				assert.equal(
					await card(page, "article-01").evaluate((n?: any) => n.classList.contains("is-read")),
					true,
				);
			},
		);
		const rect = (page?: any, selector?: any) =>
			page.locator(selector).evaluate((n?: any) => n.getBoundingClientRect().toJSON());
		await scenario(
			"Bottom rail, selection, drop targets, refresh and stacked previews share one rule",
			async (page?: any) => {
				const ids = await page.evaluate(() =>
					[...document.querySelectorAll("#feed-grid [data-card]")].map((n?: any) => n.dataset.card),
				);
				const mod = process.platform === "darwin" ? "Meta" : "Control";
				const inside = () =>
					card(page, ids[0]).evaluate((n?: any) => {
						const a = n.querySelector(".card-title").getBoundingClientRect(),
							b = n.getBoundingClientRect();
						return [Math.round(a.left - b.left), Math.round(a.top - b.top)];
					});
				const before = await inside();
				await card(page, ids[0]).click({ modifiers: [mod] });
				await card(page, ids[1]).click({ modifiers: ["Shift"] });
				assert.equal(await page.locator("dialog").evaluate((n?: any) => n.open), false);
				assert.equal(await page.evaluate(() => window.__app.selected.size), 2);
				assert.deepEqual(await inside(), before, "selecting moved the card's content");
				const bar = await rect(page, "#selection-bar"),
					orb = await rect(page, "#orb");
				assert.ok(bar.right <= orb.left, "selection bar overlaps the orb");
				assert.equal(Math.round(bar.bottom), Math.round(orb.bottom), "rail rows differ");
				assert.equal(Math.round(bar.height), Math.round(orb.height), "rail rows differ");
				await page.evaluate(() => window.__app.toast("撤销测试", () => {}));
				const toast = await rect(page, "#toast");
				assert.ok(toast.bottom <= bar.top, "toast overlaps the selection bar");
				await card(page, ids[2]).click();
				assert.equal(await page.evaluate(() => window.__app.selected.size), 3);
				await page.locator('[data-action="select-all"]').click();
				assert.equal(await page.evaluate(() => window.__app.selected.size), ids.length);
				await page.keyboard.press("Escape");
				assert.equal(await page.evaluate(() => window.__app.selected.size), 0);
				assert.equal(await page.locator("#selection-bar").isVisible(), false);
				const start = await card(page, ids[0]).boundingBox(),
					x = start.x + 60,
					y = start.y + start.height - 30;
				await page.mouse.move(x, y);
				await page.mouse.down();
				await page.mouse.move(x + 20, y + 10, { steps: 4 });
				const targets = await rect(page, "#drop-targets");
				assert.ok(
					Math.hypot(
						targets.left + targets.width / 2 - (x + 20),
						targets.top + targets.height / 2 - (y + 10),
					) < 160,
					"drop targets are far from the pointer",
				);
				assert.ok(targets.top > y + 10, "drop targets open below the pointer");
				await page.keyboard.press("Escape");
				await page.mouse.up();
				await action(page, "refresh");
				await page.waitForFunction(() =>
					document.getElementById("dock").classList.contains("is-done"),
				);
				const relation = await page.evaluate(
					() => (document.querySelector(".type-suggestion") as HTMLElement)?.dataset.card,
				);
				assert.doesNotMatch(await card(page, relation).locator(".card-head").innerText(), /张卡/);
				await openCard(page, relation);
				await page.locator('dialog .refs [data-action="card-open"]').first().click();
				await page.waitForFunction((id?: any) => window.__app.currentId !== id, relation);
				assert.equal(await page.locator("dialog .sheet-peek").count(), 1);
				await page.locator('dialog .float-bar [data-action="close"]').click();
				await page.waitForFunction((id?: any) => window.__app.currentId === id, relation);
				assert.equal(await page.locator("dialog").evaluate((n?: any) => n.open), true);
				assert.equal(await page.locator("dialog .sheet-peek").count(), 0);
				await page.locator('dialog .refs [data-action="card-open"]').first().click();
				await page.waitForFunction(() => !!document.querySelector("dialog .sheet-peek"));
				await page.mouse.click(8, 8);
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				assert.equal(await page.evaluate(() => location.hash), "#feed");
			},
		);
		await scenario(
			"Phone selection takes the whole rail and the toast rises above it",
			async (page?: any) => {
				const id = await page.evaluate(
					() => (document.querySelector("#feed-grid [data-card]") as HTMLElement).dataset.card,
				);
				await action(page, "select", id);
				const bar = await rect(page, "#selection-bar");
				assert.ok(bar.left >= 0 && bar.right <= 390, "selection bar leaves the screen");
				assert.equal(await page.locator(".orb-wrap").isVisible(), false);
				await page.evaluate(() => window.__app.alert("无法导入"));
				const toast = await rect(page, "#toast");
				assert.ok(toast.bottom <= bar.top, "toast overlaps the selection bar");
				await page.waitForTimeout(3600);
				assert.equal(await page.locator("#toast").isVisible(), true, "an alert closed by itself");
				await page.locator('#toast [data-action="toast-close"]').click();
				await page.waitForFunction(() => document.getElementById("toast").hidden);
			},
			{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
		);
		await scenario(
			"Capture, paste and file import add cards on this device with dedupe and undo",
			async (page?: any) => {
				await page.keyboard.press("n");
				await page.waitForFunction(() => window.__app.modalKind === "capture");
				await page.locator("#capture-text").fill("明天把叠卡阈值再看一遍");
				await page.locator('[data-action="capture-save"]').click();
				await page.getByText("明天把叠卡阈值再看一遍").first().waitFor();
				await page.evaluate(() => window.__app.capture("https://example.com/post 一篇想读的文章"));
				assert.equal(await page.locator(".feed-card", { hasText: "一篇想读的文章" }).count(), 1);
				await page.evaluate(() => window.__app.capture("https://example.com/post 一篇想读的文章"));
				assert.equal(
					await page.locator(".feed-card", { hasText: "一篇想读的文章" }).count(),
					1,
					"the same link must merge",
				);
				const opml =
					'<?xml version="1.0"?><opml version="1.0"><body><outline text="少数派" xmlUrl="https://sspai.com/feed"/><outline text="阅读手记" xmlUrl="https://example.com/rss"/></body></opml>';
				await page
					.locator("#file-input")
					.setInputFiles([{ name: "feeds.opml", mimeType: "text/xml", buffer: Buffer.from(opml) }]);
				await page.waitForFunction(() => window.__app.modalKind === "import");
				assert.match(await page.locator("dialog").textContent(), /2.*RSS 订阅/);
				await page.locator('[data-action="import-run"]').click();
				await page.waitForFunction(() => !document.querySelector("dialog").open);
				assert.equal(await page.evaluate(() => __store.source("src-rss").count), 44);
				const notes = "# 窗台随记\n\n第一段。\n\n第二段。";
				const ics =
					"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20991012T063000Z\r\nDTEND:20991012T071500Z\r\nSUMMARY:导入的评审会\r\nLOCATION:3 楼\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
				await page
					.locator("#file-input")
					.setInputFiles([
						{ name: "note.md", mimeType: "text/markdown", buffer: Buffer.from(notes) },
					]);
				await page.waitForFunction(() => window.__app.modalKind === "import");
				await page.locator('[data-action="import-run"]').click();
				await page.locator(".feed-card", { hasText: "窗台随记" }).waitFor();
				await page
					.locator("#file-input")
					.setInputFiles([
						{ name: "cal.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) },
					]);
				await page.waitForFunction(() => window.__app.modalKind === "import");
				await page.locator('[data-action="import-run"]').click();
				await page.locator(".feed-card", { hasText: "导入的评审会" }).waitFor();
				const duplicateUrl = await page.evaluate(
					() => __store.state.cards.find((c?: any) => c.url).url,
				);
				const csv = `title,url,highlight\n同一链接,${duplicateUrl},重复的一篇\n新的一篇,https://example.com/new,一段高亮`;
				await page
					.locator("#file-input")
					.setInputFiles([
						{ name: "readwise.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
					]);
				await page.waitForFunction(() => window.__app.modalKind === "import");
				await page.locator('[data-action="import-range"][data-extra="all"]').click();
				await page.locator('[data-action="import-run"]').click();
				await page.getByText("跳过 1 张重复", { exact: false }).waitFor();
				await page.reload();
				assert.equal(await page.locator(".feed-card", { hasText: "新的一篇" }).count(), 1);
			},
		);
		await scenario("Settings, sources and first run work end to end", async (page?: any) => {
			await action(page, "settings");
			await page.locator('[data-action="pref-toggle"][data-id="stack"]').click();
			assert.ok(
				(await page.locator('[data-card^="sspai-"]').count()) > 0,
				"turning stacking off should unfold the burst",
			);
			await page.locator('[data-action="settings-group"][data-extra="look"]').click();
			await page.locator('[data-action="pref"][data-id="theme"][data-extra="dark"]').click();
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
			await page.locator('[data-action="settings-group"][data-extra="sources"]').click();
			await page.locator('[data-action="source-toggle"][data-id="src-rss"]').click();
			assert.equal(await page.evaluate(() => __store.source("src-rss").status), "paused");
			await page.locator('[data-action="source-open"][data-id="src-readwise"]').click();
			await page
				.locator('[data-action="source-set"][data-id="src-readwise:open"][data-extra="web"]')
				.click();
			assert.equal(await page.evaluate(() => __store.source("src-readwise").open), "web");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => window.__app.modalKind === "settings");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			await page.reload();
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
			await action(page, "clear-all");
			await page.locator('[data-action="clear-confirm"]').click();
			await page.locator(".welcome").waitFor();
			assert.equal(await page.locator(".feed-card").count(), 0);
			await page.locator('[data-action="welcome-start"]').click();
			await page.locator('[data-action="welcome-pick"][data-extra="photos"]').click();
			await page.locator('[data-action="welcome-continue"]').click();
			await page.waitForFunction(() => window.__app.modalKind === "permission");
			await page.locator('[data-action="permission-allow"]').click();
			await page.locator('[data-action="permission-allow"]').click();
			await page.waitForFunction(() => !document.querySelector("dialog").open);
			assert.equal(await page.evaluate(() => __store.source("src-photos")?.status), "attention");
			await page.locator('[data-action="welcome-demo"]').click();
			await page.locator('[data-card="article-01"]').waitFor();
		});
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
					// Sill columns are 280-380px; the first-screen entry (scale .985) may still be settling.
					assert.ok(
						geometry.every((r?: any) => r.width >= 275 && r.width <= 380),
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
		for (const width of [390, 320])
			await scenario(
				`${width}px touch layout, reminder controls and reduced motion`,
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
					await touchTargets(
						reminder.locator(".reminder-actions button,.card-more-trigger"),
						width,
					);
					await reminder.locator('[data-action="card-more"]').tap();
					await touchTargets(page.locator(".card-more-menu button"), width);
					await page.waitForTimeout(240);
					await touchTargets(page.locator(".card-more-menu button"), width);
					await page.screenshot({
						animations: "disabled",
						path: path.join(artifacts, `mobile-card-actions-${width}.png`),
					});
					await page.touchscreen.tap(3, 3);
					assert.equal(await page.locator(".card-more-menu").count(), 0);
					await reminder.locator('[data-action="snooze"]').tap();
					assert.equal(await reminder.count(), 0);
					await feedUnopened(page, "reminder-01");
					await page.getByRole("button", { name: "撤销操作", exact: true }).tap();
					assert.equal(await reminder.count(), 1);
					await page.locator("#orb").tap();
					await page.getByRole("button", { name: "筛选与搜索", exact: true }).tap();
					await page.waitForFunction(() => window.__app.modalKind === "search");
					await page.screenshot({
						animations: "disabled",
						path: path.join(artifacts, `filter-${width}.png`),
					});
					await page.keyboard.press("Escape");
					await page.waitForFunction(() => !document.querySelector("dialog").open);
					await action(page, "preview", "reminder-01");
					const controls = page.locator("dialog .icon-button");
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
						.locator("dialog")
						.getByRole("button", { name: "延后十分钟", exact: true })
						.tap();
					await filter(page, "snoozed");
					assert.equal(await page.locator('[data-card="reminder-01"]').count(), 1);
					await action(page, "clear-filter");
					await action(page, "card-open", "article-01");
					await page.screenshot({
						animations: "disabled",
						path: path.join(artifacts, `preview-${width}.png`),
					});
					const bar = await page.locator("dialog .float-bar").boundingBox();
					assert.ok(bar.x >= 0 && bar.x + bar.width <= width, "toolbar overflows the phone");
				},
				{
					viewport: { width, height: 844 },
					isMobile: true,
					hasTouch: true,
					reducedMotion: "reduce",
				},
			);
		await scenario(
			"Desktop drag cancellation preserves cards and read state",
			async (page?: any) => {
				const box = await card(page, "article-01").locator(".card-head").boundingBox();
				const x = box.x + box.width / 2,
					y = box.y + box.height / 2;
				await page.mouse.move(x, y);
				await page.mouse.down();
				await page.mouse.move(x + 30, y + 30, { steps: 3 });
				await page.keyboard.press("Escape");
				await page.mouse.up();
				assert.equal((await state(page, "article-01"))?.seen || false, false);
				assert.equal(await page.locator('[data-card="article-01"]').count(), 1);
			},
		);
		const failed = results.filter((result?: any) => result.status === "FAIL");
		if (failed.length)
			assert.fail(
				`${failed.length}/${results.length} browser scenarios failed: ${failed.map((result?: any) => result.name).join("; ")}`,
			);
	} finally {
		fs.writeFileSync(
			path.join(artifacts, "browser-results.json"),
			JSON.stringify(results, null, 2) + "\n",
		);
		if (browser) await browser.close();
		await new Promise((resolve?: any) => server.close(resolve));
	}
})().catch((error?: any) => {
	console.error(error);
	process.exitCode = 1;
});
