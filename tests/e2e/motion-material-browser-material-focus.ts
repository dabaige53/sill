import assert from "node:assert/strict";

export async function runMaterialFocus({
	material,
	openSelection,
	phone,
	scenario,
	touch,
}: {
	material: any;
	openSelection: any;
	phone: any;
	scenario: any;
	touch: any;
}) {
	await scenario("Real Tab reaches a completely hidden rail from the feed", async (page) => {
		const middle = await page.evaluate(() => {
			const buttons = document
				.querySelector(".feed-grid > .feed-item:last-child")
				.querySelectorAll("button");
			(buttons[buttons.length - 1] as HTMLElement).focus({ preventScroll: true });
			const top = Math.floor((document.documentElement.scrollHeight - innerHeight) / 2);
			window.scrollTo({ top, behavior: "instant" });
			return top;
		});
		await page.waitForFunction((top) => scrollY === top, middle);
		assert.ok(
			await page.evaluate(
				() => scrollY > 24 && scrollY < document.documentElement.scrollHeight - innerHeight - 24,
			),
			"the keyboard scenario starts away from both edges",
		);
		await page.evaluate(() => window.__app.railHide.hide());
		await page.waitForFunction(
			() => getComputedStyle(document.getElementById("dock")).visibility === "hidden",
		);
		await page.keyboard.press("Tab");
		const focus = await page.evaluate(() => ({
			extra: (document.activeElement as HTMLElement).dataset.extra,
			active: document.activeElement.outerHTML.slice(0, 400),
			dockClass: document.getElementById("dock").className,
			visibility: getComputedStyle(document.getElementById("dock")).visibility,
			hidden: window.__app.railHide.hidden,
		}));
		assert.match(focus.active, /id="ai-dock-input"/, JSON.stringify(focus));
		assert.equal(
			await page.locator("#dock").evaluate((node: Element) => getComputedStyle(node).visibility),
			"visible",
		);
	});

	await scenario(
		"Forced no-blur fallback uses solid surfaces and a one-pixel outline",
		async (page) => {
			// This Chromium supports blur. Exercise the actual fallback declarations directly;
			// it does not claim native testing of a browser without either blur property.
			const condition = await page.evaluate(() => {
				const rule = [...document.styleSheets]
					.flatMap((sheet) => [...sheet.cssRules])
					.find(
						(rule) =>
							rule instanceof CSSSupportsRule &&
							rule.conditionText.startsWith("not") &&
							rule.conditionText.includes("backdrop-filter"),
					) as CSSSupportsRule;
				const style = document.createElement("style");
				style.textContent = [...rule.cssRules].map((rule) => rule.cssText).join("\n");
				document.head.appendChild(style);
				return rule.conditionText;
			});
			assert.ok(condition.includes("-webkit-backdrop-filter") && condition.includes(" or "));
			await openSelection(page);
			const result = await material(page);
			assert.equal(result.background, "rgb(255, 255, 255)");
			assert.equal(result.blur, "none");
			assert.match(result.shadow, /0px 0px 0px 1px/);
			assert.equal(result.lensBackground, "rgb(240, 240, 242)");
		},
	);

	await scenario("Head tools preserve immediate keyboard visibility", async (page) => {
		await page.locator('[data-card="motion-0"] .card-title-button').focus();
		await page.keyboard.press("Enter");
		await page.evaluate(() => window.__app.sheetHide.hide());
		await page.waitForTimeout(100);
		await page.keyboard.press("Shift+Tab");
		assert.equal(
			await page.evaluate(() => document.activeElement.closest(".float-bar") !== null),
			true,
		);
		assert.equal(
			await page
				.locator(".float-bar")
				.evaluate((node: Element) => getComputedStyle(node).visibility),
			"visible",
		);
	});

	await scenario(
		"Phone navigation keeps its lens and does not become a draggable sheet",
		async (page, context) => {
			await page.locator('#nav [data-extra="ai"]').click();
			await page.waitForFunction(() => {
				const lens = document.querySelector(".nav-lens");
				const tab = document.querySelector('#nav [aria-current="page"]');
				return (
					Math.abs(
						tab.getBoundingClientRect().left -
							lens.getBoundingClientRect().left -
							Number.parseFloat(getComputedStyle(lens).clipPath.split(" ")[3]),
					) < 1
				);
			});
			const state = await page.evaluate(() => {
				const tab = document.querySelector('#nav [aria-current="page"]'),
					lens = document.querySelector(".nav-lens"),
					style = getComputedStyle(lens),
					dialog = document.getElementById("modal");
				return {
					page: dialog.classList.contains("page"),
					modal: dialog.matches(":modal"),
					distance: Math.abs(
						tab.getBoundingClientRect().left -
							lens.getBoundingClientRect().left -
							Number.parseFloat(style.clipPath.split(" ")[3]),
					),
					animation: style.animationName,
					transition: style.transitionProperty,
				};
			});
			assert.equal(state.page, true);
			assert.equal(state.modal, false);
			assert.ok(state.distance < 1, JSON.stringify(state));
			const session = await context.newCDPSession(page);
			await touch(session, "touchStart", 180, 280);
			await touch(session, "touchMove", 180, 560);
			await touch(session, "touchEnd");
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				true,
			);
			assert.equal(await page.locator(".is-drag").count(), 0);
			assert.equal(
				await page.locator("#dock").evaluate((node: Element) => getComputedStyle(node).visibility),
				"visible",
			);
			const home = page.locator('#nav [data-extra="home"]'),
				box = await home.boundingBox();
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.up();
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				false,
			);
		},
		phone,
	);

	await scenario(
		"A toolbar-free preview fixture keeps its final action visible",
		async (page) => {
			await page.evaluate(() => {
				window.__SILL_HOST__ = { canDiscuss: () => true };
				window.__app.openCard("motion-digest");
			});
			await page.waitForTimeout(420);
			await page.locator(".sheet-scroll").evaluate((node: HTMLElement) => {
				node.scrollTop = node.scrollHeight;
			});
			await page.waitForTimeout(420);
			const action = page.locator('#modal [data-action="agent-handoff"]');
			await action.scrollIntoViewIfNeeded();
			const box = await action.boundingBox();
			assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= 844);
			assert.equal(await page.locator("#modal > .float-bar").count(), 0);
			assert.equal(
				await page
					.locator(".preview-sheet")
					.evaluate((node: Element) => getComputedStyle(node, "::after").content),
				"none",
			);

			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.locator("#modal .float-bar").waitFor();
		},
		phone,
	);

	await scenario(
		"Standalone previews, readers and photo pages have no copy-to-assistant action",
		async (page) => {
			for (const [id, reader] of [
				["motion-digest", false],
				["motion-0", true],
				["motion-photo", false],
			]) {
				await page.evaluate(({ id, reader }) => window.__app.openCard(id, reader), { id, reader });
				assert.equal(await page.locator('#modal [data-action="agent-handoff"]').count(), 0);
				assert.equal(await page.locator(".agent-reference").count(), 0);
				await page.keyboard.press("Escape");
				await page.waitForFunction(
					() => !(document.querySelector("#modal") as HTMLDialogElement).open,
				);
			}
		},
		phone,
	);

	await scenario(
		"Real touchCancel keeps the drawer open without writing",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(600);
			const before = await page.evaluate(() => localStorage.getItem("sill-v1"));
			const handle = await page.locator("[data-vaul-handle]").boundingBox();
			const initial = await page.locator(".phone-drawer").boundingBox();
			const session = await context.newCDPSession(page);
			await touch(session, "touchStart", 195, handle.y + 2);
			await touch(session, "touchMove", 195, handle.y + 65);
			await touch(session, "touchCancel");
			await page.waitForTimeout(600);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			const final = await page.locator(".phone-drawer").boundingBox();
			assert.ok(Math.abs(final.y - initial.y) < 2, "cancel restores the drawer position");
			assert.equal(await page.evaluate(() => localStorage.getItem("sill-v1")), before);
		},
		phone,
	);
	await scenario(
		"Closing during phone entry does not revive the sheet",
		async (page) => {
			await page.evaluate(() => {
				window.__app.openCard("motion-0");
				window.__app.closeNative();
			});
			await page.locator('.phone-drawer[data-state="closed"]').waitFor({ state: "attached" });
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
		},
		phone,
	);
}
