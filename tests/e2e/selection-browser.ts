/** Selection gestures use synthetic cards on an isolated origin, never a user's workspace. */
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
	assert.equal(await page.locator(".selection-lift .selection-stack").isVisible(), true);
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
async function openFromButton(page: any) {
	const trigger = page.locator('[data-action="selection-menu"]');
	await trigger.focus();
	await page.keyboard.press("Enter");
	await page.waitForFunction(
		() => (document.querySelector("#selection-menu") as HTMLDialogElement).open,
	);
}
async function checkThumbnail(page: any, container: string) {
	const clone = page.locator(`${container} .selection-stack-face > .feed-card`);
	assert.equal(await clone.count(), 1, "the thumbnail must be a real card DOM clone");
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
	await scenario(
		"Phone stationary long press of selected cards opens the menu on release",
		async (page) => {
			await selectTwo(page);
			const before = await snapshot(page),
				p = await point(page);
			const session = await page.context().newCDPSession(page);
			await touch(session, "touchStart", p);
			await page.waitForTimeout(440);
			assert.equal(await isMenuOpen(page), false);
			await touch(session, "touchEnd");
			await page.waitForTimeout(500);
			await checkMenu(page, phone.viewport.width, phone.viewport.height);
			await unchanged(page, before);
		},
		phone,
	);
	for (const mobile of [false, true]) {
		for (const reduced of [false, true]) {
			const options = {
				...(mobile ? phone : desktop),
				reducedMotion: reduced ? "reduce" : "no-preference",
			};
			const label = `${mobile ? "Phone 390×844" : "Desktop"}${reduced ? " reduced motion" : ""}`;
			await scenario(
				`${label}: a lifted stack becomes a persistent menu without writing`,
				async (page) => {
					await selectTwo(page);
					const before = await snapshot(page);
					const gesture = await beginLift(page, mobile);
					assert.equal(
						await page.locator(".selection-lift .selection-stack-count").textContent(),
						"2",
					);
					await checkThumbnail(page, ".selection-lift");
					await unchanged(page, before);
					await page.screenshot({
						path: path.join(
							artifacts,
							`selection-lift-${mobile ? "phone" : "desktop"}${reduced ? "-reduced" : ""}.png`,
						),
						animations: "disabled",
					});
					await gesture.release();
					await page.waitForTimeout(500);
					assert.equal(await page.locator(".selection-lift").count(), 0);
					await checkMenu(page, options.viewport.width, options.viewport.height);
					await unchanged(page, before);
					await page.screenshot({
						path: path.join(
							artifacts,
							`selection-menu-${mobile ? "phone" : "desktop"}${reduced ? "-reduced" : ""}.png`,
						),
						animations: "disabled",
					});
					await page.keyboard.press("Escape");
					await waitClosed(page);
					await unchanged(page, before);
					assert.equal(
						await page
							.locator('[data-card="selection-01"] .card-title-button')
							.evaluate((node: HTMLElement) => node === document.activeElement),
						true,
					);
				},
				options,
			);
		}
	}
	for (const mobile of [false, true]) {
		for (const edge of ["top", "bottom"]) {
			const options = mobile ? phone : desktop;
			await scenario(
				`${mobile ? "Phone" : "Desktop"}: release at ${edge} anchors and clamps the menu`,
				async (page) => {
					await selectTwo(page);
					const before = await snapshot(page);
					const gesture = await beginLift(page, mobile);
					const at =
						edge === "top"
							? { x: 20, y: 48 }
							: { x: options.viewport.width - 20, y: options.viewport.height - 40 };
					await gesture.moveTo(at);
					const tracked = await page.evaluate(() => ({ ...window.__app.drag.active.point }));
					assert.deepEqual(tracked, at);
					await gesture.release();
					await page.waitForTimeout(350);
					await checkMenu(page, options.viewport.width, options.viewport.height);
					const context = page.locator("#selection-menu .selection-context");
					assert.equal(
						await context.getAttribute("data-placement"),
						edge === "top" ? "below" : "above",
					);
					const box = await context.boundingBox();
					assert.ok(
						box.x >= 15 &&
							box.y >= 15 &&
							box.x + box.width <= options.viewport.width - 15 &&
							box.y + box.height <= options.viewport.height - 15,
						JSON.stringify(box),
					);
					assert.ok(
						edge === "top" ? box.x < 32 : box.x + box.width > options.viewport.width - 32,
						"menu ignored the latest horizontal release position",
					);
					await unchanged(page, before);
				},
				options,
			);
		}
	}
	await scenario("Keyboard menu traps focus and returns to its trigger", async (page) => {
		await selectTwo(page);
		const before = await snapshot(page);
		await openFromButton(page);
		await checkMenu(page, desktop.viewport.width, desktop.viewport.height);
		const trigger = await page.locator('[data-action="selection-menu"]').boundingBox();
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
				.locator('[data-action="selection-menu"]')
				.evaluate((node: HTMLElement) => node === document.activeElement),
			true,
		);
	});
	for (const dismissal of ["cancel", "backdrop", "touchcancel", "blur"]) {
		await scenario(
			`Menu ${dismissal} preserves selection and card data`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				await openFromButton(page);
				if (dismissal === "cancel") await page.locator('[data-selection-action="cancel"]').click();
				if (dismissal === "backdrop") await page.mouse.click(4, 4);
				if (dismissal === "touchcancel")
					await page.evaluate(() =>
						document.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true })),
					);
				if (dismissal === "blur")
					await page.evaluate(() => window.dispatchEvent(new Event("blur")));
				await waitClosed(page);
				await unchanged(page, before);
			},
			phone,
		);
	}
	for (const dismissal of ["Escape", "touchcancel", "blur"]) {
		await scenario(
			`Active phone lift ${dismissal} leaves no menu or stuck visual`,
			async (page) => {
				await selectTwo(page);
				const before = await snapshot(page);
				const gesture = await beginLift(page, true);
				if (dismissal === "Escape") await page.keyboard.press("Escape");
				if (dismissal === "blur")
					await page.evaluate(() => window.dispatchEvent(new Event("blur")));
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
				await openFromButton(page);
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
			await openFromButton(page);
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
