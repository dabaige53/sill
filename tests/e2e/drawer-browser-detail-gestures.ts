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
	for (const input of ["text", "trackpad"]) {
		await scenario(
			`Mail closes continuously from ${input}`,
			async (page, context) => {
				await page.evaluate(() => window.__app.openCard("motion-mail"));
				await page.waitForTimeout(500);
				const sheet = page.locator(".preview-sheet");
				const initial = await sheet.boundingBox();
				const session = await context.newCDPSession(page);
				if (input === "text") {
					await touch(session, "touchStart", 180, initial.y + 200);
					for (const step of [40, 100, 200, 240])
						await touch(session, "touchMove", 180, initial.y + 200 + step);
					await page.waitForTimeout(20);
					await touch(session, "touchEnd");
				} else {
					await page.mouse.move(180, initial.y + 200);
					for (let i = 0; i < 5; i++) {
						await page.mouse.wheel(0, -35);
						await page.waitForTimeout(20);
					}
					const drawn = await sheet.evaluate((n: HTMLElement) => ({
						target: parseFloat(n.style.translate.split(" ")[1]),
						drawn: parseFloat(getComputedStyle(n).translate.split(" ")[1]),
					}));
					assert.ok(drawn.target > 0, "wheel started pull");
					assert.ok(
						Math.abs(drawn.target - drawn.drawn) < 1,
						"trackpad must not lag behind a 360ms transition",
					);
				}
				const tops = await page.evaluate(async () => {
					const d = document.querySelector<HTMLDialogElement>("#modal");
					const s = d.querySelector(".preview-sheet");
					const result = [];
					while (d.open && result.length < 45) {
						result.push(s.getBoundingClientRect().top);
						await new Promise(requestAnimationFrame);
					}
					return result;
				});
				assert.ok(tops.length > 1);
				assert.ok(
					tops.every((top, i) => !i || top >= tops[i - 1] - 1),
					"mail never jumps back before exit",
				);
				await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal").open);
			},
			phone,
		);
	}
	await scenario(
		"Mail handle dismissal keeps height stable and never jumps on release",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("motion-mail"));
			await page.waitForTimeout(500);
			const session = await context.newCDPSession(page);
			const sheet = page.locator(".preview-sheet");
			const initial = await sheet.boundingBox();
			const handle = await page.locator(".sheet-handle").boundingBox();
			const y = handle.y + 10;
			await touch(session, "touchStart", 195, y);
			for (const offset of [30, 80, 140, 200]) {
				await touch(session, "touchMove", 195, y + offset);
				await page.waitForTimeout(20);
				const moved = await sheet.boundingBox();
				assert.ok(
					Math.abs(moved.height - initial.height) < 1,
					"downward drag must not resize mail content",
				);
				assert.ok(
					Math.abs(moved.y - initial.y - offset) < 2,
					"handle follows the hand without a CSS delay",
				);
			}
			const before = await sheet.boundingBox();
			await touch(session, "touchEnd");
			const tops = await page.evaluate(async () => {
				const d = document.querySelector<HTMLDialogElement>("#modal");
				const s = d.querySelector(".preview-sheet");
				const result = [];
				while (d.open && result.length < 40) {
					result.push(s.getBoundingClientRect().top);
					await new Promise(requestAnimationFrame);
				}
				return result;
			});
			assert.ok(tops.length > 1, "exit waits for animation");
			assert.ok(tops[0] >= before.y - 1, "no snap back on release");
			assert.ok(
				tops.every((top, i) => !i || top >= tops[i - 1] - 1),
				"exit is monotonic",
			);
			await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal").open);
		},
		phone,
	);

	await scenario(
		"PWA has no maximize button and opens and closes its preview",
		async (page) => {
			await page.evaluate(() => Object.defineProperty(navigator, "standalone", { value: true }));
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(100);
			assert.equal(await page.locator('.sheet-head [data-action="reader"]').count(), 0);
			await page.evaluate(() => window.__app.closeNative());
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
				null,
				{ timeout: 1000 },
			);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), false);
		},
		phone,
	);
}
