import assert from "node:assert/strict";
import path from "node:path";

export async function runRailMaterial({
	artifacts,
	phone,
	scenario,
	touch,
}: {
	artifacts: any;
	phone: any;
	scenario: any;
	touch: any;
}) {
	await scenario(
		"rail notices fade and survive interrupted dismissal",
		async (page) => {
			// Sample the real animation at its midpoint, independently of CI scheduling.
			const entering = await page.evaluate(() => {
				window.__app.setOffline(true);
				const notice = document.getElementById("offline");
				const animation = notice.getAnimations()[0];
				if (!animation) return { active: false, opacity: Number(getComputedStyle(notice).opacity) };
				animation.pause();
				animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
				return { active: true, opacity: Number(getComputedStyle(notice).opacity) };
			});
			assert.equal(entering.active, true, "notice has a real entrance animation");
			assert.ok(entering.opacity > 0 && entering.opacity < 1, JSON.stringify(entering));
			await page.evaluate(() => window.__app.setOffline(false));
			assert.equal(
				await page.locator("#offline").evaluate((n: HTMLElement) => n.inert),
				true,
				"offline disables input immediately",
			);
			await page.evaluate(() => window.__app.setOffline(true));
			await page.waitForTimeout(300);
			assert.equal(await page.locator("#offline").evaluate((n: HTMLElement) => n.hidden), false);
			await page.evaluate(() => window.__app.setOffline(false));
			await page.waitForFunction(() => document.getElementById("offline").hidden, null, {
				timeout: 3000,
			});
			assert.equal(
				await page.locator("#offline").evaluate((n: HTMLElement) => n.hidden),
				true,
				"offline hides after exit completes",
			);
			await page.evaluate(() => {
				window.__app.pendingCards = [{ id: "synthetic-pending" }];
				window.__app.paintPending();
			});
			await page.waitForTimeout(250);
			assert.equal(await page.locator("#new-count").evaluate((n: HTMLElement) => n.hidden), false);
			await page.evaluate(() => {
				window.__app.pendingCards = [];
				window.__app.paintPending();
			});
			assert.equal(
				await page.locator("#new-count").evaluate((n: HTMLElement) => n.inert),
				true,
				"pending notice disables input immediately",
			);
			await page.waitForFunction(() => document.getElementById("new-count").hidden, null, {
				timeout: 3000,
			});
			assert.equal(
				await page.locator("#new-count").evaluate((n: HTMLElement) => n.hidden),
				true,
				"pending notice hides after exit completes",
			);
		},
		phone,
	);

	await scenario(
		"capsule fades during scrolling, pause and interruption",
		async (page) => {
			const dock = page.locator("#dock");
			await page.evaluate(() => {
				window.scrollTo(0, 400);
			});
			await page.waitForFunction(() =>
				document.querySelector("#dock").classList.contains("is-tucked"),
			);
			await page.waitForTimeout(70);
			const fading = await dock.evaluate((n: HTMLElement) => ({
				opacity: Number(getComputedStyle(n).opacity),
				inert: n.inert,
			}));
			assert.ok(fading.opacity > 0 && fading.opacity < 1);
			assert.equal(fading.inert, true);
			assert.equal(
				await page
					.locator("#account")
					.evaluate((n: HTMLElement) => getComputedStyle(n).pointerEvents),
				"none",
			);
			await page.waitForFunction(
				() => !document.querySelector("#dock").classList.contains("is-tucked"),
			);
			await page.waitForTimeout(70);
			const returning = await dock.evaluate((n: HTMLElement) =>
				Number(getComputedStyle(n).opacity),
			);
			assert.ok(returning > 0 && returning < 1);
			await page.waitForTimeout(450);
			assert.equal(await dock.evaluate((n: HTMLElement) => getComputedStyle(n).opacity), "1");
			await page.locator('[data-extra="search"]').click();
			await page.waitForFunction(() => window.__app.modalKind === "search");
			assert.equal(
				await page
					.locator("#account")
					.evaluate((n: HTMLElement) => getComputedStyle(n).pointerEvents),
				"none",
			);
		},
		phone,
	);

	for (const colorScheme of ["light", "dark"]) {
		await scenario(
			`Sill settings icon: ${colorScheme}`,
			async (page) => {
				const settings = page.locator("#account");
				assert.equal(await settings.getAttribute("aria-label"), "设置");
				assert.equal(await settings.locator(".account-face,.nav-label,img").count(), 0);
				assert.equal(await settings.locator(".account-wrap > .icon path").count(), 1);
				const size = await settings.boundingBox();
				assert.ok(size.width >= 44 && size.height >= 44);
				// Read inherited currentColor and its parent in the same animation frame.
				const colors = await settings.evaluate((n: HTMLElement) => ({
					stroke: getComputedStyle(n.querySelector(".account-wrap > .icon")).stroke,
					color: getComputedStyle(n).color,
				}));
				assert.equal(colors.stroke, colors.color);
				await settings.focus();
				await page.keyboard.press("Enter");
				await page.waitForFunction(() => window.__app.modalKind === "settings");
				assert.equal(await settings.getAttribute("aria-current"), "page");
			},
			{ ...phone, colorScheme },
		);
	}

	for (const width of [320, 390, 1280]) {
		await scenario(
			`Layout stays inside ${width}px with long titles, tags and dates`,
			async (page) => {
				await page.evaluate(() => window.__app.openCard("motion-0"));
				await page.waitForTimeout(500);
				const dimensions = await page
					.locator(".sheet-scroll")
					.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
				assert.ok(dimensions.scroll <= dimensions.client + 1);
				assert.equal(await page.locator(".preview-published").count(), 1);
				await page.screenshot({ path: path.join(artifacts, `drawer-layout-${width}.png`) });
				assert.equal(await page.locator(".preview-meta time").count(), 0);
				const date = await page.locator(".preview-published").boundingBox();
				const title = await page.locator("#modal-title").boundingBox();
				const body = await page.locator(".preview-full").boundingBox();
				assert.ok(date.y > title.y + title.height);
				assert.ok(date.y + date.height <= body.y);
				assert.equal(await page.locator(".preview-source-details").count(), 0);
			},
			{ viewport: { width, height: 844 }, colorScheme: width === 320 ? "dark" : "light" },
		);
	}

	await scenario(
		"Phone short drawers fit content; long articles cap and expand while reading",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			const short = await page.locator(".preview-sheet").boundingBox();
			assert.ok(short.height < 650, JSON.stringify(short));
			assert.ok(Math.abs(short.y + short.height - 844) <= 2);
			assert.equal(await page.locator("#modal-title + .preview-tags").count(), 1);
			await page.screenshot({ path: path.join(artifacts, "drawer-short-phone.png") });
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(500);
			const long = await page.locator(".preview-sheet").boundingBox();
			assert.ok(long.height <= 781 && long.height > 700, JSON.stringify(long));
			await page.locator(".sheet-scroll").evaluate((node) => {
				node.scrollTop = 120;
			});
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			const full = await page.locator(".preview-sheet").boundingBox();
			assert.ok(full.height >= 840, JSON.stringify(full));
			await page.screenshot({ path: path.join(artifacts, "drawer-long-phone.png") });
		},
		phone,
	);
	await scenario(
		"Preview pulled down from its text closes on release, and a short pull glides back",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.waitForTimeout(500);
			await page.locator(".sheet-scroll").evaluate((node) => {
				node.scrollTop = 120;
			});
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			await page.locator(".sheet-scroll").evaluate((node) => {
				node.scrollTop = 0;
			});
			await page.waitForTimeout(100);
			const session = await context.newCDPSession(page);
			const box = await page.locator(".sheet-scroll").boundingBox();
			const y = box.y + 200;
			await touch(session, "touchStart", 180, y);
			await touch(session, "touchMove", 180, y + 60);
			await page.waitForTimeout(200);
			await touch(session, "touchEnd");
			await page.waitForTimeout(450);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			assert.equal(
				await page.locator(".preview-sheet.is-full").count(),
				1,
				"short pull keeps full",
			);
			assert.equal(
				await page.locator(".preview-sheet").evaluate((n: HTMLElement) => n.style.translate),
				"",
			);
			await touch(session, "touchStart", 180, y);
			for (const step of [40, 120, 220, 300]) await touch(session, "touchMove", 180, y + step);
			await page.waitForTimeout(40);
			assert.equal(
				await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
				true,
				"open until release",
			);
			const beforeRelease = await page.locator(".preview-sheet").boundingBox();
			await touch(session, "touchEnd");
			const tops = await page.evaluate(async () => {
				const positions: number[] = [];
				const dialog = document.querySelector<HTMLDialogElement>("#modal");
				const sheet = dialog.querySelector(".preview-sheet");
				for (let i = 0; i < 30 && dialog.open; i++) {
					positions.push(sheet.getBoundingClientRect().top);
					await new Promise(requestAnimationFrame);
				}
				return positions;
			});
			assert.ok(tops.length > 1, "exit stays visible until its animation completes");
			assert.ok(tops[0] >= beforeRelease.y - 1, "release never snaps back before exiting");
			assert.ok(
				tops.every((top, i) => !i || top >= tops[i - 1] - 1),
				"exit moves continuously down",
			);
			await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal").open);
		},
		phone,
	);
	await scenario(
		"Preview end resistance stays bounded and restores the locked background",
		async (page, context) => {
			await page.evaluate(() => {
				window.scrollTo({ top: 500, behavior: "instant" });
			});
			await page.waitForTimeout(50);
			const before = await page.evaluate(() => scrollY);
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			assert.equal(await page.locator("body.modal-scroll-locked").count(), 1);
			const session = await context.newCDPSession(page);
			const box = await page.locator(".sheet-scroll").boundingBox();
			const y = box.y + 150;
			await touch(session, "touchStart", 180, y);
			await touch(session, "touchMove", 180, y - 55);
			await page.waitForTimeout(40);
			const offset = await page
				.locator(".sheet-scroll")
				.evaluate((node) => parseFloat(node.style.translate.split(" ")[1]) || 0);
			assert.ok(offset < 0 && offset >= -14, String(offset));
			await touch(session, "touchCancel");
			await page.waitForTimeout(260);
			assert.equal(
				await page.locator(".sheet-scroll").evaluate((node) => node.style.translate),
				"",
			);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			await page.evaluate(() => window.__app.closeNative());
			await page.waitForTimeout(450);
			assert.equal(await page.locator("body.modal-scroll-locked").count(), 0);
			assert.equal(await page.evaluate(() => scrollY), before);
		},
		phone,
	);
	await scenario(
		"Handle drags up to expand, down to collapse, and cancels without changing state",
		async (page, context) => {
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(500);
			const session = await context.newCDPSession(page);
			const handle = page.locator(".sheet-handle");
			let box = await handle.boundingBox();
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y - 90);
			await touch(session, "touchEnd");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			box = await handle.boundingBox();
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y + 100);
			await touch(session, "touchCancel");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 1);
			await touch(session, "touchStart", 195, box.y + 10);
			await touch(session, "touchMove", 195, box.y + 100);
			await touch(session, "touchEnd");
			await page.waitForTimeout(450);
			assert.equal(await page.locator(".preview-sheet.is-full").count(), 0);
			assert.ok((await page.locator(".preview-sheet").boundingBox()).height < 650);
			// The close disc centres on the source row above the title (ADR 0037).
			const alignment = await page.evaluate(() => {
				const row = document.querySelector(".preview-body > .preview-meta");
				const close = document.querySelector('.sheet-head [data-action="close"]');
				const r = row.getBoundingClientRect();
				return Math.abs(close.getBoundingClientRect().top + 22 - r.top - r.height / 2);
			});
			assert.ok(alignment < 3, String(alignment));
			assert.equal(
				await page
					.locator(".sheet-scroll")
					.evaluate((node) => getComputedStyle(node).scrollbarWidth),
				"none",
			);
		},
		phone,
	);
}
