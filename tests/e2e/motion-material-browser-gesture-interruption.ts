import assert from "node:assert/strict";

export async function runGestureInterruption({ phone, scenario }: { phone: any; scenario: any }) {
	await scenario(
		"Opening a menu settles card travel and animates the anchored menu",
		async (page) => {
			await page.evaluate(() => window.__app.renderCurrent(true));
			await page.waitForTimeout(50);
			await page.evaluate(() => window.__app.more("motion-0"));
			await page.waitForTimeout(40);
			const state = await page.evaluate(() => {
				const card = document.querySelector<HTMLElement>('[data-card="motion-0"]');
				const menu = card.querySelector<HTMLElement>(".card-more-menu");
				return {
					card: getComputedStyle(card).transform,
					menu: getComputedStyle(menu).transform,
					origin: getComputedStyle(menu).transformOrigin,
				};
			});
			assert.equal(state.card, "none");
			assert.notEqual(state.menu, "none");
			await page.evaluate(() => window.__app.closeMore());
			await page.waitForFunction(() => !document.querySelector(".card-more-leaving"));
		},
	);

	await scenario(
		"Reader progress scales from the left without changing layout width",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("motion-0", true));
			await page.waitForTimeout(300);
			const progress = await page.evaluate(async () => {
				const scroll = document.querySelector<HTMLElement>("#reader-scroll");
				const bar = document.querySelector<HTMLElement>("#reader-progress");
				const before = bar.offsetWidth;
				scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
				window.__app.updateReading("motion-0", scroll);
				await new Promise(requestAnimationFrame);
				return {
					before,
					after: bar.offsetWidth,
					width: bar.style.width,
					transform: bar.style.transform,
					origin: getComputedStyle(bar).transformOrigin,
					properties: getComputedStyle(bar).transitionProperty,
				};
			});
			assert.equal(progress.after, progress.before);
			assert.equal(progress.width, "");
			assert.ok(Math.abs(Number(progress.transform.slice(7, -1)) - 0.5) < 0.01);
			assert.match(progress.origin, /^0px /);
			assert.equal(progress.properties, "all");
		},
	);

	await scenario(
		"Style priorities preserve gesture and toolbar behavior",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.locator("#modal.preview[open]").waitFor();
			await page.waitForTimeout(700);
			const states = await page.evaluate(() => {
				const sheet = document.querySelector<HTMLElement>(".preview-sheet"),
					scroll = sheet.querySelector<HTMLElement>(".sheet-scroll"),
					bar = document.querySelector<HTMLElement>("#modal > .float-bar"),
					head = sheet.querySelector<HTMLElement>(".sheet-head-tools");
				const transition = (node: HTMLElement) => {
					const style = getComputedStyle(node);
					return {
						properties: style.transitionProperty.split(", "),
						transform: style.transform,
						durations: style.transitionDuration.split(", ").map(Number.parseFloat),
						delays: style.transitionDelay.split(", ").map(Number.parseFloat),
					};
				};
				const initial = transition(sheet);
				sheet.classList.add("is-drag");
				const dragging = transition(sheet),
					nested = transition(scroll);
				sheet.classList.remove("is-drag");
				scroll.classList.add("is-drag");
				const directScroll = transition(scroll);
				scroll.classList.remove("is-drag");
				bar.classList.add("is-tucked");
				head.classList.add("is-tucked");
				return {
					initial,
					dragging,
					nested,
					directScroll,
					bar: transition(bar),
					head: transition(head),
				};
			});
			for (const state of Object.values(states) as any[])
				assert.ok(
					state.durations.every((duration: number) => duration === 0),
					"Motion is the sole playback owner",
				);
		},
		phone,
	);

	await scenario(
		"Rapid toast replacement and panel reversal keep the latest content",
		async (page) => {
			await page.evaluate(() => window.__app.toast("first"));
			await page.waitForTimeout(40);
			await page.evaluate(() => window.__app.hideToast());
			await page.waitForTimeout(30);
			await page.evaluate(() => window.__app.toast("second"));
			await page.waitForTimeout(300);
			assert.equal(await page.locator("#toast").isVisible(), true);
			assert.ok((await page.locator("#toast").textContent()).includes("second"));
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(40);
			await page.evaluate(() => window.__app.closeNative());
			await page.waitForTimeout(30);
			await page.evaluate(() => window.__app.openCard("motion-1"));
			await page.waitForTimeout(300);
			assert.equal(
				await page.evaluate(() => (document.getElementById("modal") as HTMLDialogElement).open),
				true,
			);
			assert.equal(await page.evaluate(() => document.getElementById("modal").inert), false);
			assert.ok((await page.locator("#modal").textContent()).includes("阅读卡片 2"));
		},
	);

	await scenario(
		"A delayed gesture dismissal leaves a newly opened search usable",
		async (page) => {
			await page.evaluate(() => {
				window.__app.openCard("motion-0");
				window.__app.gestures.exitSurface(document.querySelector(".preview-sheet"), () =>
					window.__app.closeNative(false),
				);
				window.__app.openPanel("search");
			});
			await page.locator("#filter-search").fill("阅读");
			await page.waitForTimeout(350);
			assert.equal(await page.locator("#filter-search").inputValue(), "阅读");
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				true,
			);
		},
	);
	for (const mode of ["rebound", "exit"])
		await scenario(
			`A new handle drag continues from the visible ${mode} position`,
			async (page) => {
				await page.evaluate(() => window.__app.openCard("motion-0"));
				await page.waitForTimeout(500);
				const result = await page.evaluate(async (mode) => {
					const sheet = document.querySelector<HTMLElement>(".preview-sheet");
					const handle = sheet.querySelector<HTMLButtonElement>(".sheet-handle");
					sheet.classList.add("is-drag");
					sheet.style.translate = "0 90px";
					if (mode === "exit")
						window.__app.gestures.exitSurface(sheet, () => window.__app.closeModal());
					else window.__app.gestures.settle(sheet);
					const rebound = sheet
						.getAnimations()
						.find((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => "translate" in k));
					rebound.pause();
					rebound.currentTime = 90;
					const before = sheet.getBoundingClientRect().top;
					handle.setPointerCapture = () => {};
					handle.dispatchEvent(
						new PointerEvent("pointerdown", {
							pointerId: 77,
							isPrimary: true,
							button: 0,
							clientX: 100,
							clientY: 200,
						}),
					);
					const grabbed = sheet.getBoundingClientRect().top;
					handle.dispatchEvent(
						new PointerEvent("pointermove", {
							pointerId: 77,
							isPrimary: true,
							clientX: 100,
							clientY: 210,
						}),
					);
					await new Promise(requestAnimationFrame);
					const moved = sheet.getBoundingClientRect().top;
					handle.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 77 }));
					return { before, grabbed, moved, state: rebound.playState };
				}, mode);
				assert.ok(Math.abs(result.grabbed - result.before) < 1);
				assert.ok(Math.abs(result.moved - result.before - 10) < 1);
				assert.equal(result.state, "idle");
			},
			phone,
		);
}
