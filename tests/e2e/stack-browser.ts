import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

(async () => {
	const root = path.resolve(import.meta.dirname, "../.."),
		results = [];
	const server = http.createServer((req?: any, res?: any) => {
		res.setHeader("content-type", "text/html");
		res.end(fs.readFileSync(process.env.SILL_TEST_HTML || path.join(root, "dist/web/index.html")));
	});
	await new Promise((r?: any) => server.listen(0, "127.0.0.1", r));
	const browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	let failures = 0;
	async function scenario(name?: any, run?: any, width: any = 1440, touch: any = false) {
		const context = await browser.newContext({
				viewport: { width, height: 1000 },
				hasTouch: touch,
				isMobile: touch,
			}),
			page = await context.newPage();
		page.setDefaultTimeout(4000);
		const errors = [];
		page.on("pageerror", (e?: any) => errors.push(e.message));
		try {
			await page.goto(
				`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`,
			);
			await page.waitForFunction(() => window.__app);
			await page.locator(".deck").scrollIntoViewIfNeeded();
			await page.waitForTimeout(400);
			await run(page);
			assert.deepEqual(errors, []);
			results.push({ name, status: "PASS" });
		} catch (e) {
			failures++;
			results.push({ name, status: "FAIL", error: e.message });
		} finally {
			await context.close();
		}
	}
	const snapshot = async (page?: any, name?: any) => {
		fs.mkdirSync(path.join(root, "tests/artifacts"), { recursive: true });
		await page.screenshot({ path: path.join(root, "tests/artifacts/" + name + ".png") });
	};
	const current = (page?: any) => page.locator(".deck").getAttribute("data-cur");
	const settled = (page?: any) =>
		page.waitForFunction(() => !(document.querySelector(".deck") as HTMLElement).dataset.busy);
	const position = async (page?: any) => {
		const b = await page.locator(".deck").boundingBox();
		return { x: b.x + b.width * 0.7, y: b.y + b.height * 0.5, w: b.width };
	};
	const mouseSwipe = async (page?: any, dx?: any) => {
		const p = await position(page);
		await page.mouse.move(p.x, p.y);
		await page.mouse.down();
		await page.mouse.move(p.x + dx, p.y + 2, { steps: 5 });
		await page.mouse.up();
	};
	await scenario(
		"Trackpad reversal during the coasting guard changes direction",
		async (page?: any) => {
			const p = await position(page);
			await page.mouse.move(p.x, p.y);
			await page.mouse.wheel(180, 0);
			await page.mouse.wheel(-180, 0);
			await settled(page);
			assert.equal(await current(page), "0");
		},
	);
	await scenario(
		"A second mouse swipe can start during the settling animation",
		async (page?: any) => {
			await mouseSwipe(page, -150);
			await mouseSwipe(page, -150);
			await settled(page);
			assert.equal(await current(page), "2");
			await snapshot(page, "stack-third-1440");
			assert.equal(await page.locator("#modal").evaluate((e?: any) => e.open), false);
		},
	);
	await scenario(
		"Cancelled pointer restores deck; a fresh tap still opens the stack",
		async (page?: any) => {
			const p = await position(page);
			await page.mouse.move(p.x, p.y);
			await page.mouse.down();
			await page.mouse.move(p.x - 70, p.y, { steps: 3 });
			await page.evaluate(() =>
				document
					.querySelector(".deck")
					.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })),
			);
			await page.mouse.up();
			await settled(page);
			assert.equal(await current(page), "0");
			await page.locator(".deck .is-top .card-title-button").click();
			assert.equal(await page.locator("[data-stack-open]").count(), 1);
		},
	);
	await scenario(
		"Touch swipe, reverse, vertical scroll and title tap remain independent",
		async (page?: any) => {
			const cdp = await page.context().newCDPSession(page);
			const swipe = async (dx?: any, dy?: any) => {
				const p = await position(page);
				await cdp.send("Input.dispatchTouchEvent", {
					type: "touchStart",
					touchPoints: [{ x: p.x, y: p.y }],
				});
				for (let i = 1; i <= 8; i++)
					await cdp.send("Input.dispatchTouchEvent", {
						type: "touchMove",
						touchPoints: [{ x: p.x + (dx * i) / 8, y: p.y + (dy * i) / 8 }],
					});
				await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			};
			await swipe(-150, 8);
			await settled(page);
			assert.equal(await current(page), "1");
			await swipe(-150, 6);
			await settled(page);
			assert.equal(await current(page), "2");
			await snapshot(page, "stack-third-390");
			await swipe(150, 4);
			await settled(page);
			await swipe(150, 4);
			await settled(page);
			assert.equal(await current(page), "0");
			const y = await page.evaluate(() => scrollY);
			await swipe(4, 100);
			await page.waitForTimeout(300);
			assert.ok(await page.evaluate((old?: any) => scrollY < old, y));
			assert.equal(await current(page), "0");
			await page.locator(".deck").scrollIntoViewIfNeeded();
			await page.locator(".deck .is-top .card-title-button").tap();
			assert.equal(await page.locator("[data-stack-open]").count(), 1);
		},
		390,
		true,
	);
	for (const width of [1440, 390])
		await scenario(
			`Reading panel uses available width at ${width}px`,
			async (page?: any) => {
				await page.locator('[data-card="article-01"] .card-title-button').click();
				await page.locator(".preview-sheet").evaluate(async (el?: any) =>
					Promise.allSettled(
						el
							.closest("dialog")
							.getAnimations({ subtree: true })
							.filter((a?: any) => a.effect.getTiming().iterations !== Infinity)
							.map((a?: any) => a.finished),
					),
				);
				const box = await page.locator(".preview-sheet").boundingBox();
				assert.ok(box.width >= (width === 1440 ? 740 : width - 2));
				assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
				await snapshot(page, "preview-width-" + width);
				await page.locator('dialog [data-action="reader"]').click();
				await page.locator(".reader-body").evaluate(async (el?: any) =>
					Promise.allSettled(
						el
							.closest("dialog")
							.getAnimations({ subtree: true })
							.filter((a?: any) => a.effect.getTiming().iterations !== Infinity)
							.map((a?: any) => a.finished),
					),
				);
				const reader = await page.locator(".reader-body").boundingBox();
				assert.ok(reader.width >= (width === 1440 ? 800 : width - 2));
				assert.ok(
					await page.evaluate(
						() => document.querySelector("#reader-scroll").scrollWidth <= innerWidth,
					),
				);
				fs.mkdirSync(path.join(root, "tests/artifacts"), { recursive: true });
				await page.screenshot({
					path: path.join(root, `tests/artifacts/reader-width-${width}.png`),
				});
			},
			width,
		);
	await browser.close();
	server.close();
	fs.mkdirSync(path.join(root, "tests/artifacts"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "tests/artifacts/stack-verification.json"),
		JSON.stringify(results, null, 2),
	);
	console.log(JSON.stringify(results, null, 2));
	if (failures) process.exitCode = 1;
})().catch((e?: any) => {
	console.error(e);
	process.exit(1);
});
