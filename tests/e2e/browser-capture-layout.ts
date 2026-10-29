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
			// No entrance orb. On desktop the rail holds the AI box; selection takes the same slot (ADR 0049).
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
			const { bar, nav, aiDock, face, viewport } = await page.evaluate(() => {
				const box = (id: string) => document.getElementById(id).getBoundingClientRect().toJSON();
				return {
					bar: box("selection-bar"),
					nav: getComputedStyle(document.getElementById("nav")).display,
					aiDock: getComputedStyle(document.getElementById("ai-dock")).visibility,
					face: box("account"),
					viewport: { width: innerWidth, height: innerHeight },
				};
			});
			assert.equal(nav, "none", "desktop shows no navigation capsule");
			assert.equal(aiDock, "hidden", "selection replaces the AI box in the rail");
			// The AI box is 640; the selection bar narrows to its buttons (web-interaction handbook).
			assert.ok(bar.width > 200 && bar.width < 640, `selection bar hugs its buttons: ${bar.width}`);
			assert.equal(Math.round(bar.height), 60, "rail rows differ");
			assert.equal(Math.round(viewport.height - bar.bottom), 28, "selection sits on the rail");
			assert.equal(
				Math.round(bar.left + bar.width / 2),
				viewport.width / 2,
				"selection is centred",
			);
			assert.ok(face.bottom < bar.top, "settings stays in the top bar");
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
			await page
				.locator('css:light=#modal .detail-related [data-action="card-open"]')
				.first()
				.click();
			await page.waitForFunction((id?: any) => window.__app.currentId !== id, relation);
			assert.equal(await page.locator("css:light=#modal .sheet-peek").count(), 1);
			await page.locator('css:light=#modal .sheet-head [data-action="close"]').click();
			await page.waitForFunction((id?: any) => window.__app.currentId === id, relation);
			assert.equal(await page.locator("css:light=#modal").evaluate((n?: any) => n.open), true);
			assert.equal(await page.locator("css:light=#modal .sheet-peek").count(), 0);
			await page
				.locator('css:light=#modal .detail-related [data-action="card-open"]')
				.first()
				.click();
			await page.waitForFunction(() => !!document.querySelector("dialog .sheet-peek"));
			// The dim area closes one card at a time, like the close button.
			await page.mouse.click(8, 8);
			await page.waitForFunction((id?: any) => window.__app.currentId === id, relation);
			assert.equal(await page.locator("css:light=#modal").evaluate((n?: any) => n.open), true);
			assert.equal(await page.locator("css:light=#modal .sheet-peek").count(), 0);
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
			await page.waitForFunction(
				() => getComputedStyle(document.getElementById("nav")).visibility === "hidden",
			);
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
			await page.locator("#account").click();
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
		},
		{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
	);
	await scenario(
		"Desktop preview grows from its card and returns on the same spring",
		async (page?: any) => {
			// A visible source card opens and closes on one spring (motion.cardSpring, ADR 0057 / 0062);
			// the 220ms fade only applies when there is no source card.
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
						String(a.effect.getKeyframes().at(-1).transform),
					])
					.filter(([, from]) => from !== "undefined");
			});
			assert.ok(open.length, "the preview has a transform animation");
			assert.match(open[0][1], /translate\(.*scale\(/, "starts at the card's place and size");
			assert.match(open[0][2], /scale\(1(, 1)?\)/, "ends at the preview's own size");
			await page.waitForTimeout(700);
			assert.equal(
				await page.evaluate(
					() => getComputedStyle(document.getElementById("modal-title")).fontSize,
				),
				"26px",
				"the settled preview keeps its text size",
			);
			const close = await page.evaluate(async () => {
				const sheet = document.querySelector(".preview-sheet");
				(document.querySelector('#modal [data-action="close"]') as HTMLElement).click();
				for (let i = 0; i < 10; i++) {
					await new Promise((resolve) => setTimeout(resolve, 16));
					const running = sheet
						.getAnimations()
						.map((a: any) => [
							a.effect.getTiming().duration,
							String(a.effect.getKeyframes().at(-1).transform),
						])
						.filter(([, to]) => to !== "undefined");
					if (running.length) return running;
				}
				return [];
			});
			assert.ok(close.length, "the preview animates back");
			assert.equal(close[0][0], open[0][0], "open and close share one spring");
			assert.match(close[0][1], /scale\(/, "returns to the card's size");
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
		},
	);
	await scenario("Manual capture, paste and text drop do not create cards", async (page?: any) => {
		const count = await page.locator(".feed-card").count();
		await page.keyboard.press("n");
		assert.equal(await page.locator("#capture-text,[data-action=capture-save]").count(), 0);
		await page.evaluate(() => {
			const dataTransfer = new DataTransfer();
			dataTransfer.setData("text/plain", "Do not create a manual note");
			document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer }));
			document.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
		});

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
		assert.equal(await page.locator(".feed-card", { hasText: "example.com/drop" }).count(), 0);
	});
}
