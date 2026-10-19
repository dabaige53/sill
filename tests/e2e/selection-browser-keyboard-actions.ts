import assert from "node:assert/strict";

export async function runSelectionKeyboardActions({
	beginLift,
	desktop,
	firstIds,
	phone,
	scenario,
	selectTwo,
	selection,
	snapshot,
	unchanged,
}: {
	beginLift: any;
	desktop: any;
	firstIds: any;
	phone: any;
	scenario: any;
	selectTwo: any;
	selection: any;
	snapshot: any;
	unchanged: any;
}) {
	for (const mobile of [false, true]) {
		await scenario(
			`${mobile ? "Phone" : "Desktop"}: AI drop opens a local-only context window`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, mobile);
				const receiver = await page.locator("#selection-bar .selection-ai-target").boundingBox();
				assert.ok(receiver);
				await gesture.moveTo({
					x: receiver.x + receiver.width / 2,
					y: receiver.y + receiver.height / 2,
				});
				assert.equal(
					await page
						.locator("#selection-bar .selection-ai-target")
						.evaluate((n) => n.classList.contains("is-ready")),
					true,
				);
				await gesture.release();
				await page.locator(".ai-conversation").waitFor();
				assert.equal(await page.locator("[data-ai-context]").count(), 2);
				assert.equal(await page.locator(".selection-drag-count").count(), 0);
				await page.locator("#ai-local-draft").fill("只在本地输入，不发送");
				assert.equal(await page.locator(".ai-conversation button[disabled]").count(), 1);
				await unchanged(page, before);
				await page.locator('#modal [data-action="close"]').click();
				await page.waitForTimeout(250);
				assert.deepEqual(await selection(page), firstIds);
			},
			mobile ? phone : desktop,
		);
	}
	await scenario(
		"Search selection and AI preview preserve the independent home selection",
		async (page) => {
			await page.evaluate(() => window.__app.select("selection-03", { add: true }));
			await page.evaluate(() => window.__app.goTo("search"));
			await page.locator("#filter-search").fill("选择测试");
			await page.waitForTimeout(180);
			const second = page.locator('#search-results [data-card="selection-02"] .card-summary');
			const box = await second.boundingBox();
			assert.ok(box);
			await page.mouse.move(box.x + 20, box.y + 10);
			await page.mouse.down();
			await page.waitForTimeout(440);
			await page.mouse.up();
			assert.deepEqual(await page.evaluate(() => [...window.__app.homeSelected]), ["selection-03"]);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), [
				"selection-02",
			]);
			await page.waitForTimeout(420);
			await page.locator('#search-selection-bar [data-action="selected-ai"]').focus();
			await page.keyboard.press("Enter");
			await page.locator(".ai-conversation").waitFor();
			assert.equal(await page.locator("[data-ai-context]").count(), 1);
			await page.locator('#modal [data-action="close"]').click();
			await page.locator("#modal.search[open] #filter-search").waitFor();
			assert.equal(await page.locator("#filter-search").inputValue(), "选择测试");
			assert.deepEqual(await page.evaluate(() => [...window.__app.homeSelected]), ["selection-03"]);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), [
				"selection-02",
			]);
			await page.keyboard.press("Escape");
			assert.equal(
				await page.locator("#filter-search").isVisible(),
				true,
				"first Escape clears search selection without leaving search",
			);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), []);
			assert.deepEqual(await page.evaluate(() => [...window.__app.homeSelected]), ["selection-03"]);
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#modal[open]").count(), 0);
			assert.deepEqual(await selection(page), ["selection-03"]);
		},
		desktop,
	);
}
