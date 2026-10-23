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
	for (const width of [822, 1512])
		await scenario(
			`Desktop ${width}: bars hide down and return up`,
			async (page) => {
				if (width === 1512)
					assert.equal(await page.locator("#feed-grid").getAttribute("data-columns"), "4");
				// The top bar slides up and the dock fades (dur-tuck 240ms); both end inert and invisible.
				// Both come back together on dur-reveal 420ms.
				const bars = (hidden: boolean) =>
					page.waitForFunction(
						(hidden: boolean) =>
							["#home-top", "#dock"].every((selector) => {
								const el = document.querySelector(selector) as HTMLElement,
									style = getComputedStyle(el);
								return hidden
									? el.inert && (style.opacity === "0" || style.visibility === "hidden")
									: !el.inert && style.opacity === "1" && style.visibility === "visible";
							}),
						hidden,
						{ timeout: 1500 },
					);
				await page.evaluate(() => window.scrollTo(0, 160));
				await bars(true);
				await page.evaluate(() => window.scrollTo(0, 120));
				await bars(false);
				await page.locator("#ai-dock-input").focus();
				await page.evaluate(() => window.scrollTo(0, 200));
				assert.equal(await page.locator("#dock.is-tucked").count(), 0);
				await page.locator("#ai-dock-input").blur();
				await page.evaluate(() => window.scrollTo(0, 0));
				if (width === 1512)
					await page.screenshot({ path: "tests/artifacts/desktop-four-columns.png" });
			},
			{ viewport: { width, height: 749 } },
		);
	for (const hold of [false, true])
		await scenario(
			`Desktop: ${hold ? "hold" : "press"} a card and drop it into the AI dock`,
			async (page) => {
				const before = await snapshot(page);
				const source = await page.locator('[data-card="selection-01"] .card-summary').boundingBox();
				await page.mouse.move(source.x + 20, source.y + 10);
				await page.mouse.down();
				if (hold) await page.waitForTimeout(440);
				await page.mouse.move(source.x + 40, source.y + 30);
				const receiver = await page.locator("#ai-dock").boundingBox();
				assert.ok(receiver, "holding a card must reveal the AI dock");
				await page.mouse.move(receiver.x + receiver.width / 2, receiver.y + receiver.height / 2, {
					steps: 12,
				});
				assert.equal(await page.locator("#ai-dock.is-ready").count(), 1);
				await page.mouse.up();
				await page.waitForTimeout(300);
				assert.equal(await page.locator('#ai-dock [data-ai-context="selection-01"]').count(), 1);
				assert.deepEqual(await snapshot(page), before);
				assert.deepEqual(await selection(page), []);
			},
		);
	for (const mobile of [false, true]) {
		await scenario(
			`${mobile ? "Phone" : "Desktop"}: AI drop opens a local-only context window`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, mobile);
				const target = mobile ? "#selection-bar .selection-ai-target" : "#ai-dock";
				const receiver = await page.locator(target).boundingBox();
				assert.ok(receiver);
				await gesture.moveTo({
					x: receiver.x + receiver.width / 2,
					y: receiver.y + receiver.height / 2,
				});
				assert.equal(
					await page.locator(target).evaluate((n) => n.classList.contains("is-ready")),
					true,
				);
				await gesture.release();
				if (!mobile) {
					await page.waitForTimeout(300);
					assert.equal(await page.locator("#ai-dock [data-ai-context]").count(), 2);
					assert.deepEqual(await snapshot(page), before);
					assert.deepEqual(await selection(page), []);
					return;
				}
				await page.locator(".ai-conversation").waitFor();
				assert.equal(await page.locator("[data-ai-context]").count(), 2);
				assert.equal(await page.locator(".selection-drag-preview").count(), 0);
				await page.locator("#ai-local-draft").fill("只在本地输入，不发送");
				assert.equal(await page.locator(".ai-composer-tools button:not([disabled])").count(), 0);
				await unchanged(page, before);
				await page.keyboard.press("Escape");
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
			await page.locator("#search-selection-bar .selection-ai-target").focus();
			await page.keyboard.press("Enter");
			await page.locator(".ai-conversation").waitFor();
			assert.equal(await page.locator("[data-ai-context]").count(), 1);
			await page.keyboard.press("Escape");
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
