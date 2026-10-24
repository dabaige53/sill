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
			assert.equal(result.backdrop, "none");
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
				return lens.getAnimations().every((a) => a.playState === "finished");
			});
			const state = await page.evaluate(() => {
				const tab = document.querySelector('#nav [aria-current="page"]'),
					lens = document.querySelector(".nav-lens"),
					style = getComputedStyle(lens),
					dialog = document.getElementById("modal");
				return {
					page: dialog.classList.contains("page"),
					modal: dialog.matches(":modal"),
					distance: Math.abs(tab.getBoundingClientRect().left - lens.getBoundingClientRect().left),
					animation: style.animationName,
					transition: style.transitionProperty,
				};
			});
			assert.equal(state.page, true);
			assert.equal(state.modal, false);
			assert.ok(state.distance < 1);
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
				// Current card types share a toolbar. Exercise the supported no-toolbar layout explicitly.
				const toolbar = window.__app.dialog.querySelector(":scope > .float-bar");
				(window as any).__fixtureToolbar = toolbar;
				toolbar.remove();
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
			assert.equal(
				await page
					.locator(".sheet-scroll")
					.evaluate((node: Element) => getComputedStyle(node).paddingBottom),
				"0px",
			);
			await page.evaluate(() => {
				// Restore React-owned DOM after the intentionally toolbar-free fixture.
				window.__app.dialog.append((window as any).__fixtureToolbar);
				delete (window as any).__fixtureToolbar;
				window.__app.openCard("motion-0");
			});
			// Transition snapshots live in Shadow DOM and cannot receive input.
			await page.locator("css:light=#modal > .float-bar").waitFor();
			assert.equal(await page.locator("css:light=#modal > .float-bar").count(), 1);
			assert.equal(
				await page
					.locator("css:light=.preview-sheet")
					.evaluate((node: Element) => getComputedStyle(node, "::after").content),
				'""',
			);
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
		"Real touchCancel restores the phone sheet without closing or writing",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(420);
			const before = await page.evaluate(() => localStorage.getItem("sill-v1"));
			const session = await context.newCDPSession(page);
			const handle = await page.locator(".sheet-handle").boundingBox();
			await touch(session, "touchStart", 195, handle.y + 10);
			await touch(session, "touchMove", 195, handle.y + 100);
			assert.equal(
				await page
					.locator(".preview-sheet")
					.evaluate((node: Element) => node.classList.contains("is-drag")),
				true,
			);
			// CDP can acknowledge cancellation before DOM delivery. Observe the trusted event
			// at window, after the sheet's dialog listeners, without polling for cleanup.
			await page.evaluate(() => {
				const sheet = document.querySelector(".preview-sheet") as HTMLElement;
				window.addEventListener(
					"touchcancel",
					(event) => {
						if (sheet.contains(event.target as Node))
							sheet.dataset.touchCancelDelivered = String(event.isTrusted);
					},
					{ once: true },
				);
			});
			await touch(session, "touchCancel");
			await page.waitForFunction(
				() =>
					document.querySelector<HTMLElement>(".preview-sheet")?.dataset.touchCancelDelivered ===
					"true",
				null,
				{ timeout: 5000 },
			);
			await page.waitForFunction(
				() => !document.querySelector<HTMLElement>(".preview-sheet").style.translate,
			);
			const state = await page.evaluate(() => ({
				open: (document.getElementById("modal") as HTMLDialogElement).open,
				drag: !!document.querySelector(".is-drag"),
				translate: (document.querySelector(".preview-sheet") as HTMLElement).style.translate,
				dim: document.getElementById("modal").style.getPropertyValue("--backdrop"),
			}));
			assert.deepEqual(state, { open: true, drag: false, translate: "", dim: "" });
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
			await page.waitForTimeout(100);
			assert.equal(
				await page
					.locator(".preview-sheet")
					.evaluate((node: Element) => node.closest("dialog")?.inert),
				true,
			);
			assert.equal(
				await page.locator(".float-bar").evaluate((node: Element) => node.closest("dialog")?.inert),
				true,
			);
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
		},
		phone,
	);
}
