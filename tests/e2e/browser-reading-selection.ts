import assert from "node:assert/strict";
import path from "node:path";

export async function runReadingSelection({
	action,
	artifacts,
	card,
	scenario,
	state,
}: {
	action: any;
	artifacts: any;
	card: any;
	scenario: any;
	state: any;
}) {
	await scenario(
		"Phone search starts at the top, closes back to its home and leaves by Escape",
		async (page?: any) => {
			const trigger = page.locator('#nav [data-extra="search"]');
			await trigger.click();
			await page.locator("#filter-search").waitFor();
			assert.equal(
				await page.locator("#filter-search").evaluate((n?: any) => n === document.activeElement),
				false,
			);
			assert.equal(
				await page.locator(".search-category").count(),
				6,
				"search home shows categories",
			);
			assert.equal(await page.locator(".search-refinements").count(), 0, "no filter row");
			await page.locator("#filter-search").fill("留白");
			await page.locator('#search-results [data-action="card-open"]').first().waitFor();
			// Wait for the search header to finish moving from its home position.
			await page.locator(".search-header").evaluate(async (node: HTMLElement) => {
				await Promise.all(
					node.getAnimations().map((animation) => animation.finished.catch(() => {})),
				);
			});
			// The results page drops the top row, so its field sits at the top.
			const field = await page.locator(".search-header").boundingBox();
			assert.ok(field.y <= 24, "the results field is at the top");
			const chips = await page.locator(".search-chips").boundingBox();
			assert.ok(chips.y >= field.y + field.height, "type chips follow the field");
			assert.equal(
				await page
					.locator(".search-page-heading")
					.evaluate((n?: any) => getComputedStyle(n).opacity),
				"0",
				"the results page hides its top row",
			);
			await page.evaluate(() => {
				document.querySelector<HTMLElement>("#modal").style.setProperty("--kb", "300px");
				document.body.classList.add("keyboard-open");
			});
			const keyboardField = await page.locator(".search-header").boundingBox();
			const results = await page.locator(".search-results").boundingBox();
			assert.ok(Math.abs(keyboardField.y - field.y) < 1, "keyboard does not lift the field");
			assert.ok(results.y + results.height <= 800 - 300, "results stay above the keyboard");
			await page.evaluate(() => {
				document.querySelector<HTMLElement>("#modal").style.removeProperty("--kb");
				document.body.classList.remove("keyboard-open");
			});
			await page.screenshot({
				animations: "disabled",
				path: path.join(artifacts, "search-top-390.png"),
			});
			await page.locator('.search-header [data-action="search-reset"]').click();
			await page.locator(".search-category").first().waitFor();
			assert.equal(await page.evaluate(() => window.__app.searchFilter.query), "");
			await page.keyboard.press("Escape");
			await page.waitForFunction(() => !document.querySelector("dialog").open);
		},
		{ viewport: { width: 390, height: 800 } },
	);
	await scenario(
		"Desktop search lives in the top bar and filters the feed in place",
		async (page?: any) => {
			const homeCount = await page.locator("#feed-grid .feed-card").count();
			assert.equal(
				await page.locator("#nav").evaluate((n?: any) => getComputedStyle(n).display),
				"none",
			);
			await page.keyboard.press("Control+k");
			assert.equal(
				await page.locator("#home-search").evaluate((n?: any) => n === document.activeElement),
				true,
			);
			assert.equal(await page.evaluate(() => window.__app.modalKind === "search"), false);
			await page.locator("#home-search").fill("留白");
			await page.waitForFunction(
				(count: number) => document.querySelectorAll("#feed-grid .feed-card").length < count,
				homeCount,
			);
			assert.equal(await page.locator("#modal").evaluate((n: HTMLDialogElement) => n.open), false);
			await page.keyboard.press("Control+2");
			assert.equal(await page.locator("#home-search-token").textContent(), "未读");
			assert.equal(
				await page.locator("#home-search").inputValue(),
				"留白",
				"text stays beside the tab",
			);
			await page.screenshot({
				animations: "disabled",
				path: path.join(artifacts, "search-top-1440.png"),
			});
			await page.locator("#home-search").focus();
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#home-search").inputValue(), "留白");
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#home-search").inputValue(), "");
			assert.equal(await page.locator("#home-search-token").isVisible(), true);
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#home-search-token").isVisible(), false);
			await page.waitForFunction(
				(count: number) => document.querySelectorAll("#feed-grid .feed-card").length === count,
				homeCount,
			);
		},
		{ viewport: { width: 1440, height: 800 } },
	);
	await scenario(
		"Search keeps home unchanged and reaches archived cards with shared card components",
		async (page?: any) => {
			await page.addInitScript(() => {
				const state = JSON.parse(localStorage.getItem("sill-v1"));
				state.items["old-01"].archived = true;
				localStorage.setItem("sill-v1", JSON.stringify(state));
			});
			await page.reload();
			await page.waitForFunction(() => window.__app);
			assert.equal((await state(page, "old-01")).archived, true);
			const homeCount = await page.locator("#feed-grid .feed-card").count();
			await action(page, "search");
			await page.waitForFunction(() => window.__app.modalKind === "search");
			await page.locator("#filter-search").fill("不存在的关键词");
			await page.waitForFunction(
				() => document.querySelector("#filter-result").textContent === "0 张",
			);
			await page.locator(".search-empty").waitFor();
			await page.keyboard.press("Enter");
			assert.equal(await page.locator("#modal").evaluate((n: HTMLDialogElement) => n.open), true);
			assert.equal(await page.locator("#feed-grid .feed-card").count(), homeCount);
			await page.locator("#filter-search").fill("留白");
			await page.waitForFunction(
				() => document.querySelectorAll("#search-results .feed-card").length === 2,
			);
			assert.equal(await page.locator('#feed-grid [data-card="old-01"]').count(), 0);
			assert.equal(await page.locator('#search-results [data-card="old-01"]').count(), 1);
			await page.locator('[data-action="filter-type"][data-extra="mail"]').click();
			assert.equal(await page.evaluate(() => window.__app.searchFilter.type), "mail");
			assert.equal(await page.evaluate(() => window.__app.filter.type), "all");
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#feed-grid .feed-card").count(), homeCount);
		},
	);
	await scenario(
		"Refresh keeps the reading position, new content waits off the top and state survives reload",
		async (page?: any) => {
			await action(page, "bookmark", "note-01");
			// Start reading after the first-screen entrance, not while card transforms are moving.
			await page.locator("#feed-grid").evaluate(async (node: HTMLElement) => {
				await Promise.all(
					node
						.getAnimations({ subtree: true })
						.map((animation) => animation.finished.catch(() => {})),
				);
			});
			await page.waitForFunction(() => window.__app.layout.frame === 0);
			const target = await page.evaluate(() => {
				const top = Math.min(
					600,
					Math.floor((document.documentElement.scrollHeight - innerHeight) / 2),
				);
				window.scrollTo({ top, behavior: "instant" });
				return top;
			});
			await page.waitForFunction((top) => scrollY === top, target);
			const before = await page.evaluate(() => scrollY);
			assert.ok(before > 40, "refresh starts below the immediate-insertion threshold");
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
		"Read state is color only, stacks open in place and only explicit archive moves cards",
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
				assert.equal(
					await card(page, id).count(),
					1,
					`${id} remains on the desk despite reading or age`,
				);
			await page.addInitScript(() => {
				const state = JSON.parse(localStorage.getItem("sill-v1"));
				state.items["old-01"].archived = true;
				localStorage.setItem("sill-v1", JSON.stringify(state));
			});
			await page.reload();
			await page.waitForFunction(() => window.__app);
			assert.equal((await state(page, "old-01")).archived, true);
			await page.locator('[data-action="archive"][data-extra="read"]').click();
			await page.locator("#modal .list-row", { hasText: "安静的界面" }).hover();
			await page.locator('#modal [data-action="restore-card"][data-id="old-01"]').click();
			await page.keyboard.press("Escape");
			await card(page, "old-01").waitFor();
			await action(page, "toggle-read", "article-01");
			assert.equal(
				await card(page, "article-01").evaluate((n?: any) => n.classList.contains("is-read")),
				true,
			);
		},
	);
}
