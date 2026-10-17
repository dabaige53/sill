/** Real keyboard/touch and CSS cascade checks with synthetic cards on an isolated origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const load = createRequire(
	process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
		? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json")
		: import.meta.url,
);
const { chromium } = load("playwright");
const artifacts = path.join(root, "tests/artifacts");
const server = http.createServer((request, response) => {
	if (request.url !== "/index.html") {
		response.writeHead(404);
		response.end();
		return;
	}
	response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	response.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
// Stay within the first 40-card page so this suite isolates chrome and detail interactions.
const cards: any[] = Array.from({ length: 38 }, (_, index) => ({
	id: `motion-${index}`,
	type: "article",
	title: `阅读卡片 ${index + 1}`,
	summary: "保持简洁的摘要，点开查看完整正文。",
	body: Array(30).fill("这段合成正文用于验证手势取消、工具条和键盘导航，不包含个人资料。"),
	time: Date.now() - index * 3600000,
}));
cards.push(
	{
		id: "motion-digest",
		type: "digest",
		title: "正文末尾的交接动作",
		summary: "这张摘要没有悬浮操作栏，末尾操作应该完整可见。",
		body: Array(12).fill("这段合成摘要用于验证阅读到底部之后，完整正文和交接动作仍然清晰。"),
		time: Date.now() - 7200000,
	},
	{
		id: "motion-photo",
		type: "photo",
		title: "照片详情的交接与引用",
		summary: "无法自动复制时，完整引用保留在此详情中，仍可选中和滚动。",
		image: "architecture",
		photos: ["architecture", "architecture"],
		time: Date.now() - 10800000,
	},
);
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const results: { name: string; status: string; error?: string }[] = [];
let browser: any;

async function openSelection(page: any) {
	await page.evaluate(() => {
		window.__app.select("motion-0", { add: true });
		window.__app.select("motion-1", { add: true });
		window.__app.drag.openMenu(["motion-0", "motion-1"]);
	});
}
async function material(page: any) {
	return page.evaluate(() => {
		const menu = document.querySelector(".selection-options"),
			dialog = document.querySelector("#selection-menu"),
			style = getComputedStyle(menu),
			lens = getComputedStyle(document.querySelector(".nav-lens"));
		return {
			background: style.backgroundColor,
			blur: style.backdropFilter,
			shadow: style.boxShadow,
			backdrop: getComputedStyle(dialog, "::backdrop").backdropFilter,
			lensBackground: lens.backgroundColor,
			lensShadow: lens.boxShadow,
		};
	});
}
async function touch(session: any, type: string, x = 200, y = 300) {
	await session.send("Input.dispatchTouchEvent", {
		type,
		touchPoints: type === "touchCancel" || type === "touchEnd" ? [] : [{ x, y, id: 1 }],
	});
}
async function denyClipboard(page: any) {
	await page.evaluate(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async () => {
					throw new DOMException("Denied for test", "NotAllowedError");
				},
			},
		});
		document.execCommand = () => false;
	});
}

try {
	fs.mkdirSync(artifacts, { recursive: true });
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	});
	async function scenario(
		name: string,
		run: (page: any, context: any) => Promise<void>,
		options = {},
	) {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 900 },
			...options,
		});
		const page = await context.newPage(),
			errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (error: Error) => errors.push(error.message));
		await context.route("**/*", (route: any) => {
			const url = route.request().url();
			if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
			external.push(url);
			return route.abort();
		});
		await context.addInitScript((cards: any[]) => {
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards,
					items: {},
					preferences: { onboarded: true, stack: false },
				}),
			);
		}, cards);
		try {
			await page.goto(`${origin}/index.html`);
			await page.waitForFunction(
				() =>
					window.__app &&
					window.__app.layout.frame === 0 &&
					document.documentElement.scrollHeight > 1200,
			);
			await run(page, context);
			assert.deepEqual(errors, []);
			assert.deepEqual(external, []);
			results.push({ name, status: "PASS" });
			console.log("PASS", name);
		} catch (error: any) {
			results.push({ name, status: "FAIL", error: error.message });
			await page.screenshot({
				path: path.join(artifacts, `motion-material-failure-${results.length}.png`),
			});
			console.error("FAIL", name, error.message);
		} finally {
			await context.close();
		}
	}

	await scenario("Real Tab reaches a completely hidden rail from the feed", async (page) => {
		await page.evaluate(() => {
			const buttons = document
				.querySelector(".feed-grid > .feed-item:last-child")
				.querySelectorAll("button");
			(buttons[buttons.length - 1] as HTMLElement).focus({ preventScroll: true });
			window.scrollTo({ top: 600, behavior: "instant" });
		});
		await page.waitForFunction(() => scrollY === 600);
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
		assert.equal(focus.extra, "home", JSON.stringify(focus));
		assert.equal(
			await page.locator("#dock").evaluate((node: Element) => getComputedStyle(node).visibility),
			"visible",
		);
	});

	await scenario("App transparency preference covers menu and search backdrops", async (page) => {
		await openSelection(page);
		await page.evaluate(() => {
			window.__store.setPref("reduceTransparency", true);
			window.__app.applyPreferences();
		});
		const result = await material(page);
		assert.equal(result.background, "rgb(255, 255, 255)");
		assert.equal(result.blur, "none");
		assert.equal(result.backdrop, "none");
		assert.equal(result.lensBackground, "rgb(240, 240, 242)");
		assert.match(result.lensShadow, /inset/);
		await page.evaluate(() => {
			window.__app.drag.closeMenu();
			window.__app.openPanel("search");
		});
		assert.equal(
			await page
				.locator("#modal")
				.evaluate((node: Element) => getComputedStyle(node, "::backdrop").backdropFilter),
			"none",
		);
	});

	await scenario(
		"System transparency and increased contrast keep dark menus solid and outlined",
		async (page, context) => {
			const session = await context.newCDPSession(page);
			await session.send("Emulation.setEmulatedMedia", {
				features: [
					{ name: "prefers-reduced-transparency", value: "reduce" },
					{ name: "prefers-contrast", value: "more" },
				],
			});
			await page.evaluate(() => {
				window.__store.setPref("theme", "dark");
				window.__app.applyPreferences();
			});
			await openSelection(page);
			const result = await material(page);
			assert.equal(result.background, "rgb(28, 28, 31)");
			assert.equal(result.blur, "none");
			assert.equal(result.backdrop, "none");
			assert.match(result.shadow, /rgb\(242, 242, 244\)/);
			assert.equal(result.lensBackground, "rgb(38, 38, 42)");
			assert.match(result.lensShadow, /rgb\(242, 242, 244\)/);
		},
	);

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
							rule instanceof CSSSupportsRule && rule.conditionText.includes("backdrop-filter"),
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

	await scenario(
		"Reduced motion includes head tools and preserves immediate keyboard visibility",
		async (page, context) => {
			const session = await context.newCDPSession(page);
			await session.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-reduced-motion", value: "reduce" }],
			});
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.evaluate(() => window.__app.sheetHide.hide());
			await page.waitForTimeout(100);
			const motion = await page.locator(".sheet-head-tools").evaluate((node: Element) => ({
				transform: getComputedStyle(node).transform,
				duration: getComputedStyle(node).transitionDuration,
			}));
			assert.equal(motion.transform, "none");
			assert.ok(motion.duration.startsWith("0.07s"));
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
		},
	);

	await scenario(
		"Reduced phone navigation keeps its lens and does not become a draggable sheet",
		async (page, context) => {
			await page.evaluate(() => {
				window.__store.setPref("reduceMotion", true);
				window.__app.applyPreferences();
			});
			await page.locator('#nav [data-extra="ai"]').click();
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
			assert.equal(state.animation, "none");
			assert.ok(!state.transition.includes("translate"));
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
			assert.equal(
				await home.locator(".nav-icon").evaluate((node: Element) => getComputedStyle(node).scale),
				"none",
			);
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
				window.__app.openCard("motion-digest");
				// Current card types share a toolbar. Exercise the supported no-toolbar layout explicitly.
				window.__app.dialog.querySelector(":scope > .float-bar").remove();
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
			await page.evaluate(() => window.__app.openCard("motion-0"));
			assert.equal(await page.locator("#modal > .float-bar").count(), 1);
			assert.equal(
				await page
					.locator(".preview-sheet")
					.evaluate((node: Element) => getComputedStyle(node, "::after").content),
				'""',
			);
		},
		phone,
	);

	await scenario(
		"Photo handoff and a denied clipboard leave a readable reference below the thumbnails",
		async (page) => {
			await denyClipboard(page);
			await page.evaluate(() => window.__app.openCard("motion-photo"));
			await page
				.locator("#modal")
				.evaluate((node: Element) =>
					Promise.all(
						node
							.getAnimations({ subtree: true })
							.map((animation) => animation.finished.catch(() => {})),
					),
				);
			const action = page.locator('#modal [data-action="agent-handoff"]');
			const before = await action.boundingBox(),
				thumbs = await page.locator(".lightbox-thumbs").boundingBox();
			assert.ok(before.height >= 44 && before.y >= thumbs.y + thumbs.height - 1);
			assert.ok(before.y + before.height <= 844 - 12 + 1);
			assert.equal(
				await action.evaluate((node: Element) => getComputedStyle(node).color),
				"rgb(255, 255, 255)",
			);
			await action.click();
			const field = page.locator(".agent-reference-field");
			await field.waitFor();
			const reference = await field.evaluate((node: HTMLTextAreaElement) => ({
				value: node.value,
				selected: node.selectionStart === 0 && node.selectionEnd === node.value.length,
				readonly: node.readOnly,
				scrollable: node.scrollHeight > node.clientHeight,
				color: getComputedStyle(node).color,
				selectable: getComputedStyle(node).userSelect,
			}));
			assert.match(reference.value, /motion-photo/);
			assert.equal(reference.selected, true);
			assert.equal(reference.readonly, true);
			assert.equal(reference.scrollable, true);
			assert.equal(reference.selectable, "text");
			assert.equal(reference.color, "rgb(255, 255, 255)");
			const stage = await page.locator(".lightbox-stage").boundingBox(),
				footer = await page.locator(".preview-foot").boundingBox(),
				panel = await page.locator(".agent-reference").boundingBox(),
				close = page.locator('[data-action="agent-reference-close"]'),
				closeBox = await close.boundingBox();
			assert.ok(stage.height > 100 && panel.y >= footer.y + footer.height - 1);
			assert.ok(panel.y + panel.height <= 844 && closeBox.height >= 44);
			await close.click();
			assert.equal(await field.count(), 0);
			assert.equal(await action.evaluate((node: Element) => document.activeElement === node), true);
		},
		phone,
	);

	await scenario(
		"Scrolling a retained reference never pushes the reader to completion",
		async (page) => {
			await denyClipboard(page);
			await page.evaluate(() => window.__app.openCard("motion-0", true));
			await page.locator('#modal [data-action="agent-handoff"]').click();
			const field = page.locator(".agent-reference-field");
			await field.waitFor();
			await page.locator(".reader-scroll").evaluate((node: HTMLElement) => {
				node.scrollTop = node.scrollHeight;
			});
			await field.evaluate((node: HTMLTextAreaElement) => {
				node.scrollTop = 0;
			});
			const box = await field.boundingBox();
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 80);
			await page.waitForTimeout(500);
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				true,
			);
			assert.equal(await page.locator(".push-ring.is-done").count(), 0);
			assert.ok(await field.evaluate((node: HTMLTextAreaElement) => node.scrollTop > 0));
		},
	);

	await scenario(
		"Real touchCancel restores the phone sheet without closing or writing",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(420);
			const before = await page.evaluate(() => localStorage.getItem("sill-v1"));
			const session = await context.newCDPSession(page);
			await touch(session, "touchStart");
			await touch(session, "touchMove", 200, 390);
			assert.equal(
				await page
					.locator(".preview-sheet")
					.evaluate((node: Element) => node.classList.contains("is-drag")),
				true,
			);
			await touch(session, "touchCancel");
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
					.evaluate((node: Element) => node.classList.contains("is-off")),
				true,
			);
			assert.equal(
				await page
					.locator(".float-bar")
					.evaluate((node: Element) => node.classList.contains("is-hidden")),
				true,
			);
			await page.waitForFunction(
				() => !(document.getElementById("modal") as HTMLDialogElement).open,
			);
		},
		phone,
	);

	await scenario(
		"A delayed gesture dismissal leaves a newly opened search usable",
		async (page) => {
			await page.evaluate(() => {
				window.__app.openCard("motion-0");
				window.__app.gestures.dismiss(() => window.__app.closeNative(false));
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
} finally {
	await browser?.close();
	server.close();
	fs.writeFileSync(
		path.join(artifacts, "motion-material-browser.json"),
		JSON.stringify(results, null, 2),
	);
}
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
