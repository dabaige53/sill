/** Synthetic phone regression and CPU profile; not a real-device FPS claim. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { chromium } from "playwright";

const server = http.createServer((_request, response) => {
	response.setHeader("Content-Type", "text/html");
	response.end(fs.readFileSync(new URL("../../dist/web/index.html", import.meta.url)));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
	const page = await browser.newPage({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.addInitScript(() =>
		localStorage.setItem(
			"sill-v1",
			JSON.stringify({
				version: 4,
				cards: Array.from({ length: 38 }, (_, index) => ({
					id: `gesture-${index}`,
					type: "article",
					title: `合成阅读 ${index}`,
					body: Array(60).fill("长正文用于检查拖动和关闭时的布局工作。").join("\n\n"),
					time: Date.now() - index,
				})),
				items: {},
				preferences: { onboarded: true, stack: false },
			}),
		),
	);
	await page.goto(`http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`);
	await page.waitForTimeout(700);
	// Pointer focus on a filter must not pin the header while scrolling.
	await page.locator('.home-tab[data-extra="all"]').click();
	await page.mouse.move(190, 420);
	await page.mouse.wheel(0, 400);
	await page.waitForFunction(() =>
		document.querySelector("#home-top").classList.contains("is-tucked"),
	);
	await page.waitForFunction(
		() => getComputedStyle(document.getElementById("home-top")).visibility === "hidden",
	);
	assert.equal(
		await page.locator("#home-top").evaluate((el) => getComputedStyle(el).visibility),
		"hidden",
	);
	console.log("PASS filter header hides after pointer scrolling");
	const hiddenPosition = await page.evaluate(() => {
		const card = [...document.querySelectorAll<HTMLElement>(".card-title-button")].find((el) => {
			const rect = el.getBoundingClientRect();
			return rect.top > 100 && rect.bottom < innerHeight - 100;
		});
		const rect = card.getBoundingClientRect();
		window.__hiddenFrames = [];
		window.__watchHidden = true;
		const sample = () => {
			window.__hiddenFrames.push({
				scroll: scrollY,
				top: card.getBoundingClientRect().top,
				tucked: ["home-top", "dock"].every((id) =>
					document.getElementById(id).classList.contains("is-tucked"),
				),
			});
			if (window.__watchHidden) requestAnimationFrame(sample);
		};
		sample();
		return {
			scroll: scrollY,
			top: rect.top,
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		};
	});
	await page.touchscreen.tap(hiddenPosition.x, hiddenPosition.y);
	await page.waitForFunction(() => (document.querySelector("#modal") as HTMLDialogElement).open);
	await page.waitForTimeout(800);
	const hiddenFrames = await page.evaluate(() => window.__hiddenFrames);
	assert.ok(
		hiddenFrames.every((frame) => frame.scroll === hiddenPosition.scroll),
		"opening a card keeps the actual document scroll coordinate instead of resetting it to zero",
	);
	assert.ok(
		hiddenFrames.every((frame) => Math.abs(frame.top - hiddenPosition.top) < 1 && frame.tucked),
		"the source card and hidden bars remain stable beyond the chrome rest timer",
	);
	await page.evaluate(() => window.__app.closeToDesk());
	await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
	assert.equal(await page.evaluate(() => scrollY), hiddenPosition.scroll);
	await page.evaluate(() => {
		window.__watchHidden = false;
	});
	console.log("PASS opening and closing from hidden tabs preserves the document and card position");

	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(300);
	const homeChrome = () =>
		page.locator("#home-top,#dock").evaluateAll((elements) =>
			elements.map((el) => ({
				id: el.id,
				opacity: getComputedStyle(el).opacity,
				visibility: getComputedStyle(el).visibility,
				top: Math.round(el.getBoundingClientRect().top),
			})),
		);
	const beforeChrome = await homeChrome();
	await page.evaluate(() => window.__app.openCard("gesture-0"));
	await page.waitForTimeout(600);
	assert.deepEqual(
		await homeChrome(),
		beforeChrome,
		"home controls stay in place beneath the modal",
	);
	await page.evaluate(() => {
		window.__feedNode = document.querySelector('[data-card="gesture-0"]');
		window.__feedChanges = 0;
		new MutationObserver((entries) => {
			window.__feedChanges += entries.filter((e) => e.type === "childList").length;
		}).observe(document.querySelector("#feed-grid"), { childList: true, subtree: true });
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
	await cdp.send("Performance.enable");
	const metrics = async () =>
		Object.fromEntries(
			(await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
		);
	const trace: unknown[] = [];
	cdp.on("Tracing.dataCollected", (event) => trace.push(...event.value));
	await cdp.send("Tracing.start", {
		categories: "devtools.timeline,blink.user_timing",
		transferMode: "ReportEvents",
	});
	const handle = await page.locator(".sheet-handle").boundingBox();
	const x = handle.x + handle.width / 2,
		y = handle.y + handle.height / 2;
	const before = await metrics();
	const height = await page
		.locator(".preview-sheet")
		.evaluate((el) => el.getBoundingClientRect().height);
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let step = 1; step <= 20; step++) {
		await page.mouse.move(x, y + step * 8);
		await page.waitForTimeout(16);
	}
	const dragged = await metrics();
	assert.equal(
		await page.locator(".preview-sheet").evaluate((el) => el.getBoundingClientRect().height),
		height,
	);
	assert.equal(
		await page.locator(".preview-sheet").evaluate((el: HTMLElement) => el.style.height),
		"",
	);
	await page.mouse.move(x, y + 210);
	await page.mouse.up();
	const release = performance.now();
	const exit = await page.locator(".preview-sheet").evaluate((el) =>
		el.getAnimations().map((animation) => ({
			duration: animation.effect.getTiming().duration,
			transforms: (animation.effect as KeyframeEffect)
				.getKeyframes()
				.map((frame) => frame.transform)
				.filter(Boolean),
		})),
	);
	assert.ok(
		exit.some((animation) => animation.duration === 260 && animation.transforms.length === 2),
		"release uses native full-transform playback",
	);
	await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
	const closeMs = performance.now() - release;
	const after = await metrics();
	const ended = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
	await cdp.send("Tracing.end");
	await ended;
	assert.equal(
		await page.evaluate(
			() => window.__feedNode === document.querySelector('[data-card="gesture-0"]'),
		),
		true,
	);
	assert.equal(
		await page.evaluate(() => window.__feedChanges),
		0,
		"closing keeps the existing feed DOM",
	);
	assert.deepEqual(
		await homeChrome(),
		beforeChrome,
		"home controls do not appear in a second step after closing",
	);
	const difference = (a: Record<string, number>, b: Record<string, number>) =>
		Object.fromEntries(
			[
				"LayoutCount",
				"RecalcStyleCount",
				"LayoutDuration",
				"RecalcStyleDuration",
				"ScriptDuration",
			].map((key) => [key, b[key] - a[key]]),
		);
	fs.mkdirSync("tests/artifacts", { recursive: true });
	fs.writeFileSync(
		"tests/artifacts/gesture-performance.json",
		JSON.stringify(
			{
				cpuThrottle: 4,
				closeMs,
				drag: difference(before, dragged),
				release: difference(dragged, after),
			},
			null,
			2,
		),
	);
	fs.writeFileSync(
		"tests/artifacts/gesture-performance-trace.json",
		JSON.stringify({ traceEvents: trace }),
	);
	console.log("PASS fixed-size drag, native exit, stable feed return");

	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	for (const colorScheme of ["dark", "light"] as const) {
		await page.emulateMedia({ colorScheme });
		const original = await homeChrome();
		await page.evaluate(() => window.__app.openCard("gesture-0"));
		await page.waitForTimeout(350);
		assert.deepEqual(await homeChrome(), original);
		await page.evaluate(() => window.__app.closeNative());
		await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
		assert.deepEqual(await homeChrome(), original);
	}
	await page.emulateMedia({ colorScheme: "light" });
	console.log("PASS home header and navigation stay stable through detail exit in light and dark");
	// A preceding keyboard action must not disable a later wheel gesture's animation.
	await page.keyboard.press("Tab");
	await page.mouse.wheel(0, 1);
	await page.evaluate(() => window.__app.openCard("gesture-0", true));
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__app.closeNative());
	assert.equal(await page.locator("#modal").evaluate((el: HTMLDialogElement) => el.open), true);
	await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
	console.log("PASS reader closes with a visible exit after keyboard-to-wheel input");

	for (const reading of [false, true]) {
		await page.evaluate((reading) => window.__app.openCard("gesture-1", reading), reading);
		await page.waitForTimeout(450);
		const scroll = page.locator(reading ? "#reader-scroll" : ".sheet-scroll");
		await scroll.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await page.waitForTimeout(180);
		await scroll.hover({ position: { x: 160, y: 120 } });
		for (let i = 0; i < 6; i++) {
			await page.mouse.wheel(0, 40);
			await page.waitForTimeout(30);
		}
		await page.waitForSelector(".push-ring.is-done");
		await page.waitForTimeout(160);
		assert.equal(
			await page.locator("#modal").evaluate((el: HTMLDialogElement) => el.open),
			true,
			"the completion check has time to register",
		);
		await page.waitForFunction(() => window.__app.sheetLeaving);
		const duration = await page.evaluate(() => {
			const el = document.querySelector(
				window.__app.modalKind === "reader" ? "#modal" : ".preview-sheet",
			);
			return el
				.getAnimations()
				.filter((animation) =>
					(animation.effect as KeyframeEffect).getKeyframes().some((frame) => frame.transform),
				)
				.map((animation) => animation.effect.getTiming().duration);
		});
		assert.ok(
			duration.includes(reading ? 220 : 260),
			"the completion check is followed by a visible exit",
		);
		await page.waitForFunction(() => !(document.querySelector("#modal") as HTMLDialogElement).open);
		await page.waitForTimeout(250);
	}
	console.log("PASS read completion confirms first, then animates preview and reader exits");

	await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal").open);
	await page.evaluate(() => {
		(document.activeElement as HTMLElement)?.blur();
		window.scrollTo(0, 0);
		window.__refreshCalls = 0;
		window.__app.refresh = async () => {
			window.__refreshCalls++;
			return true;
		};
	});
	await page.waitForFunction(() => scrollY === 0 && !window.__app.sheetLeaving);
	await page.waitForTimeout(700);
	await page.mouse.move(180, 350);
	for (const delta of [40, 40, 40, 40, 34, 28, 22, 16, 12]) {
		await page.mouse.wheel(0, -delta);
		await page.waitForTimeout(35);
		assert.equal(
			await page.evaluate(() => window.__refreshCalls),
			0,
			"slower wheel input is not release",
		);
	}
	await page.waitForFunction(() => window.__refreshCalls === 1);
	await page.waitForTimeout(70);
	assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "loading");
	await page.waitForTimeout(300);
	assert.equal(await page.locator("#pull-ring").getAttribute("data-state"), "success");
	await page.screenshot({ path: "tests/artifacts/gesture-refresh-success.png" });
	assert.deepEqual(errors, []);
	console.log("PASS wheel refresh waits for release and fast requests retain feedback");
} finally {
	await browser.close();
	server.close();
}
