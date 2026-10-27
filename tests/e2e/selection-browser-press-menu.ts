import assert from "node:assert/strict";
import { icon } from "../../apps/web/atoms/icons.ts";

export async function runSelectionPressMenu({
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
}: {
	beginLift: any;
	desktop: any;
	firstIds: any;
	isMenuOpen: any;
	phone: any;
	point: any;
	scenario: any;
	selectTwo: any;
	selection: any;
	snapshot: any;
	touch: any;
	unchanged: any;
}) {
	for (const options of [desktop, phone]) {
		await scenario(
			`${options === phone ? "Phone" : "Desktop"}: direct icon actions replace ellipsis, select-all, and menu buttons`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				assert.equal(
					await page
						.locator(
							'[data-action="card-more"],.card-more-trigger,[data-action="select-all"],[data-action="selection-menu"]',
						)
						.count(),
					0,
				);
				assert.deepEqual(
					await page
						.locator("#selection-bar button")
						.evaluateAll((buttons: HTMLElement[]) =>
							buttons.map((button) => button.dataset.action),
						),
					[
						"selected-bookmark",
						"selected-later",
						"selected-tag",
						"selected-ai",
						"clear-selection",
						"selected-ai",
					],
				);
				for (const [action, glyph] of [
					["bookmark", "bookmark"],
					["later", "glasses"],
					["tag", "tag"],
				]) {
					const button = page.locator(`[data-action="selected-${action}"]`);
					assert.equal(
						await button.evaluate((node: HTMLElement, expected: string) => {
							const template = document.createElement("template");
							template.innerHTML = expected;
							return node.innerHTML === template.innerHTML;
						}, icon(glyph)),
						true,
						`${action} uses its approved icon`,
					);
					assert.ok(await button.getAttribute("aria-label"));
				}
				await page.locator('[data-action="selected-later"]').click({ button: "right" });
				assert.equal(await page.locator("#selection-menu,.card-more-menu").count(), 0);
				await unchanged(page, before);
			},
			options,
		);
	}
	for (const action of ["bookmark", "later", "tag"]) {
		await scenario(
			`Direct ${action} button reuses the bulk action without a menu`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await page.locator(`[data-action="selected-${action}"]`).click();
				assert.equal(await isMenuOpen(page), false);
				assert.deepEqual(await selection(page), []);
				if (action === "tag") {
					await page.locator("#tag-new").waitFor();
					assert.deepEqual(await snapshot(page), before, "opening tags must not write");
					await page.locator("#tag-new").fill("直接标签");
					await page.locator('[data-action="save-note"]').click();
					await page.waitForFunction(
						() => !(document.querySelector("#modal") as HTMLDialogElement).open,
					);
					for (const id of firstIds)
						assert.deepEqual((await snapshot(page)).items[id].tags, ["直接标签"]);
				} else {
					const after = await snapshot(page),
						key = action === "bookmark" ? "bookmarked" : "later";
					for (const id of firstIds) {
						assert.equal(after.items[id][key], true);
						assert.deepEqual(
							{ ...after.items[id], [key]: before.items[id][key] },
							before.items[id],
						);
					}
				}
				const after = await snapshot(page);
				assert.deepEqual(after.cards, before.cards);
				assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
				assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
			},
			phone,
		);
	}

	await scenario(
		"Phone stationary long press selects; tapping a second card adds it",
		async (page) => {
			const before = await snapshot(page),
				p = await point(page);
			const session = await page.context().newCDPSession(page);
			await touch(session, "touchStart", p);
			await page.waitForTimeout(440);
			await touch(session, "touchEnd");
			assert.deepEqual(await selection(page), [firstIds[0]]);
			assert.equal(await isMenuOpen(page), false);
			assert.equal(await page.locator(".selection-lift").count(), 0);
			await page.waitForTimeout(420);
			await page.locator('[data-card="selection-02"] .card-summary').tap();
			await unchanged(page, before);
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				false,
			);
		},
		phone,
	);
	for (const mobile of [false, true]) {
		await scenario(
			`${mobile ? "Phone" : "Desktop"}: held selection stays in place`,
			async (page) => {
				const before = await snapshot(page);
				const gesture = await beginLift(page, mobile);
				assert.equal(
					await page.locator(".is-drag-source,.selection-lift,.selected-tick").count(),
					0,
				);
				assert.equal(
					await page
						.locator('[data-card="selection-01"]')
						.evaluate((n) => n.classList.contains("is-selected")),
					true,
				);
				await gesture.release();
				assert.equal(await isMenuOpen(page), false);
				await page.waitForTimeout(420);
				const second = page.locator('[data-card="selection-02"] .card-summary');
				if (mobile) await second.tap();
				else await second.click();
				assert.deepEqual(await selection(page), firstIds);
				const repeated = await beginLift(page, mobile);
				await repeated.release();
				assert.equal(await isMenuOpen(page), false);
				await unchanged(page, before);
				await page.waitForTimeout(420);
				await page.locator('[data-action="clear-selection"]').click();
				assert.equal(
					await page.locator("#selection-bar").evaluate((n: HTMLElement) => n.inert),
					true,
				);
				await page.waitForTimeout(220);
				assert.equal(await page.locator("#selection-bar").isVisible(), false);
			},
			mobile ? phone : desktop,
		);
	}
	for (const dismissal of ["Escape", "touchcancel", "blur", "resize"]) {
		await scenario(
			`Active phone lift ${dismissal} leaves no menu or stuck visual`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, true);
				if (dismissal === "Escape") await page.keyboard.press("Escape");
				if (["blur", "resize"].includes(dismissal))
					await page.evaluate((type: string) => window.dispatchEvent(new Event(type)), dismissal);
				await gesture.cancel();
				assert.equal(await isMenuOpen(page), false);
				assert.equal(
					await page.locator(".selection-lift,.is-drag-source,body.is-dragging").count(),
					0,
				);
				await unchanged(page, before);
			},
			phone,
		);
	}
	for (const action of ["bookmark", "later"]) {
		await scenario(
			`Only explicit ${action} changes the two selected cards`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await unchanged(page, before);
				await page.locator(`[data-action="selected-${action}"]`).click();
				const after = await snapshot(page),
					key = action === "bookmark" ? "bookmarked" : "later";
				assert.deepEqual(after.cards, before.cards);
				for (const id of firstIds) {
					assert.equal(after.items[id][key], true);
					assert.deepEqual({ ...after.items[id], [key]: before.items[id][key] }, before.items[id]);
				}
				assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
				assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
				assert.deepEqual(await selection(page), firstIds);
			},
			phone,
		);
	}
	await scenario(
		"Tag action opens the existing bulk editor and saves only on request",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page);
			await page.locator('[data-action="selected-tag"]').click();
			await page.locator("#tag-new").waitFor();
			assert.equal(await isMenuOpen(page), false);
			assert.deepEqual(await snapshot(page), before, "opening tags must not write");
			await page.locator("#tag-new").fill("测试标签");
			assert.deepEqual(await snapshot(page), before, "typing a tag must not write");
			await page.locator('[data-action="save-note"]').click();
			await page.waitForFunction(
				() => !(document.querySelector("#modal") as HTMLDialogElement).open,
			);
			const after = await snapshot(page);
			for (const id of firstIds) assert.deepEqual(after.items[id].tags, ["测试标签"]);
			assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
			assert.deepEqual(after.cards, before.cards);
			assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
		},
	);
	await scenario(
		"Selected cards allow short touch scrolling and suppress pull refresh",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page),
				session = await page.context().newCDPSession(page);
			await touch(session, "touchStart", { x: 190, y: 400 });
			for (let i = 1; i <= 6; i++) {
				await touch(session, "touchMove", { x: 190, y: 400 - i * 32 });
				await page.waitForTimeout(20);
			}
			await touch(session, "touchEnd");
			await page.waitForTimeout(250);
			assert.ok(
				await page.evaluate(() => scrollY > 30),
				"normal touch movement should scroll the feed",
			);
			assert.equal(await isMenuOpen(page), false);
			assert.equal(await page.locator(".selection-lift").count(), 0);
			await page.evaluate(() => scrollTo(0, 0));
			await page.waitForTimeout(100);
			await touch(session, "touchStart", { x: 190, y: 210 });
			await touch(session, "touchMove", { x: 190, y: 430 });
			await touch(session, "touchEnd");
			await page.waitForTimeout(500);
			assert.equal(await page.evaluate(() => window.__selectionProbe.refreshes), 0);
			assert.equal(
				await page
					.locator("body")
					.evaluate((node: HTMLElement) => node.classList.contains("is-pulling")),
				false,
			);
			await unchanged(page, before);
		},
		phone,
	);
	await scenario(
		"Selected cards suppress wheel refresh and card native drag payloads",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page);
			await page.mouse.move(300, 100);
			await page.mouse.wheel(0, -240);
			await page.waitForTimeout(500);
			assert.equal(await page.evaluate(() => window.__selectionProbe.refreshes), 0);
			const native = await page
				.locator('[data-card="selection-01"]')
				.evaluate((node: HTMLElement) => {
					const dataTransfer = new DataTransfer();
					const event = new DragEvent("dragstart", {
						bubbles: true,
						cancelable: true,
						dataTransfer,
					});
					node.dispatchEvent(event);
					return {
						prevented: event.defaultPrevented,
						types: [...dataTransfer.types],
						text: dataTransfer.getData("text/plain"),
					};
				});
			assert.deepEqual(native, { prevented: true, types: [], text: "" });
			await unchanged(page, before);
		},
	);
}
