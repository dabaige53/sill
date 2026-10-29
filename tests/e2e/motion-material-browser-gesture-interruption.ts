import assert from "node:assert/strict";

export async function runGestureInterruption({ phone, scenario }: { phone: any; scenario: any }) {
	await scenario("Card right-click does not create a product menu", async (page) => {
		await page.locator('[data-card="motion-0"] .card-title-button').click({ button: "right" });
		assert.equal(await page.locator(".card-more-menu,#selection-menu").count(), 0);
	});
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
					bar = document.querySelector<HTMLElement>("#modal .float-bar"),
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
	for (const close of [false, true]) {
		await scenario(
			`Phone drawer remains usable after ${close ? "closing" : "opening"} is interrupted`,
			async (page) => {
				await page.evaluate(() => window.__app.openCard("motion-0"));
				await page.waitForTimeout(90);
				if (close) await page.evaluate(() => window.__app.closeNative());
				await page.evaluate(() => window.__app.openCard("motion-1"));
				await page.waitForTimeout(700);
				assert.equal(await page.evaluate(() => window.__app.currentId), "motion-1");
				await page.evaluate(() => window.__app.goTo("home"));
				await page.locator("#modal[open]").waitFor({ state: "hidden" });
			},
			phone,
		);
	}
}
