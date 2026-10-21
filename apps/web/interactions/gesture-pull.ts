import { copy } from "../copy.ts";
import type { Gestures } from "./gestures.ts";
import { MotionEngine } from "./motion.ts";

export const gesturePullMethods = {
	bindPull(this: Gestures) {
		const ring = document.createElement("button");
		ring.type = "button";
		ring.id = "pull-ring";
		ring.className = "pull-ring glass";
		ring.disabled = true;
		ring.setAttribute("aria-hidden", "true");
		ring.innerHTML =
			'<svg class="pull-progress" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" pathLength="100"/></svg><svg class="pull-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><svg class="pull-retry" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6"/></svg>';
		document.body.appendChild(ring);
		const need = 48,
			circle = ring.querySelector("circle"),
			main = document.querySelector("main");
		let start = null,
			pull = 0,
			busy = false,
			timer = 0,
			holdTimer = 0,
			frame = 0,
			inset = 16,
			headingTop: number | null = null,
			state = "idle";
		const heading = document.querySelector<HTMLElement>(".home-heading");
		const wheel = this.intent();
		let mouse: { id: number; x: number; y: number } | null = null;
		const labels = {
			idle: copy("web.refresh.pull"),
			pulling: copy("web.refresh.pull"),
			loading: copy("web.refresh.loading"),
			success: copy("web.refresh.success"),
			error: copy("web.refresh.retry"),
		};
		const status = (next: keyof typeof labels) => {
			if (state === next && ring.dataset.state === next) return;
			state = next;
			ring.dataset.state = next;
			ring.classList.toggle("is-spinning", next === "loading");
			MotionEngine.loading(ring.querySelector(".pull-progress"), next === "loading");
			ring.disabled = next !== "error";
			ring.setAttribute("aria-hidden", String(next === "idle" || next === "pulling"));
			ring.setAttribute("aria-label", labels[next]);
			ring.setAttribute("aria-busy", String(next === "loading"));
			if (next === "loading" || next === "success" || next === "error")
				this.app.announce?.(labels[next]);
		};
		const measure = () => {
			inset = parseFloat(getComputedStyle(main).paddingTop) || 16;
			const rect = heading?.getBoundingClientRect();
			ring.classList.toggle("in-home-heading", !!rect?.height);
			headingTop = rect?.height ? rect.top + (rect.height - ring.offsetHeight) / 2 : null;
			ring.style.top = headingTop === null ? "" : `${headingTop}px`;
			ring.style.left = headingTop === null ? "" : `${rect.left + rect.width / 2}px`;
		};
		const paint = () => {
			cancelAnimationFrame(frame);
			frame = 0;
			const shift = Math.round(pull * 0.75),
				feedback = state === "loading" || state === "success" || state === "error";
			MotionEngine.move(main, pull ? `0 ${shift}px` : "", state === "pulling");
			// While loading the desk stays open and the ring turns in the gap it made.
			MotionEngine.move(
				ring,
				headingTop !== null
					? "0 0"
					: pull
						? `0 ${Math.round((inset + shift) / 2 - 18)}px`
						: feedback
							? "0 12px"
							: "0 -48px",
				state === "pulling",
			);
			ring.style.opacity = String(feedback ? 1 : Math.min(1, pull / 18));
			circle.style.strokeDashoffset = String(100 - Math.min(100, (pull / need) * 100));
			ring.toggleAttribute("data-ready", pull >= need);
		};
		const schedulePaint = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const cancel = () => {
			mouse = null;
			start = null;
			wheel.reset();
			document.body.classList.remove("is-pulling");
			if (state === "pulling") {
				clearTimeout(timer);
				pull = 0;
				status("idle");
				paint();
			}
		};
		const refresh = async () => {
			if (busy) return;
			busy = true;
			const feedbackReady = new Promise<void>((resolve) =>
				window.setTimeout(resolve, MotionEngine.time("delay-loading")),
			);
			measure();
			start = null;
			wheel.reset();
			clearTimeout(timer);
			// Hold the desk at the threshold while it loads. A slow request lets the cards back after a second;
			// the ring keeps turning above them.
			pull = need;
			document.body.classList.remove("is-pulling");
			status("loading");
			paint();
			clearTimeout(holdTimer);
			holdTimer = window.setTimeout(() => {
				if (state !== "loading") return;
				pull = 0;
				paint();
			}, 1000);
			try {
				const result = await this.app.refresh({ feedback: "pull" });
				if (result === false) throw new Error("Refresh did not complete");
				await feedbackReady;
				status("success");
				timer = window.setTimeout(() => {
					pull = 0;
					status("idle");
					paint();
				}, 480);
			} catch {
				await feedbackReady;
				clearTimeout(holdTimer);
				pull = 0;
				status("error");
			} finally {
				busy = false;
				paint();
			}
		};
		const release = () => {
			start = null;
			mouse = null;
			document.body.classList.remove("is-pulling");
			clearTimeout(timer);
			if (state !== "pulling") return;
			if (this.app.dialog.open || this.app.selected.size || this.app.drag?.active || scrollY > 0)
				return cancel();
			if (pull >= need) refresh();
			else cancel();
		};
		// Mouse dragging has a real release event. Never substitute wheel silence for it.
		document.addEventListener("pointerdown", (e: PointerEvent) => {
			if (e.pointerType !== "mouse" || e.button !== 0 || this.phone.matches) return;
			cancel();
			const target = e.target as Element;
			if (
				busy ||
				state === "success" ||
				scrollY > 0 ||
				this.app.dialog.open ||
				this.app.selected.size ||
				this.app.drag?.active ||
				this.app.drag?.menu?.open ||
				!target.closest?.("main,.home-heading") ||
				target.closest(
					"[data-card],.deck,button,a,input,textarea,select,[role=button],[contenteditable]",
				)
			)
				return;
			measure();
			mouse = { id: e.pointerId, x: e.clientX, y: e.clientY };
		});
		document.addEventListener("pointermove", (e: PointerEvent) => {
			if (!mouse || e.pointerId !== mouse.id) return;
			if (!(e.buttons & 1) || this.app.dialog.open || this.app.drag?.active || scrollY > 0)
				return cancel();
			const dy = e.clientY - mouse.y,
				dx = Math.abs(e.clientX - mouse.x);
			if (dy < -4 || dx > Math.max(12, dy)) return cancel();
			if (dy <= 0) {
				pull = 0;
				schedulePaint();
				return;
			}
			e.preventDefault();
			clearTimeout(timer);
			status("pulling");
			document.body.classList.add("is-pulling");
			pull = Math.min(72, Math.min(dy, 80) * 0.65 + Math.max(0, dy - 80) * 0.18);
			schedulePaint();
		});
		window.addEventListener("pointerup", (e: PointerEvent) => {
			if (mouse && e.pointerId === mouse.id && e.button === 0) release();
		});
		window.addEventListener("pointercancel", (e: PointerEvent) => {
			if (mouse && e.pointerId === mouse.id) cancel();
		});
		window.addEventListener("blur", cancel);
		this.refresh = refresh;
		status("idle");
		paint();
		ring.addEventListener("click", () => {
			if (state === "error") refresh();
		});
		document.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (
					busy ||
					this.app.selected.size > 0 ||
					this.app.drag?.menu?.open ||
					scrollY > 0 ||
					this.app.dialog.open ||
					e.touches.length > 1 ||
					this.fromField(e) ||
					e.target.closest?.("#dock,#toast,#pull-ring,.card-more-menu,.deck")
				)
					return;
				measure();
				start = { ...this.point(e) };
			},
			{ passive: true },
		);
		document.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!start) return;
				if (this.app.drag?.active) return cancel();
				if (e.touches.length !== 1 || this.app.dialog.open) return cancel();
				const p = this.point(e),
					dy = p.y - start.y,
					dx = Math.abs(p.x - start.x);
				if (dy <= 0 || dx > dy) {
					if (pull) {
						pull = 0;
						paint();
					}
					if (dy < -4 || dx > 12) cancel();
					return;
				}
				// If the browser already owns the gesture, do not show a second pull.
				if (!e.cancelable) return cancel();
				e.preventDefault();
				if (state !== "pulling") {
					clearTimeout(timer);
					status("pulling");
				}
				document.body.classList.add("is-pulling");
				// Light initial travel, then progressively stronger resistance beyond threshold.
				pull = Math.min(72, Math.min(dy, 80) * 0.65 + Math.max(0, dy - 80) * 0.18);
				schedulePaint();
			},
			{ passive: false },
		);
		document.addEventListener("touchend", () => {
			if (start) release();
		});
		document.addEventListener("touchcancel", cancel, { passive: true });
		window.addEventListener(
			"wheel",
			(e?: any) => {
				// A held mouse owns its pointer stream; wheel timers cannot commit it.
				if (mouse || e.buttons) return;
				if (
					busy ||
					state === "success" ||
					this.app.selected.size > 0 ||
					this.app.drag?.menu?.open ||
					this.app.dialog.open ||
					scrollY > 0 ||
					e.deltaY >= 0 ||
					Math.abs(e.deltaX) > Math.abs(e.deltaY)
				) {
					cancel();
					return;
				}
				if (!e.cancelable) return cancel();
				e.preventDefault();
				if (!wheel.feed(-e.deltaY)) return;
				if (!pull) measure();
				status("pulling");
				pull = Math.min(need, pull + -e.deltaY * 0.5);
				schedulePaint();
				clearTimeout(timer);
				// Commit after the trackpad input stream stops.
				timer = window.setTimeout(() => {
					release();
					wheel.reset(false);
				}, 180);
			},
			{ passive: false },
		);
	},
	bindPullDown(this: Gestures) {
		const app = this.app,
			dialog = app.dialog,
			reader = dialog.classList.contains("reader"),
			phone = MotionEngine.phoneSheet(dialog);
		const surface = reader ? dialog : dialog.querySelector(".preview-sheet");
		if (!surface) return;
		if (!reader) {
			this.bindPreviewResistance(surface);
			if (phone) this.bindPreviewHandle(surface);
		}
		if (!matchMedia("(max-width:650px)").matches) {
			if (this.pullWheel) dialog.removeEventListener("wheel", this.pullWheel);
			return;
		}
		const scroll = reader
			? dialog.querySelector("#reader-scroll")
			: surface.querySelector(".sheet-scroll") || surface;
		const bar = reader ? null : dialog.querySelector(":scope > .float-bar"),
			token = app.modalToken,
			wheel = this.intent();
		let threshold = this.value("dismiss-distance", 110);
		const measure = () => {
			threshold = this.value("dismiss-distance", 110);
		};
		measure();
		const need = () => threshold;
		let pull = 0,
			timer = 0,
			frame = 0,
			done = false;
		const atTop = () => scroll.scrollTop <= 0;
		const paint = () => {
			cancelAnimationFrame(frame);
			frame = 0;
			if (done || app.modalToken !== token) return;
			surface.classList.toggle("is-drag", pull > 0);
			MotionEngine.move(
				surface,
				pull ? `0 ${Math.round(pull * (phone ? 0.6 : 1))}px` : "",
				pull > 0,
			);
			this.dim(pull ? 1 - Math.min(1, pull / need()) * 0.7 : null);
			if (bar) bar.style.opacity = pull ? String(Math.max(0, 1 - (pull / need()) * 1.6)) : "";
		};
		const schedulePaint = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const close = () => {
			if (done || app.modalToken !== token) return;
			paint();
			done = true;
			clearTimeout(timer);
			this.swallowMomentum();
			cancelAnimationFrame(frame);
			this.exitSurface(surface, () => {
				if (reader) app.closeToDesk(false);
				else app.closeModal();
			});
		};
		// Phone: reading on makes the sheet full screen. The bars follow the shared tuck rule (ChromeAutoHide).
		if (phone || matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone)
			scroll.addEventListener(
				"scroll",
				() => {
					if (scroll.scrollTop > 4 && !surface.classList.contains("is-drag")) {
						surface.classList.add("is-full");
						surface.querySelector(".sheet-handle")?.setAttribute("aria-expanded", "true");
					}
				},
				{ passive: true },
			);
		scroll.addEventListener(
			"scroll",
			() => {
				if (!atTop() && pull) {
					pull = 0;
					paint();
				}
			},
			{ passive: true },
		);
		// Listen on the whole dialog: as the sheet slides down it leaves the pointer behind, and the pull must keep going.
		if (this.pullWheel) dialog.removeEventListener("wheel", this.pullWheel);
		this.pullWheel = (e?: any) => {
			if (done || app.modalToken !== token || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
			if (this.fromField(e)) {
				clearTimeout(timer);
				wheel.reset();
				pull = 0;
				paint();
				return;
			}
			const d = -e.deltaY * (e.deltaMode === 1 ? 16 : 1);
			if (d <= 0 || !atTop()) {
				wheel.reset();
				if (pull && d < 0) {
					pull = 0;
					paint();
				}
				return;
			}
			if (!wheel.feed(d)) return;
			if (!pull) measure();
			pull = Math.min(
				need() * 1.2,
				pull + Math.min(40, d) * (phone ? 1 : 1 - pull / (need() * 2.5)),
			);
			schedulePaint();
			clearTimeout(timer);
			// Commit after the trackpad input stream stops.
			timer = window.setTimeout(() => {
				if (app.modalToken !== token) return;
				if (pull >= need()) {
					close();
					return;
				}
				pull = 0;
				paint();
				wheel.reset(false);
			}, 120);
		};
		dialog.addEventListener("wheel", this.pullWheel, { passive: true });
		if (!reader) return;
		// Full screen reading by finger: pull down from the top, past a fifth or with a flick, and it slides away.
		let touch = null;
		const cancel = () => {
			touch = null;
			if (done || app.modalToken !== token) return;
			clearTimeout(timer);
			wheel.reset();
			pull = 0;
			this.settle(surface);
			this.dim(null);
		};
		scroll.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (
					e.touches.length === 1 &&
					!this.fromField(e) &&
					atTop() &&
					!done &&
					app.modalToken === token
				)
					touch = {
						...this.point(e),
						velocity: this.velocity(this.point(e).y),
						base: this.capture(surface),
						live: false,
					};
			},
			{ passive: true },
		);
		scroll.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!touch) return;
				if (e.touches.length !== 1 || app.modalToken !== token) return cancel();
				const p = this.point(e),
					dy = touch.base + p.y - touch.y,
					dx = Math.abs(p.x - touch.x);
				if (!touch.live) {
					if (dy < 6 && dx < 6) return;
					if (dy <= 0 || dx > dy) {
						cancel();
						return;
					}
					touch.live = true;
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				touch.velocity.feed(p.y);
				pull = Math.max(0, dy);
				paint();
			},
			{ passive: false },
		);
		scroll.addEventListener("touchend", () => {
			if (app.modalToken !== token) return cancel();
			if (!touch?.live) return cancel();
			const v = touch.velocity.read();
			touch = null;
			dialog.classList.remove("is-drag");
			if (pull >= need() || this.flick(pull, v)) close();
			else {
				pull = 0;
				this.settle(surface, v);
				this.dim(null);
			}
		});
		scroll.addEventListener("touchcancel", cancel, { passive: true });
	},
};
