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
			// Observe both fades in-page before scrolling, so CI round trips cannot miss them.
			await page.evaluate(() => {
				const dock = document.querySelector<HTMLElement>("#dock");
				const samples: {
					fading: { opacity: number; inert: boolean } | null;
					returning: number | null;
				} = { fading: null, returning: null };
				(window as any).__railFadeSamples = samples;
				const sample = () => {
					const opacity = Number(getComputedStyle(dock).opacity);
					const tucked = dock.classList.contains("is-tucked");
					if (opacity > 0 && opacity < 1) {
						if (tucked && !samples.fading) samples.fading = { opacity, inert: dock.inert };
						if (!tucked && samples.fading) samples.returning = opacity;
					}
					if (!samples.returning && performance.now() < deadline) requestAnimationFrame(sample);
				};
				const deadline = performance.now() + 5000;
				requestAnimationFrame(sample);
				window.scrollTo(0, 400);
			});
			await page.waitForFunction(() => (window as any).__railFadeSamples.fading);
			const fading = await page.evaluate(() => (window as any).__railFadeSamples.fading);
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
			await page.waitForFunction(() => (window as any).__railFadeSamples.returning);
			const returning = await page.evaluate(() => (window as any).__railFadeSamples.returning);
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
			`Person avatar opens settings: ${colorScheme}`,
			async (page) => {
				const settings = page.locator("#account");
				assert.equal(await settings.getAttribute("aria-label"), "设置");
				assert.equal(await settings.locator(".account-face,.nav-label").count(), 0);
				assert.equal(await settings.locator(".account-wrap > .account-avatar").count(), 1);
				assert.ok(
					await settings
						.locator(".account-avatar")
						.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
				);
				const size = await settings.boundingBox();
				assert.ok(size.width >= 44 && size.height >= 44);
				// Read inherited currentColor and its parent in the same animation frame.
				const colors = await settings.evaluate((n: HTMLElement) => ({
					stroke: getComputedStyle(n.querySelector(".account-wrap > .icon")).stroke,
					color: getComputedStyle(n.querySelector(".account-wrap")).color,
				}));
				assert.equal(colors.stroke, colors.color);
				await settings.focus();
				await page.keyboard.press("Enter");
				await page.waitForFunction(() => window.__app.modalKind === "settings");
				assert.equal(await settings.getAttribute("aria-current"), null);
				assert.equal(
					await page.locator('#nav [aria-current="page"]').getAttribute("data-extra"),
					"home",
				);
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
				assert.equal(await page.locator(".preview-meta").count(), 1);
				await page.screenshot({ path: path.join(artifacts, `drawer-layout-${width}.png`) });
				assert.equal(await page.locator(".preview-meta time").count(), 0);
				const date = await page.locator(".preview-meta").boundingBox();
				const title = await page.locator("#modal-title").boundingBox();
				const body = await page.locator(".preview-full").boundingBox();
				assert.ok(date.y + date.height <= title.y);
				assert.ok(date.y + date.height <= body.y);
				assert.equal(await page.locator(".preview-source-details").count(), 0);
			},
			{ viewport: { width, height: 844 }, colorScheme: width === 320 ? "dark" : "light" },
		);
	}

	await scenario(
		"Phone drawers cover the bottom edge and scroll long content",
		async (page) => {
			for (const id of ["short-task", "motion-0"]) {
				await page.evaluate((id) => window.__app.openCard(id), id);
				await page.locator('.phone-drawer[data-state="open"]').waitFor();
				await page.locator(".phone-drawer").evaluate(async (node) => {
					await Promise.all(
						node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})),
					);
				});
				const box = await page.locator(".phone-drawer").boundingBox();
				assert.ok(box.height >= 844 * 0.7 - 1 && box.y >= 24, JSON.stringify(box));
				assert.ok(Math.abs(box.y + box.height - 844) < 2, JSON.stringify(box));
				if (id === "motion-0") {
					await page.locator(".sheet-scroll").evaluate((node) => {
						node.scrollTop = 120;
					});
					assert.ok(await page.locator(".sheet-scroll").evaluate((node) => node.scrollTop > 0));
				}
				await page.evaluate(() => window.__app.closeNative());
				await page.locator("#modal[open]").waitFor({ state: "hidden" });
			}
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
		"Drawer cancellation preserves data and restores the page scroll",
		async (page, context) => {
			await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
			const y = await page.evaluate(() => scrollY);
			await page.evaluate(() => window.__app.openCard("short-task"));
			await page.waitForTimeout(600);
			const stored = await page.evaluate(() => localStorage.getItem("sill-v1"));
			assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "hidden");
			const session = await context.newCDPSession(page);
			const handle = await page.locator("[data-vaul-handle]").boundingBox();
			await touch(session, "touchStart", 195, handle.y + 2);
			await touch(session, "touchMove", 195, handle.y + 62);
			await touch(session, "touchCancel");
			await page.waitForTimeout(600);
			assert.equal(await page.locator("#modal").evaluate((node) => node.open), true);
			assert.equal(await page.evaluate(() => localStorage.getItem("sill-v1")), stored);
			await page.locator('.sheet-head [data-action="close"]').click();
			await page.locator("#modal[open]").waitFor({ state: "hidden" });
			assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
			assert.equal(await page.evaluate(() => scrollY), y);
		},
		phone,
	);
}
