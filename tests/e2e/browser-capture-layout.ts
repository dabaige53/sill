import assert from "node:assert/strict";

export async function runCaptureLayout({
	action,
	card,
	openCard,
	rect,
	scenario,
}: {
	action: any;
	card: any;
	openCard: any;
	rect: any;
	scenario: any;
}) {
	await scenario(
		"Bottom rail, selection menu, refresh and stacked previews share one rule",
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
			assert.equal(await page.locator("#modal").evaluate((n?: any) => n.open), false);
			assert.equal(await page.evaluate(() => window.__app.selected.size), 2);
			assert.deepEqual(await inside(), before, "selecting moved the card's content");
			// No entrance orb: the rail is the navigation capsule, and selection shares its row.
			assert.equal(await page.locator("#orb,.dock-tools,.rail-tools").count(), 0);
			// Selection can scroll a card into view and tuck the rail. Compare its resting layout,
			// after both the rail and selection bar have entered, in one browser frame.
			await page.waitForFunction(
				() => !document.getElementById("dock").classList.contains("is-tucked"),
			);
			await page.locator("#dock").evaluate(async (node: HTMLElement) => {
				await Promise.all(
					node
						.getAnimations({ subtree: true })
						.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
						.map((animation) => animation.finished.catch(() => {})),
				);
			});
			const { bar, nav, face } = await page.evaluate(() => {
				const box = (id: string) => document.getElementById(id).getBoundingClientRect().toJSON();
				return { bar: box("selection-bar"), nav: box("nav"), face: box("account") };
			});
			assert.ok(bar.right <= nav.left, "selection bar overlaps the navigation capsule");
			assert.ok(
				face.right <= nav.right && face.left > nav.left,
				"settings sits inside the capsule",
			);
			assert.equal(Math.round(bar.bottom), Math.round(nav.bottom), "rail rows differ");
			assert.equal(Math.round(bar.height), Math.round(nav.height), "rail rows differ");
			await page.evaluate(() => window.__app.toast("撤销测试", () => {}));
			const toast = await rect(page, "#toast");
			assert.ok(toast.bottom <= bar.top, "toast overlaps the selection bar");
			await card(page, ids[2]).click();
			assert.equal(await page.evaluate(() => window.__app.selected.size), 3);
			assert.equal(
				await page.locator('[data-action="select-all"],[data-action="selection-menu"]').count(),
				0,
			);
			await action(page, "select-all");
			assert.equal(await page.evaluate(() => window.__app.selected.size), ids.length);
			await page.keyboard.press("Escape");
			assert.equal(await page.evaluate(() => window.__app.selected.size), 0);
			await page.waitForFunction(() => document.getElementById("selection-bar").hidden);
			assert.equal(await page.locator("#selection-bar").isVisible(), false);
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
			const start = await card(page, ids[0]).locator(".card-head").boundingBox(),
				x = start.x + start.width / 2,
				y = start.y + start.height / 2;
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.waitForTimeout(440);
			await page.mouse.move(x + 20, y + 10, { steps: 4 });
			assert.equal(await page.locator(".selection-lift .selection-stack").isVisible(), false);
			assert.equal(await page.evaluate(() => window.__app.selected.size), 1);
			assert.equal(await page.locator("#drop-targets,[data-drop]").count(), 0);
			await page.mouse.up();
			assert.equal(await page.locator("#selection-menu").isVisible(), false);
			await page.locator("#selection-bar").click({ button: "right" });
			assert.equal(await page.locator("#selection-menu").isVisible(), true);
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#selection-menu").isVisible(), false);
			assert.equal(await page.evaluate(() => window.__app.selected.size), 1);
			await page.keyboard.press("Escape");
			await action(page, "refresh");
			await page.waitForFunction(
				() => document.getElementById("pull-ring").dataset.state === "success",
			);
			const relation = await page.evaluate(
				() => (document.querySelector(".type-suggestion") as HTMLElement)?.dataset.card,
			);
			assert.doesNotMatch(await card(page, relation).locator(".card-head").innerText(), /张卡/);
			await page.waitForFunction(
				() =>
					Date.now() >= (window.__app.drag.suppressedClick?.until || 0) &&
					window.__app.selected.size === 0 &&
					!window.__app.drag.active,
			);
			await openCard(page, relation);
			await page.waitForFunction(
				(id: string) =>
					window.__app.modalKind === "preview" &&
					window.__app.currentId === id &&
					document.querySelector("dialog").open,
				relation,
			);
			await page.locator('#modal .refs [data-action="card-open"]').first().click();
			await page.waitForFunction((id?: any) => window.__app.currentId !== id, relation);
			assert.equal(await page.locator("#modal .sheet-peek").count(), 1);
			await page.locator('#modal .sheet-head [data-action="close"]').click();
			await page.waitForFunction((id?: any) => window.__app.currentId === id, relation);
			assert.equal(await page.locator("#modal").evaluate((n?: any) => n.open), true);
			assert.equal(await page.locator("#modal .sheet-peek").count(), 0);
			await page.locator('#modal .refs [data-action="card-open"]').first().click();
			await page.waitForFunction(() => !!document.querySelector("dialog .sheet-peek"));
			// The dim area closes one card at a time, like the close button.
			await page.mouse.click(8, 8);
			await page.waitForFunction((id?: any) => window.__app.currentId === id, relation);
			assert.equal(await page.locator("#modal").evaluate((n?: any) => n.open), true);
			assert.equal(await page.locator("#modal .sheet-peek").count(), 0);
			await page.waitForTimeout(400);
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
			assert.equal(await page.locator("#dock .nav-capsule").isVisible(), false);
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
		"Phone pages switch without showing the desk; settings fills the screen; card menu has icons and clears the rail",
		async (page?: any) => {
			await page.locator('.nav-tab[data-extra="settings"]').click();
			await page.waitForFunction(() => window.__app.modalKind === "settings");
			await page.waitForTimeout(300);
			const main = await rect(page, "#modal .settings-main");
			assert.equal(Math.round(main.bottom), 844, "settings scrolls behind the capsule");
			const switching = await page.evaluate(async () => {
				const dialog = document.getElementById("modal");
				(document.querySelector('.nav-tab[data-extra="ai"]') as HTMLElement).click();
				await new Promise((resolve) => setTimeout(resolve, 30));
				return {
					opacity: getComputedStyle(dialog).opacity,
					pageAnimations: dialog.getAnimations().length,
				};
			});
			assert.deepEqual(switching, { opacity: "1", pageAnimations: 0 });
			await page.locator('.nav-tab[data-extra="home"]').click();
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
			const placed = await page.evaluate(async () => {
				const cards = [...document.querySelectorAll<HTMLElement>("#feed-grid [data-card]")];
				const low = cards.find((n) => n.getBoundingClientRect().top > innerHeight * 0.55);
				window.__app.more(low.dataset.card);
				await new Promise((resolve) => setTimeout(resolve, 250));
				const menu = low.querySelector(".card-more-menu");
				const rail = Math.min(
					...[...document.getElementById("dock").children]
						.map((n) => n.getBoundingClientRect())
						.filter((r) => r.height)
						.map((r) => r.top),
				);
				return {
					bottom: menu.getBoundingClientRect().bottom,
					rail,
					icons: [...menu.querySelectorAll(".card-menu-item")].every((b) => b.querySelector("svg")),
				};
			});
			assert.equal(placed.icons, true, "every menu item has its icon");
			assert.ok(placed.bottom <= placed.rail, JSON.stringify(placed));
		},
		{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
	);
	await scenario(
		"Desktop preview keeps text size while entering and leaving",
		async (page?: any) => {
			const open = await page.evaluate(async () => {
				(
					document.querySelector('[data-card="article-01"] .card-title-button') as HTMLElement
				).click();
				await new Promise((resolve) => requestAnimationFrame(resolve));
				return document
					.querySelector(".preview-sheet")
					.getAnimations()
					.map((a: any) => [
						a.effect.getTiming().duration,
						String(a.effect.getKeyframes()[0].transform),
					]);
			});
			assert.equal(open[0][0], 220);
			assert.match(open[0][1], /translateY\(10px\)/);
			assert.doesNotMatch(open[0][1], /scale/);
			await page.waitForTimeout(400);
			const close = await page.evaluate(async () => {
				const sheet = document.querySelector(".preview-sheet");
				(document.querySelector('#modal [data-action="close"]') as HTMLElement).click();
				for (let i = 0; i < 10; i++) {
					await new Promise((resolve) => setTimeout(resolve, 16));
					const running = sheet.getAnimations();
					if (running.length)
						return running.map((a: any) => [
							a.effect.getTiming().duration,
							String(a.effect.getKeyframes().at(-1).transform),
						]);
				}
				return [];
			});
			assert.equal(close[0]?.[0], 160);
			assert.match(close[0][1], /translateY\(4px\)/);
			assert.doesNotMatch(close[0][1], /scale/);
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
		},
	);
	await scenario("Capture and dropped text add cards; files are ignored", async (page?: any) => {
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
		assert.equal(await page.locator('input[type="file"],#import-rings').count(), 0);
		await page.evaluate(() => {
			const dataTransfer = new DataTransfer();
			dataTransfer.setData("text/uri-list", "https://example.com/drop");
			document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer }));
		});
		assert.equal(await page.locator("#drop-hint").isVisible(), true);
		await page.evaluate(() => {
			const dataTransfer = new DataTransfer();
			dataTransfer.setData("text/uri-list", "https://example.com/drop");
			document.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
		});
		assert.equal(await page.locator(".feed-card", { hasText: "example.com/drop" }).count(), 1);
		const count = await page.locator(".feed-card").count();
		await page.evaluate(() => {
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(new File(["# Do not import"], "note.md", { type: "text/markdown" }));
			dataTransfer.setData("text/plain", "Do not capture a file label");
			document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer }));
			document.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
		});
		assert.equal(await page.locator("#drop-hint").isVisible(), false);
		assert.equal(await page.locator(".feed-card").count(), count);
		await page.reload();
		assert.equal(await page.locator(".feed-card", { hasText: "example.com/drop" }).count(), 1);
	});
}
