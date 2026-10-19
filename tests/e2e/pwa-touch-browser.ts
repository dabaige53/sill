/** Synthetic PWA checks. Safari callouts and physical safe areas still need a real device. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, type Locator } from "playwright";
import { materialDensityCards, reviewTime } from "./material-density-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(
	root,
	"tests/artifacts/pwa-touch",
	process.env.SILL_EVIDENCE_PHASE || "after",
);
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((_request, response) => {
	response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	response.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const results: { name: string; status: string; error?: string }[] = [];

async function settleTooltip(button: Locator) {
	await button.evaluate(async (node) => {
		await Promise.all(
			node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
		);
	});
}

async function tooltip(button: Locator) {
	return button.evaluate((node: HTMLElement) => {
		const style = getComputedStyle(node, "::after");
		const rect = node.getBoundingClientRect();
		const width =
			parseFloat(style.width) +
			(style.boxSizing === "border-box"
				? 0
				: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight));
		const x = style.translate.split(" ")[0];
		const translateX = x.endsWith("%") ? (parseFloat(x) * width) / 100 : parseFloat(x) || 0;
		const left =
			style.left === "auto"
				? rect.right - parseFloat(style.right) - width + translateX
				: rect.left + parseFloat(style.left) + translateX;
		return {
			label: node.getAttribute("aria-label"),
			left,
			right: left + width,
			opacity: Number(style.opacity),
			translate: style.translate,
			focus: node.matches(":focus-visible"),
			selection: getComputedStyle(node).userSelect,
		};
	});
}

try {
	for (const motion of ["normal", "system", "app"] as const) {
		const reduced = motion !== "normal";
		for (const width of reduced ? [320] : [320, 390, 1440]) {
			for (const colorScheme of ["light", "dark"] as const) {
				const name = `${width}-${colorScheme}${reduced ? `-${motion}-reduced` : ""}`;
				const context = await browser.newContext({
					viewport: { width, height: width > 650 ? 900 : 844 },
					hasTouch: true,
					isMobile: width <= 650,
					colorScheme,
					reducedMotion: motion === "system" ? "reduce" : "no-preference",
				});
				const page = await context.newPage();
				const errors: string[] = [];
				page.on("pageerror", (error) => errors.push(error.message));
				await context.route("**/*", (route) =>
					route.request().url().startsWith(origin) || route.request().url().startsWith("data:")
						? route.continue()
						: route.abort(),
				);
				await page.clock.setFixedTime(new Date(reviewTime));
				await page.addInitScript(
					({ cards, reduceMotion }) => {
						localStorage.setItem(
							"sill-v1",
							JSON.stringify({
								version: 4,
								cards,
								items: {},
								preferences: {
									onboarded: true,
									stack: false,
									theme: "system",
									archiveAfter: "never",
									reduceMotion,
								},
							}),
						);
						Object.defineProperty(navigator, "standalone", { value: true });
					},
					{ cards: materialDensityCards(), reduceMotion: motion === "app" },
				);
				const screenshot = (view: string) =>
					page.screenshot({ path: path.join(artifacts, `${name}-${view}.png`) });
				try {
					await page.goto(origin);
					await page.waitForFunction(() => window.__app?.layout.frame === 0);
					await page.evaluate(async () => {
						await document.fonts.ready;
						await Promise.all(
							document.getAnimations().map((animation) => animation.finished.catch(() => {})),
						);
					});
					await screenshot("home");
					await page.evaluate(() => window.__app.openCard("review-event"));
					await page.waitForTimeout(500);
					await screenshot("detail");
					const buttons = page.locator("#modal > .float-bar .icon-button");
					const before = await page.evaluate(() =>
						JSON.stringify(window.__store.item("review-event")),
					);
					const session = await context.newCDPSession(page);
					const tips = [];
					for (const [edge, button] of [
						["first", buttons.first()],
						["last", buttons.last()],
					] as const) {
						const box = await button.boundingBox();
						await session.send("Input.dispatchTouchEvent", {
							type: "touchStart",
							touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
						});
						await button.waitFor({ state: "visible" });
						await page.waitForFunction(() => !!document.querySelector(".float-bar .is-tipping"));
						await settleTooltip(button);
						tips.push(await tooltip(button));
						await screenshot(`tip-${edge}`);
						await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
					}
					await page.waitForFunction(() => !document.querySelector(".float-bar .is-tipping"));
					await buttons.first().focus();
					await page.keyboard.press("Tab");
					await settleTooltip(buttons.nth(1));
					const keyboard = await tooltip(buttons.nth(1));
					await screenshot("keyboard");
					fs.writeFileSync(
						path.join(artifacts, `${name}-metrics.json`),
						JSON.stringify({ tips, keyboard }, null, 2),
					);
					assert.equal(keyboard.focus, true, "real Tab reaches a toolbar control");
					assert.equal(keyboard.opacity, 1, "keyboard focus shows the control name");
					assert.ok(
						await page
							.locator("#dock button")
							.evaluateAll((nodes) =>
								nodes.every((node) => getComputedStyle(node).userSelect === "none"),
							),
						"navigation controls also suppress text selection",
					);
					for (const tip of tips) {
						assert.equal(tip.opacity, 1);
						assert.ok(tip.left >= 0 && tip.right <= width, JSON.stringify(tip));
						assert.equal(tip.selection, "none", "long presses cannot select toolbar text");
					}
					if (reduced) {
						assert.ok(
							[...tips, keyboard].every((tip) => !tip.translate.endsWith("4px")),
							"reduced motion has no vertical tooltip displacement",
						);
						await page.keyboard.press("Tab");
						const hidden = await tooltip(buttons.nth(1));
						assert.equal(
							hidden.translate,
							keyboard.translate,
							"hiding the name does not move it in reduced motion",
						);
					}
					assert.equal(
						await page.evaluate(() => JSON.stringify(window.__store.item("review-event"))),
						before,
						"long press and release perform no card action",
					);
					assert.equal(
						await page.locator('.sheet-head [data-action="reader"]').count(),
						0,
						"standalone preview has no maximize control",
					);
					assert.deepEqual(errors, []);
					results.push({ name, status: "PASS" });
					console.log("PASS", name);
				} catch (error) {
					results.push({ name, status: "FAIL", error: error.message });
					console.error("FAIL", name, error.message);
				} finally {
					await context.close();
				}
			}
		}
	}
} finally {
	await browser.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
