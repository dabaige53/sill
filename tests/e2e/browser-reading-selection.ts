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
	for (const width of [390, 1440]) {
		await scenario(
			`Search starts at the top and restores navigation on exit (${width})`,
			async (page?: any) => {
				const trigger = page.locator('#nav [data-extra="search"]');
				for (const exit of ["close", "Escape"]) {
					await trigger.click();
					await page.locator("#filter-search").waitFor();
					await page.waitForFunction(
						() => getComputedStyle(document.getElementById("dock")).visibility === "hidden",
					);
					assert.equal(
						await page
							.locator("#filter-search")
							.evaluate((n?: any) => n === document.activeElement),
						true,
					);
					const field = await page.locator(".search-header").boundingBox();
					const chips = await page.locator(".search-chips").boundingBox();
					assert.ok(
						field.y < 100 && chips.y >= field.y + field.height,
						"field precedes filters at the top",
					);
					await page.locator("#filter-search").fill("留白");
					await page.locator('#search-results [data-action="card-open"]').first().waitFor();
					if (width < 720) {
						await page.evaluate(() => {
							document.documentElement.style.setProperty("--kb", "300px");
							document.body.classList.add("keyboard-open");
						});
						const keyboardField = await page.locator(".search-header").boundingBox();
						const results = await page.locator(".search-results").boundingBox();
						assert.ok(Math.abs(keyboardField.y - field.y) < 1, "keyboard does not lift the field");
						assert.ok(results.y + results.height <= 800 - 300, "results stay above the keyboard");
						await page.evaluate(() => {
							document.documentElement.style.removeProperty("--kb");
							document.body.classList.remove("keyboard-open");
						});
					}
					assert.equal(
						await page.locator("#dock").evaluate((n?: any) => getComputedStyle(n).visibility),
						"hidden",
						"capsule stays hidden without keyboard",
					);
					await page.screenshot({
						animations: "disabled",
						path: path.join(artifacts, `search-top-${width}.png`),
					});
					if (exit === "close") await page.locator('.search-header [data-action="close"]').click();
					else await page.keyboard.press("Escape");
					await page.waitForFunction(
						() =>
							!document.querySelector("dialog").open &&
							getComputedStyle(document.getElementById("dock")).visibility === "visible",
					);
				}
			},
			{ viewport: { width, height: 800 } },
		);
	}
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
			await page.keyboard.press("Control+k");
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
