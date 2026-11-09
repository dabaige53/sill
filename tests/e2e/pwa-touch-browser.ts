/** Synthetic PWA checks. Safari callouts and physical safe areas still need a real device. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type CDPSession, chromium, type Locator } from "playwright";
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

async function tooltip(button: Locator, session: CDPSession) {
	const state = await button.evaluate((node: HTMLElement) => {
		const style = getComputedStyle(node, "::after");
		node.setAttribute("data-measure-tooltip", "");
		return {
			label: node.getAttribute("aria-label"),
			opacity: Number(style.opacity),
			focus: node.matches(":focus-visible"),
			selection: getComputedStyle(node).userSelect,
		};
	});
	try {
		const { root } = await session.send("DOM.getDocument");
		const { nodeId } = await session.send("DOM.querySelector", {
			nodeId: root.nodeId,
			selector: "[data-measure-tooltip]",
		});
		const { node } = await session.send("DOM.describeNode", { nodeId });
		const after = node.pseudoElements?.find((pseudo) => pseudo.pseudoType === "after");
		assert.ok(after, "the toolbar control renders its tooltip");
		const { model } = await session.send("DOM.getBoxModel", { backendNodeId: after.backendNodeId });
		const xs = model.border.filter((_, index) => index % 2 === 0);
		return { ...state, left: Math.min(...xs), right: Math.max(...xs) };
	} finally {
		await button.evaluate((node) => node.removeAttribute("data-measure-tooltip"));
	}
}

try {
	for (const width of [320, 390, 1440]) {
		for (const colorScheme of ["light", "dark"] as const) {
			const name = `${width}-${colorScheme}`;
			const context = await browser.newContext({
				viewport: { width, height: width > 650 ? 900 : 844 },
				hasTouch: true,
				isMobile: width <= 650,
				colorScheme,
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
				({ cards }) => {
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
							},
						}),
					);
					Object.defineProperty(navigator, "standalone", { value: true });
				},
				{ cards: materialDensityCards() },
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
				// @wu-test type=behavior | scope=PWA input and viewport | protects=prevent keyboard resizing or touch interaction from obscuring controls | debt=impl-detail
				const platform = await page.evaluate(() => ({
					viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport"]').content,
					textAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
					touch: getComputedStyle(document.querySelector("#dock button")).touchAction,
				}));
				assert.ok(platform.viewport.includes("interactive-widget=resizes-content"));
				assert.equal(platform.textAdjust, "100%");
				assert.equal(platform.touch, "manipulation");
				// @wu-test type=behavior | scope=PWA standalone theme | protects=Keep the selected page theme without a separately painted status bar
				for (const theme of ["dark", "light", "system"]) {
					const actual = await page.evaluate((theme) => {
						window.__app.setPref("theme", theme);
						return {
							theme: document.documentElement.dataset.theme,
							colorScheme: getComputedStyle(document.documentElement).colorScheme,
							themeColors: document.querySelectorAll('meta[name="theme-color"]').length,
						};
					}, theme);
					const expected = theme === "system" ? colorScheme : theme;
					assert.deepEqual(actual, { theme: expected, colorScheme: expected, themeColors: 0 });
				}
				// @wu-test type=behavior | scope=PWA toolbar hints | protects=prevent long press from triggering an action or showing a hint outside the screen
				await page.evaluate(() => window.__app.openCard("review-event"));
				await page.locator("#modal #modal-title").waitFor();
				await page.locator("#modal").evaluate(async (dialog) => {
					await Promise.all(
						dialog.getAnimations({ subtree: true }).map((animation) => animation.finished),
					);
				});
				await screenshot("detail");
				const buttons = page.locator("#modal .float-bar .icon-button");
				// Reading progress is written when the view is left; card actions change the rest.
				const actionState = () =>
					page.evaluate(() => {
						const { progress, ...rest } = window.__store.item("review-event");
						return JSON.stringify(rest);
					});
				const before = await actionState();
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
					tips.push(await tooltip(button, session));
					await screenshot(`tip-${edge}`);
					await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
				}
				await page.waitForFunction(() => !document.querySelector(".float-bar .is-tipping"));
				await buttons.first().focus();
				await page.keyboard.press("Tab");
				await settleTooltip(buttons.nth(1));
				const keyboard = await tooltip(buttons.nth(1), session);
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
				assert.equal(await actionState(), before, "long press and release perform no card action");
				// @wu-test type=boundary | scope=PWA preview controls | protects=prevent standalone preview from exposing an unsupported maximize control
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
} finally {
	await browser.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
