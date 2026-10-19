import assert from "node:assert/strict";

export async function runGestureInterruption({ phone, scenario }: { phone: any; scenario: any }) {
	await scenario(
		"A menu holds an entering card without stopping its fade or its own entry",
		async (page) => {
			const states = await page.evaluate(() => {
				window.__app.renderCurrent(true);
				const card = document.querySelector<HTMLElement>('[data-card="motion-0"]');
				const entering = card
					.getAnimations()
					.find((animation) =>
						(animation.effect as KeyframeEffect)
							.getKeyframes()
							.some((frame) => "transform" in frame),
					);
				if (!entering) throw new Error("Expected the real card entry animation");
				entering.pause();
				const timing = entering.effect.getTiming();
				entering.currentTime = Number(timing.delay) + Number(timing.duration) / 2;
				const read = () => ({
					transform: getComputedStyle(card).transform,
					opacity: getComputedStyle(card).opacity,
					time: entering.currentTime,
					state: entering.playState,
				});
				const before = read();
				window.__app.more("motion-0");
				const held = read(),
					menu = card.querySelector<HTMLElement>(".card-more-menu");
				const menuEntry = menu
					.getAnimations()
					.find((animation) =>
						(animation.effect as KeyframeEffect)
							.getKeyframes()
							.some((frame) => "transform" in frame),
					);
				menuEntry.pause();
				menuEntry.currentTime = Number(menuEntry.effect.getTiming().duration) / 2;
				const menuTransform = getComputedStyle(menu).transform;
				const menuOpacity = getComputedStyle(menu).opacity;
				window.__app.closeMore();
				const exit = menu.getAnimations()[0];
				exit.pause();
				exit.currentTime = 0;
				return {
					before,
					held,
					resumed: read(),
					menuTransform,
					menuOpacity,
					exitTransform: getComputedStyle(menu).transform,
					exitOpacity: getComputedStyle(menu).opacity,
					entryState: menuEntry.playState,
					easing: exit.effect.getTiming().easing,
				};
			});
			assert.notEqual(states.before.transform, "none");
			assert.equal(states.held.transform, "none", "an open menu fixes its card during entry");
			assert.equal(
				states.held.opacity,
				states.before.opacity,
				"the original fade is uninterrupted",
			);
			assert.equal(states.held.time, states.before.time);
			assert.equal(states.held.state, "paused");
			assert.notEqual(
				states.menuTransform,
				"none",
				"the card's hold does not suppress its menu animation",
			);
			assert.deepEqual(states.resumed, states.before, "closing resumes the same animation frame");
			assert.equal(states.entryState, "idle", "closing cancels the unfinished entry");
			assert.equal(states.exitTransform, states.menuTransform, "exit preserves the drawn position");
			assert.equal(states.exitOpacity, states.menuOpacity, "exit preserves the drawn opacity");
			assert.equal(states.easing, "cubic-bezier(0.23, 1, 0.32, 1)");
		},
	);

	await scenario(
		"Reader progress scales from the left without changing layout width",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("motion-0", true));
			await page.waitForTimeout(300);
			const progress = await page.evaluate(async () => {
				const scroll = document.querySelector<HTMLElement>("#reader-scroll");
				const bar = document.querySelector<HTMLElement>("#reader-progress");
				const before = bar.offsetWidth;
				scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
				window.__app.updateReading("motion-0", scroll);
				await new Promise(requestAnimationFrame);
				return {
					before,
					after: bar.offsetWidth,
					width: bar.style.width,
					transform: bar.style.transform,
					origin: getComputedStyle(bar).transformOrigin,
					properties: getComputedStyle(bar).transitionProperty,
				};
			});
			assert.equal(progress.after, progress.before);
			assert.equal(progress.width, "");
			assert.ok(Math.abs(Number(progress.transform.slice(7, -1)) - 0.5) < 0.01);
			assert.match(progress.origin, /^0px /);
			assert.equal(progress.properties, "transform");
		},
	);

	await scenario(
		"Style priorities preserve gesture and toolbar behavior",
		async (page) => {
			await page.evaluate(() => window.__app.openCard("motion-0"));
			await page.locator("#modal.preview[open]").waitFor();
			await page.waitForTimeout(700);
			const states = await page.evaluate(() => {
				const sheet = document.querySelector<HTMLElement>(".preview-sheet"),
					scroll = sheet.querySelector<HTMLElement>(".sheet-scroll"),
					bar = document.querySelector<HTMLElement>("#modal > .float-bar"),
					head = sheet.querySelector<HTMLElement>(".sheet-head-tools");
				const transition = (node: HTMLElement) => {
					const style = getComputedStyle(node);
					return {
						properties: style.transitionProperty.split(", "),
						transform: style.transform,
						durations: style.transitionDuration.split(", ").map(Number.parseFloat),
						delays: style.transitionDelay.split(", ").map(Number.parseFloat),
					};
				};
				const initial = transition(sheet);
				sheet.classList.add("is-drag");
				const dragging = transition(sheet),
					nested = transition(scroll);
				sheet.classList.remove("is-drag");
				scroll.classList.add("is-drag");
				const directScroll = transition(scroll);
				scroll.classList.remove("is-drag");
				bar.classList.add("is-tucked");
				head.classList.add("is-tucked");
				return {
					initial,
					dragging,
					nested,
					directScroll,
					bar: transition(bar),
					head: transition(head),
				};
			});
			assert.deepEqual(
				states.nested.properties,
				["none"],
				"content under a dragged parent follows immediately",
			);
			assert.deepEqual(states.dragging.properties, ["none"]);
			assert.deepEqual(states.directScroll.properties, ["none"]);
			assert.ok(
				states.initial.properties.every((property) =>
					["transform", "translate"].includes(property),
				),
				"ordinary sheets animate position without transitioning geometry",
			);
		},
		phone,
	);

	await scenario(
		"A delayed gesture dismissal leaves a newly opened search usable",
		async (page) => {
			await page.evaluate(() => {
				window.__app.openCard("motion-0");
				window.__app.gestures.exitSurface(document.querySelector(".preview-sheet"), () =>
					window.__app.closeNative(false),
				);
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
	for (const mode of ["rebound", "exit"])
		await scenario(
			`A new handle drag continues from the visible ${mode} position`,
			async (page) => {
				await page.evaluate(() => window.__app.openCard("motion-0"));
				await page.waitForTimeout(500);
				const result = await page.evaluate(async (mode) => {
					const sheet = document.querySelector<HTMLElement>(".preview-sheet");
					const handle = sheet.querySelector<HTMLButtonElement>(".sheet-handle");
					sheet.classList.add("is-drag");
					sheet.style.translate = "0 90px";
					if (mode === "exit")
						window.__app.gestures.exitSurface(sheet, () => window.__app.closeModal());
					else window.__app.gestures.settle(sheet);
					const rebound = sheet
						.getAnimations()
						.find((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => "translate" in k));
					rebound.pause();
					rebound.currentTime = 90;
					const before = sheet.getBoundingClientRect().top;
					handle.setPointerCapture = () => {};
					handle.dispatchEvent(
						new PointerEvent("pointerdown", {
							pointerId: 77,
							isPrimary: true,
							button: 0,
							clientX: 100,
							clientY: 200,
						}),
					);
					const grabbed = sheet.getBoundingClientRect().top;
					handle.dispatchEvent(
						new PointerEvent("pointermove", {
							pointerId: 77,
							isPrimary: true,
							clientX: 100,
							clientY: 210,
						}),
					);
					await new Promise(requestAnimationFrame);
					const moved = sheet.getBoundingClientRect().top;
					handle.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 77 }));
					return { before, grabbed, moved, state: rebound.playState };
				}, mode);
				assert.ok(Math.abs(result.grabbed - result.before) < 1);
				assert.ok(Math.abs(result.moved - result.before - 10) < 1);
				assert.equal(result.state, "idle");
			},
			phone,
		);
}
