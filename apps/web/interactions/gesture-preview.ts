import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { Store } from "../data/store.ts";
import { wheelInput, wheelPixels } from "./gesture-input.ts";
import { bindEdgeRebound, gestureContent } from "./gesture-rebound.ts";
import type { Gestures } from "./gestures.ts";
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";
import { deferReadingRefresh } from "./reading-feedback.ts";

/** The read-end ring; shared by the reader and the design-system previews. */
export const pushRingHTML =
	'<svg class="arc" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="8" stroke-dasharray="50.27" stroke-dashoffset="50.27"/></svg><svg class="tick" viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const gesturePreviewMethods = {
	setPreviewFull(this: Gestures, surface: HTMLElement, full: boolean) {
		surface.classList.remove("is-drag");
		MotionEngine.resizeSheet(surface, full);
	},
	bindPreviewExpansion(this: Gestures, surface: HTMLElement) {
		// @design preview-scroll-expansion
		const scroll = surface.querySelector<HTMLElement>(".sheet-scroll");
		if (!scroll) return;
		const token = this.app.modalToken;
		let touching = false,
			cancelled = false,
			pending = false;
		const expand = () => {
			if (
				!pending ||
				cancelled ||
				token !== this.app.modalToken ||
				!surface.isConnected ||
				!this.app.dialog.open ||
				this.app.sheetLeaving ||
				surface.classList.contains("is-drag") ||
				surface.classList.contains("is-full") ||
				scroll.scrollTop <= 4
			)
				return;
			pending = false;
			this.setPreviewFull(surface, true);
		};
		const schedule = () => {
			if (pending && !cancelled && !surface.classList.contains("is-full")) {
				expand();
			}
		};
		// Native scrolling starts the expansion while the finger is still moving.
		scroll.addEventListener(
			"scroll",
			() => {
				pending = true;
				schedule();
			},
			{ passive: true },
		);
		scroll.addEventListener("scrollend", expand, { passive: true });
		surface.addEventListener(
			"touchstart",
			(event) => {
				if (!touching) {
					cancelled = false;
					pending = false;
				}
				touching = true;
				if (event.touches.length !== 1) cancelled = true;
			},
			{ passive: true },
		);
		surface.addEventListener(
			"touchend",
			(event) => {
				touching = event.touches.length > 0;
				if (!touching) expand();
			},
			{ passive: true },
		);
		surface.addEventListener(
			"touchcancel",
			() => {
				touching = false;
				cancelled = true;
			},
			{ passive: true },
		);
		for (const event of ["wheel", "keydown"])
			surface.addEventListener(
				event,
				() => {
					cancelled = false;
				},
				{ passive: true },
			);
	},
	bindPreviewHandle(this: Gestures, surface: HTMLElement) {
		const handle = surface.querySelector<HTMLButtonElement>(".sheet-handle");
		const scroll = surface.querySelector<HTMLElement>(".sheet-scroll");
		if (!handle || !scroll) return;
		const token = this.app.modalToken;
		let drag: {
			id: number;
			x: number;
			y: number;
			full: boolean;
			live: boolean;
			base: number;
			velocity: ReturnType<Gestures["velocity"]>;
		} | null = null;
		let frame = 0,
			distance = 0;
		const paint = () => {
			frame = 0;
			if (!drag || !current()) return;
			// Keep text geometry stable; upward travel resists until release expands the sheet.
			MotionEngine.move(surface, `0 ${distance > 0 ? distance : distance * 0.25}px`, true);
		};
		const current = () => token === this.app.modalToken && surface.isConnected;
		const snap = (full: boolean) => {
			if (!current()) return;
			cancelAnimationFrame(frame);
			frame = 0;
			this.setPreviewFull(surface, full);
		};
		const cancel = () => {
			if (!drag) return;
			const previous = drag;
			drag = null;
			snap(previous.full);
		};
		handle.addEventListener("pointerdown", (event: PointerEvent) => {
			if (!current() || event.button !== 0 || !event.isPrimary) return;
			distance = 0;
			drag = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				full: surface.classList.contains("is-full"),
				live: false,
				base: this.capture(surface),
				velocity: this.velocity(event.clientY),
			};
			handle.setPointerCapture(event.pointerId);
		});
		handle.addEventListener("pointermove", (event: PointerEvent) => {
			if (!drag || drag.id !== event.pointerId || !current()) return;
			const dy = event.clientY - drag.y,
				dx = event.clientX - drag.x;
			if (!drag.live && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) return cancel();
			if (!drag.live && Math.abs(dy) < 6) return;
			drag.live = true;
			surface.classList.add("is-drag");
			if (event.cancelable) event.preventDefault();
			drag.velocity.feed(event.clientY);
			distance = drag.base + dy;
			if (!frame) frame = requestAnimationFrame(paint);
		});
		handle.addEventListener("pointerup", (event: PointerEvent) => {
			if (!drag || drag.id !== event.pointerId || !current()) return;
			const previous = drag,
				dy = previous.base + event.clientY - previous.y;
			cancelAnimationFrame(frame);
			frame = 0;
			drag = null;
			if (!previous.live) {
				snap(previous.full);
				return;
			}
			// Suppress the click synthesized after a drag; keyboard clicks still toggle.
			handle.dataset.dragged = "true";
			window.setTimeout(() => {
				delete handle.dataset.dragged;
			}, 0);
			if (dy >= this.value("handle-distance", 160)) {
				MotionEngine.move(surface, `0 ${dy}px`, true);
				this.exitSurface(surface, () => this.app.closeModal());
				return;
			}
			snap(dy < -40 ? true : dy > 40 ? false : previous.full);
		});
		handle.addEventListener("pointercancel", cancel);
		handle.addEventListener("lostpointercapture", cancel);
		handle.addEventListener("click", () => {
			if (handle.dataset.dragged || !current()) return;
			snap(!surface.classList.contains("is-full"));
		});
	},
	bindPreviewResistance(this: Gestures, surface: HTMLElement) {
		// Desktop edges belong to native scrolling; only phone sheets retain custom travel.
		if (!this.phone.matches) return;
		const scroll = surface.querySelector<HTMLElement>(".sheet-scroll");
		if (!scroll) return;
		const token = this.app.modalToken;
		bindEdgeRebound(
			scroll,
			() => token === this.app.modalToken && surface.isConnected,
			(event) => this.fromField(event),
			() => !!surface.querySelector(".push-ring"),
		);
	},

	bindPush(this: Gestures, id?: any, scroll?: any) {
		const app = this.app,
			dialog = app.dialog;
		if (!dialog.querySelector("#reader-end") || !Store.pref("collapseOnFinish")) return;
		const host = dialog.classList.contains("reader")
			? dialog
			: dialog.querySelector(".preview-sheet");
		if (!host) return;
		const chip = document.createElement("div");
		chip.className = "push-ring";
		chip.setAttribute("aria-hidden", "true");
		chip.innerHTML = pushRingHTML;
		host.appendChild(chip);
		const arc = chip.querySelector(".arc circle:last-child"),
			bar = dialog.querySelector(
				":scope > .phone-drawer > .float-bar, :scope > .float-bar, .reader .float-bar",
			) as HTMLElement | null;
		const desktop = !matchMedia("(max-width:650px)").matches;
		// React may reuse the toolbar node for the next card.
		if (bar?.dataset.readComplete) {
			bar.style.visibility = "";
			delete bar.dataset.readComplete;
		}
		const barVisibility = bar?.style.visibility || "";
		const need = 120,
			token = app.modalToken,
			wheel = this.intent();
		let pull = 0,
			timer = 0,
			frame = 0,
			touch = null,
			done = false,
			released = false,
			leaving = false,
			changedOnFinish = false;
		const release = () => {
			if (!done || released) return;
			released = true;
			clearTimeout(timer);
			leave();
		};
		const atEnd = () =>
			(!dialog.hasAttribute("data-phone-drawer") || host.classList.contains("is-full")) &&
			scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
		const paint = () => {
			if (app.modalToken !== token) return;
			chip.style.opacity = String(Math.min(1, pull / 30));
			chip.style.transform = "none";
			arc.setAttribute("stroke-dashoffset", String(50.27 * (1 - Math.min(1, pull / need))));
			MotionEngine.move(
				gestureContent(scroll),
				pull ? `0 ${-Math.round(pull * tokens.motion.finishTravel)}px` : "",
				pull > 0,
				{ spring: tokens.motion.edgeSpring },
			);
			if (bar) {
				bar.style.opacity = pull ? "0" : "";
				MotionEngine.move(bar, pull ? "0 16px" : "", pull > 0);
			}
		};
		const finish = () => {
			if (done || app.modalToken !== token) return;
			done = true;
			touch = null;
			host.classList.remove("is-drag");
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			frame = 0;
			pull = need;
			paint();
			chip.classList.add("is-done");
			// Completion owns the toolbar until this detail leaves, including pending reveal animations.
			if (bar) {
				bar.dataset.readComplete = String(token);
				bar.style.visibility = "hidden";
			}
			chip.style.transform = "scale(1)";
			changedOnFinish = !Store.item(id).read || Store.item(id).progress !== 1;
			if (changedOnFinish) {
				Store.patch(id, { read: true, progress: 1 });
			}
		};
		// A touch keeps the check until release; wheel completion starts the exit immediately.
		// Give the check a paint opportunity without rebuilding the background in those frames.
		const leave = () => {
			// A stale route still clears the badge in the frame below.
			if (!done || leaving) return;
			leaving = true;
			const changed = changedOnFinish;
			requestAnimationFrame(() => {
				if (app.modalToken !== token) {
					// A changed route can keep this surface cached; never leave its success badge behind.
					chip.remove();
					if (desktop && bar?.dataset.readComplete === String(token)) {
						bar.style.visibility = barVisibility;
						delete bar.dataset.readComplete;
					}
					return;
				}
				if (changed) {
					deferReadingRefresh(app, id);
				}
				requestAnimationFrame(() => {
					if (app.modalToken !== token) {
						chip.remove();
						return;
					}
					// The check leaves with the detail, on the same spring as the close.
					const fade = MotionEngine.animate(chip, [{ opacity: 1 }, { opacity: 0 }], {
						spring: "card",
						fill: "forwards",
					});
					if (fade)
						fade.finished.then(
							() => chip.remove(),
							() => chip.remove(),
						);
					else chip.remove();
					// A stacked preview folds back to the card below it; reading returns to the desk.
					if (app.modalKind === "preview" || app.previewTrail?.length) app.closeModal();
					else app.closeToDesk(true);
				});
			});
		};
		const set = (v?: any) => {
			if (done || app.modalToken !== token) return;
			pull = Math.max(0, Math.min(need, v));
			if (pull >= need) {
				finish();
				return;
			}
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0;
					paint();
				});
		};
		const cancel = () => {
			touch = null;
			if (done || app.modalToken !== token) return;
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			frame = 0;
			wheel.reset();
			pull = 0;
			host.classList.remove("is-drag");
			paint();
		};
		scroll.addEventListener(
			"scroll",
			() => {
				if (!atEnd() && pull && !done) {
					pull = 0;
					paint();
				}
			},
			{ passive: true },
		);
		scroll.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				if (app.modalToken !== token || done) return;
				if (this.fromField(e) || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return cancel();
				const d = wheelPixels(e, scroll.clientHeight);
				const eligible = d > 0 && atEnd();
				// A push that has begun keeps counting: wheel notches and an uneven trackpad hand both
				// reach the check. Momentum that merely arrives at the end still cannot begin one.
				const pushing = eligible && pull > 0;
				if (!wheel.feed(d, eligible) && !pushing) {
					if (!eligible && pull) {
						pull = 0;
						paint();
					}
					return;
				}
				if (e.cancelable) e.preventDefault();
				set(pull + Math.min(40, d) * 0.5);
				if (done) {
					this.swallowMomentum(d);
					release();
					return;
				}
				clearTimeout(timer);
				// The ring holds between notches and returns only once the hand has really stopped.
				timer = window.setTimeout(() => {
					if (!done && app.modalToken === token) {
						pull = 0;
						paint();
						wheel.reset();
					}
				}, wheelInput.pushHoldMs);
			},
			{ passive: false },
		);

		scroll.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (
					e.touches.length === 1 &&
					!this.fromField(e) &&
					atEnd() &&
					!done &&
					app.modalToken === token
				)
					touch = { ...this.point(e) };
			},
			{ passive: true },
		);
		scroll.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!touch) return;
				if (e.touches.length !== 1 || app.modalToken !== token) return cancel();
				const point = this.point(e),
					dy = touch.y - point.y;
				if (Math.abs(point.x - touch.x) > Math.abs(dy)) return cancel();
				host.classList.add("is-drag");
				if (dy <= 0) {
					if (pull) {
						pull = 0;
						paint();
					}
					return;
				}
				set(dy * 0.7);
			},
			{ passive: true },
		);
		scroll.addEventListener("touchend", () => {
			if (done) release();
			else cancel();
		});
		scroll.addEventListener(
			"touchcancel",
			() => {
				if (done) release();
				else cancel();
			},
			{ passive: true },
		);
	},
};
