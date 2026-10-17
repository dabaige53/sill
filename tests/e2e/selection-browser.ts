/** Selection gestures use synthetic cards on an isolated origin, never a user's workspace. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { icon } from "../../apps/web/atoms/icons.ts";

const root = path.resolve(import.meta.dirname, "../..");
const load = createRequire(
	process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
		? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json")
		: import.meta.url,
);
const { chromium } = load("playwright");
const artifacts = path.join(root, "tests/artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req, res) => {
	if (req.url !== "/index.html") {
		res.writeHead(404);
		res.end();
		return;
	}
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
	res.end(fs.readFileSync(path.join(root, "dist/web/index.html")));
});
const results: any[] = [];
const firstIds = ["selection-01", "selection-02"];
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const desktop = { viewport: { width: 1440, height: 1000 } };
let browser: any;

const snapshot = (page: any) =>
	page.evaluate(() => ({
		cards: window.__store.state.cards,
		items: window.__store.state.items,
		stored: JSON.parse(localStorage.getItem("sill-v1")),
	}));
const selection = (page: any) => page.evaluate(() => [...window.__app.selected].sort());
const selectTwo = (page: any) =>
	page.evaluate(
		(ids: string[]) =>
			ids.forEach((id) => {
				window.__app.select(id, { add: true });
			}),
		firstIds,
	);
const isMenuOpen = (page: any) =>
	page.locator("#selection-menu").evaluate((node: HTMLDialogElement) => node.open);
const waitClosed = (page: any) =>
	page.waitForFunction(
		() => !(document.querySelector("#selection-menu") as HTMLDialogElement).open,
	);
const unchanged = async (page: any, before: any) => {
	assert.deepEqual(await snapshot(page), before, "a gesture or dismissal changed card data");
	assert.deepEqual(await selection(page), firstIds, "dismissal lost the selected cards");
	assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 0);
};
async function point(page: any) {
	const target = page.locator('[data-card="selection-01"] .card-summary');
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	assert.ok(box, "fixture card has no visible summary");
	return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}
async function touch(session: any, type: string, p?: { x: number; y: number }) {
	await session.send("Input.dispatchTouchEvent", {
		type,
		touchPoints: p ? [{ ...p, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [],
	});
}
async function beginLift(page: any, mobile: boolean) {
	const p = await point(page);
	const session = mobile ? await page.context().newCDPSession(page) : null;
	if (mobile) await touch(session, "touchStart", p);
	else {
		await page.mouse.move(p.x, p.y);
		await page.mouse.down();
	}
	await page.waitForTimeout(440);
	assert.equal(await page.locator(".selection-lift,.selected-tick").count(), 0);
	const moved = { x: p.x + 30, y: p.y + 65 };
	if (mobile) await touch(session, "touchMove", moved);
	else await page.mouse.move(moved.x, moved.y, { steps: 3 });
	return {
		moveTo: async (next: { x: number; y: number }) => {
			if (mobile) await touch(session, "touchMove", next);
			else await page.mouse.move(next.x, next.y, { steps: 3 });
		},
		release: async () => {
			if (mobile) await touch(session, "touchEnd");
			else await page.mouse.up();
		},
		cancel: async () => {
			if (mobile) await touch(session, "touchCancel");
			else {
				await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel")));
				await page.mouse.up();
			}
		},
	};
}
async function openFromKeyboard(page: any) {
	const trigger = page.locator('[data-action="selected-bookmark"]');
	await trigger.focus();
	await page.keyboard.press("Shift+F10");
	await page.waitForFunction(
		() => (document.querySelector("#selection-menu") as HTMLDialogElement).open,
	);
}
async function checkThumbnail(page: any, container: string) {
	// Like Photos: each chosen card (up to three) is a real clone in the pile; the first one chosen lies on top.
	assert.equal(
		await page.locator(`${container} .selection-stack-face > .feed-card`).count(),
		2,
		"every chosen card must be a real card DOM clone",
	);
	const clone = page.locator(`${container} .selection-stack-face[data-layer="0"] > .feed-card`);
	assert.equal(await clone.count(), 1, "the top of the pile must be a real card DOM clone");
	assert.equal(
		await clone.locator(".card-summary").textContent(),
		await page.locator('[data-card="selection-01"] .card-summary').textContent(),
	);
	assert.equal(
		await clone.locator("button,a,input,textarea,select,[tabindex],[contenteditable]").count(),
		0,
	);
	assert.equal(
		await clone.evaluate((node: HTMLElement) =>
			[node, ...node.querySelectorAll("*")].some((child) =>
				[...child.attributes].some(
					(attr) => attr.name === "id" || /^(aria-|data-|on)/.test(attr.name),
				),
			),
		),
		false,
	);
	assert.equal(
		await page
			.locator(`${container} .selection-stack`)
			.evaluate((node: HTMLElement) => node.inert && node.getAttribute("aria-hidden") === "true"),
		true,
	);
}
async function checkMenu(page: any, width: number, height: number) {
	assert.equal(await isMenuOpen(page), true);
	assert.deepEqual(
		await page
			.locator("#selection-menu [data-selection-action]")
			.evaluateAll((buttons: HTMLElement[]) =>
				buttons.map((button) => button.dataset.selectionAction),
			),
		["bookmark", "later", "tag", "cancel"],
	);
	assert.equal(await page.locator("#selection-menu [role=group]").count(), 3);
	assert.equal(await page.locator("#selection-menu .selection-options svg").count(), 3);
	const options = await page.locator("#selection-menu .selection-options").boundingBox();
	assert.ok(
		Math.abs(options.width - 240) < 1,
		"the action menu should retain its compact 240px width",
	);
	await checkThumbnail(page, "#selection-menu");
	assert.equal(await page.locator("#selection-menu .selection-stack-count").textContent(), "2");
	assert.equal(
		await page.evaluate(() => (document.activeElement as HTMLElement).dataset.selectionAction),
		"bookmark",
		"the first action must receive focus",
	);
	const boxes = await page
		.locator("#selection-menu [data-selection-action]")
		.evaluateAll((nodes: HTMLElement[]) =>
			nodes.map((node) => node.getBoundingClientRect().toJSON()),
		);
	assert.ok(
		boxes.every(
			(r: any) =>
				r.width >= 44 &&
				r.height >= 44 &&
				r.left >= 0 &&
				r.top >= 0 &&
				r.right <= width &&
				r.bottom <= height,
		),
		`menu actions must fit the viewport and meet the touch target: ${JSON.stringify(boxes)}`,
	);
	assert.equal(
		await page.locator('#drop-targets,[data-drop],[data-selection-action="ai"]').count(),
		0,
	);
}

try {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	async function scenario(name: string, fn: (page: any) => Promise<void>, options: any = desktop) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		page.setDefaultTimeout(6000);
		const errors: string[] = [],
			external: string[] = [];
		page.on("pageerror", (error: Error) => errors.push(error.message));
		await context.route("**/*", (route: any) => {
			const url = route.request().url();
			if (url.startsWith(origin + "/") || url.startsWith("data:")) return route.continue();
			external.push(url);
			return route.abort();
		});
		await page.addInitScript(() => {
			const cards = Array.from({ length: 12 }, (_, i) => ({
				id: `selection-${String(i + 1).padStart(2, "0")}`,
				type: "article",
				title: `选择测试 ${i + 1}`,
				summary: "这是隔离测试卡片。长按、移动与关闭菜单都不应修改正文或阅读状态。",
				body: ["仅用于选择交互的合成数据，不读取真实工作区。"],
				tags: [],
				time: Date.now() - i * 60000,
			}));
			localStorage.setItem(
				"sill-v1",
				JSON.stringify({
					version: 4,
					cards,
					items: {},
					seconds: 0,
					preferences: { stack: false, onboarded: true, sort: "time", archiveAfter: "never" },
				}),
			);
		});
		try {
			await page.goto(origin + "/index.html");
			await page.waitForFunction(
				() => window.__app && document.querySelector('[data-card="selection-01"]'),
			);
			await page.evaluate(() => {
				window.__selectionProbe = { patches: 0, refreshes: 0 };
				const patch = window.__store.patch.bind(window.__store);
				window.__store.patch = (...args: any[]) => {
					window.__selectionProbe.patches++;
					return patch(...args);
				};
				const refresh = window.__app.refresh.bind(window.__app);
				window.__app.refresh = (...args: any[]) => {
					window.__selectionProbe.refreshes++;
					return refresh(...args);
				};
			});
			await fn(page);
			assert.deepEqual(errors, [], "uncaught browser errors");
			assert.deepEqual(external, [], "selection must not contact external services");
			results.push({ name, status: "PASS" });
			console.log("PASS", name);
		} catch (error: any) {
			const screenshot = `selection-failure-${results.length + 1}.png`;
			await page
				.screenshot({ path: path.join(artifacts, screenshot), animations: "disabled" })
				.catch(() => {});
			results.push({ name, status: "FAIL", error: error.message, screenshot, errors, external });
			console.error("FAIL", name, error.message);
		} finally {
			await context.close();
		}
	}
	for (const options of [desktop, phone]) {
		await scenario(
			`${options === phone ? "Phone" : "Desktop"}: direct icon actions replace ellipsis, select-all, and menu buttons`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				assert.equal(
					await page
						.locator(
							'[data-action="card-more"],.card-more-trigger,[data-action="select-all"],[data-action="selection-menu"]',
						)
						.count(),
					0,
				);
				assert.deepEqual(
					await page
						.locator("#selection-bar button")
						.evaluateAll((buttons: HTMLElement[]) =>
							buttons.map((button) => button.dataset.action),
						),
					["selected-bookmark", "selected-later", "selected-tag", "clear-selection", "selected-ai"],
				);
				for (const [action, glyph] of [
					["bookmark", "bookmark"],
					["later", "glasses"],
					["tag", "tag"],
				]) {
					const button = page.locator(`[data-action="selected-${action}"]`);
					assert.equal(
						await button.evaluate((node: HTMLElement, expected: string) => {
							const template = document.createElement("template");
							template.innerHTML = expected;
							return node.innerHTML === template.innerHTML;
						}, icon(glyph)),
						true,
						`${action} uses its approved icon`,
					);
					assert.ok(await button.getAttribute("aria-label"));
				}
				await page.locator('[data-action="selected-later"]').click({ button: "right" });
				await checkMenu(page, options.viewport.width, options.viewport.height);
				await page.keyboard.press("Escape");
				await waitClosed(page);
				assert.equal(
					await page
						.locator('[data-action="selected-later"]')
						.evaluate((node: HTMLElement) => node === document.activeElement),
					true,
				);
				await unchanged(page, before);
			},
			options,
		);
	}
	for (const action of ["bookmark", "later", "tag"]) {
		await scenario(
			`Direct ${action} button reuses the bulk action without a menu`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await page.locator(`[data-action="selected-${action}"]`).click();
				assert.equal(await isMenuOpen(page), false);
				assert.deepEqual(await selection(page), []);
				if (action === "tag") {
					await page.locator("#tag-new").waitFor();
					assert.deepEqual(await snapshot(page), before, "opening tags must not write");
					await page.locator("#tag-new").fill("直接标签");
					await page.locator('[data-action="save-note"]').click();
					await page.waitForFunction(
						() => !(document.querySelector("#modal") as HTMLDialogElement).open,
					);
					for (const id of firstIds)
						assert.deepEqual((await snapshot(page)).items[id].tags, ["直接标签"]);
				} else {
					const after = await snapshot(page),
						key = action === "bookmark" ? "bookmarked" : "later";
					for (const id of firstIds) {
						assert.equal(after.items[id][key], true);
						assert.deepEqual(
							{ ...after.items[id], [key]: before.items[id][key] },
							before.items[id],
						);
					}
				}
				const after = await snapshot(page);
				assert.deepEqual(after.cards, before.cards);
				assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
				assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
			},
			phone,
		);
	}

	await scenario(
		"Phone stationary long press selects; tapping a second card adds it",
		async (page) => {
			const before = await snapshot(page),
				p = await point(page);
			const session = await page.context().newCDPSession(page);
			await touch(session, "touchStart", p);
			await page.waitForTimeout(440);
			await touch(session, "touchEnd");
			assert.deepEqual(await selection(page), [firstIds[0]]);
			assert.equal(await isMenuOpen(page), false);
			assert.equal(await page.locator(".selection-lift").count(), 0);
			await page.waitForTimeout(420);
			await page.locator('[data-card="selection-02"] .card-summary').tap();
			await unchanged(page, before);
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				false,
			);
		},
		phone,
	);
	for (const mobile of [false, true]) {
		for (const reduced of [false, true]) {
			await scenario(
				`${mobile ? "Phone" : "Desktop"}: held selection stays in place${reduced ? " with reduced motion" : ""}`,
				async (page) => {
					const before = await snapshot(page);
					const gesture = await beginLift(page, mobile);
					assert.equal(
						await page.locator(".is-drag-source,.selection-lift,.selected-tick").count(),
						0,
					);
					assert.equal(
						await page
							.locator('[data-card="selection-01"]')
							.evaluate((n) => n.classList.contains("is-selected")),
						true,
					);
					await gesture.release();
					assert.equal(await isMenuOpen(page), false);
					await page.waitForTimeout(420);
					const second = page.locator('[data-card="selection-02"] .card-summary');
					if (mobile) await second.tap();
					else await second.click();
					assert.deepEqual(await selection(page), firstIds);
					const repeated = await beginLift(page, mobile);
					await repeated.release();
					assert.equal(await isMenuOpen(page), false);
					await unchanged(page, before);
					await page.waitForTimeout(420);
					await page.locator('[data-action="clear-selection"]').click();
					assert.equal(
						await page.locator("#selection-bar").evaluate((n: HTMLElement) => n.inert),
						true,
					);
					await page.waitForTimeout(220);
					assert.equal(await page.locator("#selection-bar").isVisible(), false);
				},
				{ ...(mobile ? phone : desktop), reducedMotion: reduced ? "reduce" : "no-preference" },
			);
		}
	}
	await scenario("Keyboard menu traps focus and returns to its trigger", async (page) => {
		await selectTwo(page);
		const before = await snapshot(page);
		await openFromKeyboard(page);
		await checkMenu(page, desktop.viewport.width, desktop.viewport.height);
		const trigger = await page.locator('[data-action="selected-bookmark"]').boundingBox();
		const context = await page.locator("#selection-menu .selection-context").boundingBox();
		assert.equal(
			await page.locator("#selection-menu .selection-context").getAttribute("data-placement"),
			"above",
		);
		assert.ok(
			Math.abs(context.x + context.width / 2 - (trigger.x + trigger.width / 2)) < 1,
			"keyboard opening should anchor to its trigger",
		);
		await page.keyboard.press("Shift+Tab");
		assert.equal(
			await page.evaluate(() => (document.activeElement as HTMLElement).dataset.selectionAction),
			"cancel",
		);
		await page.keyboard.press("Tab");
		assert.equal(
			await page.evaluate(() => (document.activeElement as HTMLElement).dataset.selectionAction),
			"bookmark",
		);
		await page.keyboard.press("ArrowDown");
		assert.equal(
			await page.evaluate(() => (document.activeElement as HTMLElement).dataset.selectionAction),
			"later",
		);
		await page.keyboard.press("n");
		assert.equal(
			await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
			false,
			"global shortcuts leaked through the menu",
		);
		await page.keyboard.press("Escape");
		await waitClosed(page);
		await unchanged(page, before);
		assert.equal(
			await page
				.locator('[data-action="selected-bookmark"]')
				.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
		);
	});
	for (const dismissal of ["cancel", "backdrop", "touchcancel", "blur", "resize"]) {
		await scenario(
			`Menu ${dismissal} preserves selection and card data`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await openFromKeyboard(page);
				if (dismissal === "cancel") await page.locator('[data-selection-action="cancel"]').click();
				if (dismissal === "backdrop") await page.mouse.click(4, 4);
				if (dismissal === "touchcancel")
					await page.evaluate(() =>
						document.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true })),
					);
				if (["blur", "resize"].includes(dismissal))
					await page.evaluate((type: string) => window.dispatchEvent(new Event(type)), dismissal);
				await waitClosed(page);
				await unchanged(page, before);
			},
			phone,
		);
	}
	for (const dismissal of ["Escape", "touchcancel", "blur", "resize"]) {
		await scenario(
			`Active phone lift ${dismissal} leaves no menu or stuck visual`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, true);
				if (dismissal === "Escape") await page.keyboard.press("Escape");
				if (["blur", "resize"].includes(dismissal))
					await page.evaluate((type: string) => window.dispatchEvent(new Event(type)), dismissal);
				await gesture.cancel();
				assert.equal(await isMenuOpen(page), false);
				assert.equal(
					await page.locator(".selection-lift,.is-drag-source,body.is-dragging").count(),
					0,
				);
				await unchanged(page, before);
			},
			phone,
		);
	}
	for (const action of ["bookmark", "later"]) {
		await scenario(
			`Only explicit ${action} changes the two selected cards`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await openFromKeyboard(page);
				await unchanged(page, before);
				await page.locator(`[data-selection-action="${action}"]`).click();
				await waitClosed(page);
				const after = await snapshot(page),
					key = action === "bookmark" ? "bookmarked" : "later";
				assert.deepEqual(after.cards, before.cards);
				for (const id of firstIds) {
					assert.equal(after.items[id][key], true);
					assert.deepEqual({ ...after.items[id], [key]: before.items[id][key] }, before.items[id]);
				}
				assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
				assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
				assert.deepEqual(await selection(page), []);
			},
			phone,
		);
	}
	await scenario(
		"Tag action opens the existing bulk editor and saves only on request",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page);
			await openFromKeyboard(page);
			await page.locator('[data-selection-action="tag"]').click();
			await page.locator("#tag-new").waitFor();
			assert.equal(await isMenuOpen(page), false);
			assert.deepEqual(await snapshot(page), before, "opening tags must not write");
			await page.locator("#tag-new").fill("测试标签");
			assert.deepEqual(await snapshot(page), before, "typing a tag must not write");
			await page.locator('[data-action="save-note"]').click();
			await page.waitForFunction(
				() => !(document.querySelector("#modal") as HTMLDialogElement).open,
			);
			const after = await snapshot(page);
			for (const id of firstIds) assert.deepEqual(after.items[id].tags, ["测试标签"]);
			assert.deepEqual(after.items["selection-03"], before.items["selection-03"]);
			assert.deepEqual(after.cards, before.cards);
			assert.equal(await page.evaluate(() => window.__selectionProbe.patches), 2);
		},
	);
	await scenario(
		"Selected cards allow short touch scrolling and suppress pull refresh",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page),
				session = await page.context().newCDPSession(page);
			await touch(session, "touchStart", { x: 190, y: 400 });
			for (let i = 1; i <= 6; i++) {
				await touch(session, "touchMove", { x: 190, y: 400 - i * 32 });
				await page.waitForTimeout(20);
			}
			await touch(session, "touchEnd");
			await page.waitForTimeout(250);
			assert.ok(
				await page.evaluate(() => scrollY > 30),
				"normal touch movement should scroll the feed",
			);
			assert.equal(await isMenuOpen(page), false);
			assert.equal(await page.locator(".selection-lift").count(), 0);
			await page.evaluate(() => scrollTo(0, 0));
			await page.waitForTimeout(100);
			await touch(session, "touchStart", { x: 190, y: 210 });
			await touch(session, "touchMove", { x: 190, y: 430 });
			await touch(session, "touchEnd");
			await page.waitForTimeout(500);
			assert.equal(await page.evaluate(() => window.__selectionProbe.refreshes), 0);
			assert.equal(
				await page
					.locator("body")
					.evaluate((node: HTMLElement) => node.classList.contains("is-pulling")),
				false,
			);
			await unchanged(page, before);
		},
		phone,
	);
	await scenario(
		"Selected cards suppress wheel refresh and card native drag payloads",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page);
			await page.mouse.move(300, 100);
			await page.mouse.wheel(0, -240);
			await page.waitForTimeout(500);
			assert.equal(await page.evaluate(() => window.__selectionProbe.refreshes), 0);
			const native = await page
				.locator('[data-card="selection-01"]')
				.evaluate((node: HTMLElement) => {
					const dataTransfer = new DataTransfer();
					const event = new DragEvent("dragstart", {
						bubbles: true,
						cancelable: true,
						dataTransfer,
					});
					node.dispatchEvent(event);
					return {
						prevented: event.defaultPrevented,
						types: [...dataTransfer.types],
						text: dataTransfer.getData("text/plain"),
					};
				});
			assert.deepEqual(native, { prevented: true, types: [], text: "" });
			await unchanged(page, before);
		},
	);
	for (const mobile of [false, true]) {
		await scenario(
			`${mobile ? "Phone" : "Desktop"}: AI drop opens a local-only context window`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, mobile);
				const receiver = await page.locator("#selection-bar .selection-ai-target").boundingBox();
				assert.ok(receiver);
				await gesture.moveTo({
					x: receiver.x + receiver.width / 2,
					y: receiver.y + receiver.height / 2,
				});
				assert.equal(
					await page
						.locator("#selection-bar .selection-ai-target")
						.evaluate((n) => n.classList.contains("is-ready")),
					true,
				);
				await gesture.release();
				await page.locator(".ai-conversation").waitFor();
				assert.equal(await page.locator("[data-ai-context]").count(), 2);
				assert.equal(await page.locator(".selection-drag-count").count(), 0);
				await page.locator("#ai-local-draft").fill("只在本地输入，不发送");
				assert.equal(await page.locator(".ai-conversation button[disabled]").count(), 1);
				await unchanged(page, before);
				await page.locator('#modal [data-action="close"]').click();
				await page.waitForTimeout(250);
				assert.deepEqual(await selection(page), firstIds);
			},
			mobile ? phone : desktop,
		);
	}
	await scenario(
		"Search selection and AI preview preserve the independent home selection",
		async (page) => {
			await page.evaluate(() => window.__app.select("selection-03", { add: true }));
			await page.evaluate(() => window.__app.goTo("search"));
			await page.locator("#filter-search").fill("选择测试");
			await page.waitForTimeout(180);
			const second = page.locator('#search-results [data-card="selection-02"] .card-summary');
			const box = await second.boundingBox();
			assert.ok(box);
			await page.mouse.move(box.x + 20, box.y + 10);
			await page.mouse.down();
			await page.waitForTimeout(440);
			await page.mouse.up();
			assert.deepEqual(await page.evaluate(() => [...window.__app.homeSelected]), ["selection-03"]);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), [
				"selection-02",
			]);
			await page.waitForTimeout(420);
			await page.locator('#search-selection-bar [data-action="selected-ai"]').focus();
			await page.keyboard.press("Enter");
			await page.locator(".ai-conversation").waitFor();
			assert.equal(await page.locator("[data-ai-context]").count(), 1);
			await page.locator('#modal [data-action="close"]').click();
			await page.locator("#filter-search").waitFor();
			assert.equal(await page.locator("#filter-search").inputValue(), "选择测试");
			assert.deepEqual(await page.evaluate(() => [...window.__app.homeSelected]), ["selection-03"]);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), [
				"selection-02",
			]);
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#filter-search").isVisible(), true);
			assert.deepEqual(await page.evaluate(() => [...window.__app.searchSelected]), []);
		},
		desktop,
	);
	const failed = results.filter((result) => result.status === "FAIL");
	assert.equal(
		failed.length,
		0,
		`${failed.length}/${results.length} selection scenarios failed: ${failed.map((result) => result.name).join("; ")}`,
	);
} finally {
	fs.writeFileSync(
		path.join(artifacts, "selection-results.json"),
		JSON.stringify(results, null, 2) + "\n",
	);
	if (browser) await browser.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
