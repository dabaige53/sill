import assert from "node:assert/strict";

export async function runDetailGestures({
	phone,
	scenario,
	touch,
}: {
	phone: any;
	scenario: any;
	touch: any;
}) {
	for (const handle of [false, true]) {
		await scenario(
			`Mail closes by dragging ${handle ? "the handle" : "the text"}`,
			async (page, context) => {
				await page.evaluate(() => window.__app.openCard("motion-mail"));
				await page.waitForTimeout(600);
				const initial = await page.locator(".phone-drawer").boundingBox();
				const target = await page
					.locator(handle ? "[data-vaul-handle]" : ".preview-full")
					.boundingBox();
				const session = await context.newCDPSession(page);
				const y = target.y + (handle ? 2 : 30);
				await touch(session, "touchStart", 195, y);
				for (const offset of [30, 80, 160, 260]) await touch(session, "touchMove", 195, y + offset);
				const moved = await page.locator(".phone-drawer").boundingBox();
				assert.ok(moved.y > initial.y + 100, "drag follows the finger");
				assert.ok(Math.abs(moved.height - initial.height) < 2, "drag does not resize content");
				await touch(session, "touchEnd");
				await page.locator("#modal[open]").waitFor({ state: "hidden" });
			},
			phone,
		);
	}
	await scenario(
		"Wheel reading stays in the drawer until explicit close",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(600);
			await page.locator(".sheet-scroll").hover();
			await page.mouse.wheel(0, 300);
			await page.waitForFunction(() => document.querySelector(".sheet-scroll").scrollTop > 0);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			await page.keyboard.press("Escape");
			await page.locator("#modal[open]").waitFor({ state: "hidden" });
		},
		phone,
	);
	await scenario(
		"PWA has no maximize button and opens and closes its preview",
		async (page) => {
			await page.evaluate(() => Object.defineProperty(navigator, "standalone", { value: true }));
			const opening = await page.evaluate(async () => {
				window.__app.openCard("motion-0");
				await new Promise(requestAnimationFrame);
				const drawer = document.querySelector<HTMLElement>(".phone-drawer");
				const entry = drawer
					.getAnimations()
					.find((animation) => (animation as CSSAnimation).animationName === "slideFromBottom");
				const result = {
					maximize: drawer.querySelectorAll('.sheet-head [data-action="reader"]').length,
					playing: entry?.playState,
					time: Number(entry?.currentTime),
					duration: Number(entry?.effect.getTiming().duration),
				};
				// Close during the real entry, rather than guessing its progress from a host-side sleep.
				window.__app.closeNative();
				return result;
			});
			assert.equal(opening.maximize, 0);
			assert.equal(opening.playing, "running");
			assert.ok(opening.time < opening.duration, JSON.stringify(opening));
			await page.locator("#modal[open]").waitFor({ state: "hidden" });
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), false);
		},
		phone,
	);
}
