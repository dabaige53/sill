import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "./motion.ts";

/** Gestures. One rule, taken from the MobileProto board: a gesture only ever sets where something should be;
 *  CSS transitions (sheet curve, 360ms) carry it there. Wheel steps glide, a change of direction picks up from wherever it is,
 *  and a finger on the glass (`is-drag`) switches the transition off so the surface sits exactly under it. */
class Gestures {
	declare app: any;
	declare phone: any;
	declare pullWheel: any;
	declare refresh: () => Promise<void>;

	constructor(app?: any) {
		this.app = app;
		this.phone = matchMedia("(max-width:650px)");
		this.bindSheetDrag();
		this.bindPull();
		this.bindReaderSwipe();
		this.bindToastSwipe();
	}
	point(e?: any) {
		const t = e.touches?.[0] || e.changedTouches?.[0];
		return { x: t.clientX, y: t.clientY };
	}
	fromField(e?: any) {
		return !!e.target.closest?.('input,textarea,[contenteditable="true"]');
	}
	spring(el?: any, keyframes?: any, duration: any = 260) {
		return MotionEngine.animate(el, keyframes, { duration, easing: "cubic-bezier(.32,.72,0,1)" });
	}
	dim(v?: any) {
		const d = this.app.dialog;
		if (v == null) d.style.removeProperty("--backdrop");
		else d.style.setProperty("--backdrop", String(v));
	}
	// Momentum guard: a wheel stream that is still coasting into an edge is not a new gesture.
	// It counts after a pause, or once the deltas hold steady or grow again (momentum only ever weakens).
	intent() {
		let armed = false,
			last = 0,
			prev = 0,
			steady = 0;
		return {
			feed(d?: any) {
				const now = Date.now(),
					gap = now - last;
				last = now;
				if (!armed) {
					steady = d >= prev && d >= 3 ? steady + 1 : 0;
					if (gap > 140 || steady >= 4) armed = true;
				}
				prev = d;
				return armed;
			},
			// Every wheel event counts as activity, even the ones that do not qualify, so a coasting tail never looks like a pause.
			reset(seen: any = true) {
				armed = false;
				steady = 0;
				if (seen) last = Date.now();
			},
			get armed() {
				return armed;
			},
		};
	}
	/** Trackpads have no "let go" event: the hand has let go once the deltas start to fall away as momentum. */
	release() {
		let prev = 0,
			falling = 0;
		return {
			feed(d: number) {
				falling = prev && d < prev * 0.85 ? falling + 1 : 0;
				prev = d;
				return falling >= 3;
			},
			reset() {
				prev = 0;
				falling = 0;
			},
		};
	}
	// A surface sent off screen stays there; the dialog closes once it is out of sight, with no return motion.
	dismiss(close?: any, delay: any = 300) {
		const token = this.app.modalToken;
		this.dim(0);
		window.setTimeout(
			() => {
				if (this.app.modalToken !== token || !this.app.dialog.open) return;
				this.app.skipReturnMotion = true;
				close();
			},
			MotionEngine.reduced ? 0 : delay,
		);
	}
	/** Keep the drawn offset until the exit finishes; no reset between hand and dismissal. */
	exitSurface(surface: HTMLElement, close: () => void) {
		const dialog = this.app.dialog,
			token = this.app.modalToken;
		const style = getComputedStyle(surface);
		const drawn = style.translate,
			transform = style.transform,
			opacity = style.opacity;
		const y = parseFloat(drawn.split(" ")[1] || "0") || 0;
		const destination = y + innerHeight - surface.getBoundingClientRect().top + 1;
		// Freeze an unfinished entry before cancelling it, so a fast release cannot snap upward.
		if (surface !== dialog) surface.style.transform = transform;
		MotionEngine.cancelPanel(dialog);
		surface.classList.add("is-drag");
		dialog.classList.remove("is-drag");
		const bar = dialog.querySelector(":scope > .float-bar");
		if (bar) bar.style.opacity = "0";
		this.dim(0);
		const animation = MotionEngine.animate(
			surface,
			[
				{ translate: drawn === "none" ? "0 0" : drawn, opacity },
				{ translate: `0 ${destination}px`, opacity: MotionEngine.reduced ? 0 : 1 },
			],
			{ duration: MotionEngine.time("base"), easing: MotionEngine.curve(), fill: "forwards" },
		);
		const finish = () => {
			if (this.app.modalToken !== token || !dialog.open) return;
			this.app.skipReturnMotion = true;
			close();
		};
		// A replacement panel cancels this exit through the same managed animation owner.
		MotionEngine.panelAnimations.set(dialog, [
			...(MotionEngine.panelAnimations.get(dialog) || []),
			animation,
		]);
		if (animation) animation.finished.then(finish, () => {});
		else finish();
	}
	// After a pull or push closes something, the trackpad keeps coasting. Those leftover wheel events must not scroll the desk:
	// they are held until the hand has really stopped (no wheel for 200ms, at most 2.5s).
	swallowMomentum() {
		let last = Date.now();
		const started = last;
		const hold = (e?: any) => {
			const now = Date.now();
			if (now - last > 200 || now - started > 2500) {
				window.removeEventListener("wheel", hold, { capture: true });
				return;
			}
			last = now;
			e.preventDefault();
		};
		window.addEventListener("wheel", hold, { capture: true, passive: false });
	}
	/* The finger owns position; the request owns the spinner. No visual text. */
	bindPull() {
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
			markTop: number | null = null,
			state = "idle";
		const mark = document.querySelector<HTMLElement>(".home-mark");
		const wheel = this.intent(),
			wheelRelease = this.release();
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
			ring.disabled = next !== "error";
			ring.setAttribute("aria-hidden", String(next === "idle" || next === "pulling"));
			ring.setAttribute("aria-label", labels[next]);
			ring.setAttribute("aria-busy", String(next === "loading"));
			if (next === "loading" || next === "success" || next === "error")
				this.app.announce?.(labels[next]);
		};
		const measure = () => {
			inset = parseFloat(getComputedStyle(main).paddingTop) || 16;
			const rect = mark?.getBoundingClientRect();
			markTop = rect?.height ? rect.top + (rect.height - ring.offsetHeight) / 2 : null;
			ring.classList.toggle("in-home-mark", markTop !== null);
			ring.style.top = markTop === null ? "" : `${markTop}px`;
		};
		const paint = () => {
			cancelAnimationFrame(frame);
			frame = 0;
			const shift = Math.round(pull * 0.75),
				feedback = state === "loading" || state === "success" || state === "error";
			main.style.translate = pull && !MotionEngine.reduced ? `0 ${shift}px` : "";
			// While loading the desk stays open and the ring turns in the gap it made.
			mark?.classList.toggle("is-refreshing-mark", markTop !== null && state !== "idle");
			ring.style.translate =
				markTop !== null
					? "0 0"
					: MotionEngine.reduced
						? "0 12px"
						: pull
							? `0 ${Math.round((inset + shift) / 2 - 18)}px`
							: feedback
								? "0 12px"
								: "0 -48px";
			ring.style.opacity = String(feedback ? 1 : Math.min(1, pull / 18));
			circle.style.strokeDashoffset = String(100 - Math.min(100, (pull / need) * 100));
			ring.toggleAttribute("data-ready", pull >= need);
		};
		const schedulePaint = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const cancel = () => {
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
				status("success");
				timer = window.setTimeout(
					() => {
						pull = 0;
						status("idle");
						paint();
					},
					MotionEngine.reduced ? 250 : 480,
				);
			} catch {
				clearTimeout(holdTimer);
				pull = 0;
				status("error");
			} finally {
				busy = false;
				paint();
			}
		};
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
				start = { ...this.point(e), at: Date.now() };
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
			if (!start) return;
			start = null;
			document.body.classList.remove("is-pulling");
			if (pull >= need) refresh();
			else {
				pull = 0;
				status("idle");
				paint();
			}
		});
		document.addEventListener("touchcancel", cancel, { passive: true });
		window.addEventListener(
			"wheel",
			(e?: any) => {
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
					wheel.reset();
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
				// A full ring waits for the hand to let go: the wheel stops or starts coasting.
				if (pull >= need && wheelRelease.feed(-e.deltaY)) {
					wheelRelease.reset();
					wheel.reset();
					this.swallowMomentum();
					refresh();
					return;
				}
				timer = window.setTimeout(() => {
					wheelRelease.reset();
					if (pull >= need) {
						wheel.reset(false);
						refresh();
						return;
					}
					pull = 0;
					status("idle");
					paint();
					wheel.reset(false);
				}, 180);
			},
			{ passive: false },
		);
	}
	/* Sheets by finger: drag down from the grabber, or from content already at its top. Past 190px or a flick it leaves;
    otherwise it glides back. A full screen phone sheet pulled a little steps back to half height. */
	bindSheetDrag() {
		let frame = 0;
		const dialog = this.app.dialog;
		let drag = null;
		const sheetOf = (t?: any) =>
			!dialog.classList.contains("page") &&
			(dialog.classList.contains("preview") || dialog.classList.contains("panel"))
				? t.closest?.(".sheet")
				: null;
		const cancel = () => {
			if (!drag) return;
			cancelAnimationFrame(frame);
			frame = 0;
			const { sheet, bar, token } = drag;
			drag = null;
			sheet.classList.remove("is-drag");
			sheet.style.translate = "";
			if (bar) bar.style.opacity = "";
			if (this.app.modalToken === token) {
				dialog.classList.remove("is-drag");
				this.dim(null);
			}
		};
		dialog.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (e.touches.length > 1) return;
				const sheet = sheetOf(e.target);
				if (!sheet) return;
				const scroll = sheet.querySelector(".sheet-scroll");
				// The handle resizes the sheet itself; text already at its top pulls the whole sheet down.
				if (e.target.closest(".sheet-handle")) return;
				if (!e.target.closest(".grabber") && scroll && scroll.scrollTop > 0) return;
				if (this.fromField(e) || e.target.closest(".player-bar,.media-player")) return;
				drag = {
					sheet,
					height: sheet.offsetHeight || 1,
					token: this.app.modalToken,
					...this.point(e),
					at: Date.now(),
					dy: 0,
					live: false,
					bar: dialog.querySelector(":scope > .float-bar"),
				};
			},
			{ passive: true },
		);
		dialog.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!drag) return;
				if (e.touches.length !== 1 || drag.token !== this.app.modalToken) return cancel();
				const p = this.point(e),
					dy = p.y - drag.y,
					dx = Math.abs(p.x - drag.x);
				if (!drag.live) {
					if (dy < 6 && dx < 6) return;
					if (dy <= 0 || dx > dy) {
						drag = null;
						return;
					}
					drag.live = true;
					drag.sheet.classList.add("is-drag");
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				drag.dy = Math.max(0, dy);
				if (!frame)
					frame = requestAnimationFrame(() => {
						frame = 0;
						if (!drag || drag.token !== this.app.modalToken) return;
						drag.sheet.style.translate = MotionEngine.reduced ? "" : `0 ${drag.dy}px`;
						this.dim(1 - Math.min(1, drag.dy / drag.height) * 0.7);
						if (drag.bar) drag.bar.style.opacity = String(Math.max(0, 1 - drag.dy / 120));
					});
			},
			{ passive: false },
		);
		dialog.addEventListener("touchend", () => {
			if (drag && drag.token !== this.app.modalToken) return cancel();
			if (!drag?.live) {
				drag = null;
				return;
			}
			cancelAnimationFrame(frame);
			frame = 0;
			const { sheet, dy, bar } = drag,
				v = dy / Math.max(1, Date.now() - drag.at);
			drag = null;
			if (dy > 190 || (v > 0.5 && dy > 40)) {
				this.swallowMomentum();
				this.exitSurface(sheet, () => this.app.closeModal());
				return;
			}
			sheet.classList.remove("is-drag");
			dialog.classList.remove("is-drag");
			if (bar) bar.style.opacity = "";
			sheet.style.translate = "";
			this.dim(null);
		});
		dialog.addEventListener("touchcancel", cancel, { passive: true });
	}
	/* Full screen reading: swipe right to go straight back to the desk. */
	bindReaderSwipe() {
		const dialog = this.app.dialog;
		let swipe = null;
		const cancel = () => {
			if (!swipe) return;
			const { token } = swipe;
			swipe = null;
			if (this.app.modalToken === token) {
				dialog.classList.remove("is-drag");
				dialog.style.translate = "";
				this.dim(null);
			}
		};
		dialog.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (
					!dialog.classList.contains("reader") ||
					e.touches.length > 1 ||
					this.fromField(e) ||
					e.target.closest(".float-bar")
				)
					return;
				swipe = {
					...this.point(e),
					token: this.app.modalToken,
					at: Date.now(),
					dx: 0,
					live: false,
				};
			},
			{ passive: true },
		);
		dialog.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!swipe) return;
				if (e.touches.length !== 1 || swipe.token !== this.app.modalToken) return cancel();
				const p = this.point(e),
					dx = p.x - swipe.x,
					dy = Math.abs(p.y - swipe.y);
				if (!swipe.live) {
					if (dx < 8 && dy < 8) return;
					if (dx <= 0 || dy * 1.2 > dx) {
						swipe = null;
						return;
					}
					swipe.live = true;
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				swipe.dx = Math.max(0, dx);
				dialog.style.translate = MotionEngine.reduced ? "" : `${swipe.dx}px 0`;
				this.dim(1 - Math.min(1, swipe.dx / innerWidth));
			},
			{ passive: false },
		);
		dialog.addEventListener("touchend", () => {
			if (swipe && swipe.token !== this.app.modalToken) return cancel();
			if (!swipe?.live) {
				swipe = null;
				return;
			}
			const { dx } = swipe,
				v = dx / Math.max(1, Date.now() - swipe.at);
			swipe = null;
			dialog.classList.remove("is-drag");
			if (dx > innerWidth * 0.3 || (v > 0.5 && dx > 40)) {
				dialog.style.translate = MotionEngine.reduced ? "" : `${innerWidth}px 0`;
				this.dismiss(() => this.app.closeToDesk(false));
			} else {
				dialog.style.translate = "";
				this.dim(null);
			}
		});
		dialog.addEventListener("touchcancel", cancel, { passive: true });
	}
	/* The toast can be flicked away downward. */
	bindToastSwipe() {
		const toast = document.getElementById("toast");
		let start = null;
		const cancel = () => {
			start = null;
			toast.style.translate = "";
			toast.style.opacity = "";
		};
		toast.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (e.touches.length === 1 && !e.target.closest("button"))
					start = { ...this.point(e), seq: this.app.toastSeq };
			},
			{ passive: true },
		);
		toast.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!start) return;
				if (e.touches.length !== 1 || start.seq !== this.app.toastSeq) return cancel();
				const dy = this.point(e).y - start.y;
				if (dy > 0) {
					if (e.cancelable) e.preventDefault();
					toast.style.translate = MotionEngine.reduced ? "" : `0 ${dy}px`;
					toast.style.opacity = String(1 - Math.min(1, dy / 80));
				}
			},
			{ passive: false },
		);
		toast.addEventListener("touchend", (e?: any) => {
			if (!start) return;
			if (start.seq !== this.app.toastSeq) return cancel();
			const dy = this.point(e).y - start.y;
			const seq = start.seq;
			start = null;
			const from: Record<string, any> = {
				translate: toast.style.translate || "0 0",
				opacity: toast.style.opacity || "1",
			};
			toast.style.translate = "";
			toast.style.opacity = "";
			if (dy > 24) {
				const a = this.spring(toast, [from, { translate: "0 60px", opacity: 0 }], 180);
				const hide = () => {
					if (seq !== this.app.toastSeq) return;
					toast.hidden = true;
					clearTimeout(this.app.toastTimer);
				};
				a ? a.finished.then(hide, hide) : hide();
			} else if (dy > 0) this.spring(toast, [from, { translate: "0 0", opacity: 1 }]);
		});
		toast.addEventListener("touchcancel", cancel, { passive: true });
	}
	/* At the top, pulling on down (wheel and trackpad; fingers use the sheet drag above).
    Phone sheet, as in MobileProto: full screen steps back to half first; from half, a further pull past 110px closes it.
    Wider screens: the sheet or page follows down and leaves past about a fifth of its height. Short of that it glides back. */
	bindPullDown() {
		const app = this.app,
			dialog = app.dialog,
			reader = dialog.classList.contains("reader"),
			phone = MotionEngine.phoneSheet(dialog);
		const surface = reader ? dialog : dialog.querySelector(".preview-sheet");
		if (!surface) return;
		if (!reader) {
			this.bindPreviewResistance(surface);
			this.bindPreviewHandle(surface);
		}
		const scroll = reader
			? dialog.querySelector("#reader-scroll")
			: surface.querySelector(".sheet-scroll") || surface;
		const bar = reader ? null : dialog.querySelector(":scope > .float-bar"),
			token = app.modalToken,
			wheel = this.intent(),
			letGo = this.release();
		let threshold = 110;
		const measure = () => {
			threshold = phone ? 110 : Math.min(150, Math.max(110, surface.offsetHeight * 0.2));
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
			surface.style.translate =
				pull && !MotionEngine.reduced ? `0 ${Math.round(pull * (phone ? 0.6 : 1))}px` : "";
			this.dim(pull ? 1 - Math.min(1, pull / need()) * 0.7 : null);
			if (bar) bar.style.opacity = pull ? String(Math.max(0, 1 - (pull / need()) * 1.6)) : "";
		};
		const schedulePaint = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const close = () => {
			if (done || app.modalToken !== token) return;
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
				letGo.reset();
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
			// Past the line it closes once the hand lets go, not while it is still pulling.
			if (pull >= need() && letGo.feed(d)) {
				close();
				return;
			}
			timer = window.setTimeout(() => {
				if (app.modalToken !== token) return;
				letGo.reset();
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
			dialog.classList.remove("is-drag");
			paint();
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
					touch = { ...this.point(e), at: Date.now(), live: false };
			},
			{ passive: true },
		);
		scroll.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!touch) return;
				if (e.touches.length !== 1 || app.modalToken !== token) return cancel();
				const p = this.point(e),
					dy = p.y - touch.y,
					dx = Math.abs(p.x - touch.x);
				if (!touch.live) {
					if (dy < 6 && dx < 6) return;
					if (dy <= 0 || dx > dy) {
						touch = null;
						return;
					}
					touch.live = true;
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				pull = Math.max(0, dy * 0.8);
				paint();
			},
			{ passive: false },
		);
		scroll.addEventListener("touchend", () => {
			if (app.modalToken !== token) return cancel();
			if (!touch?.live) {
				touch = null;
				return;
			}
			const v = pull / Math.max(1, Date.now() - touch.at);
			touch = null;
			dialog.classList.remove("is-drag");
			if (pull >= need() || (v > 0.5 && pull > 40)) close();
			else {
				pull = 0;
				paint();
			}
		});
		scroll.addEventListener("touchcancel", cancel, { passive: true });
	}
	/* Reaching the end and pushing on (ReadEndRing): a small ring rises and fills with the push, the text lifts with resistance,
    the capsule steps aside. Full, it turns into a check, pops, and the piece folds away. Let go early and everything glides back. */
	/** The handle alone resizes the sheet; text keeps native scrolling. */
	bindPreviewHandle(surface: HTMLElement) {
		const handle = surface.querySelector<HTMLButtonElement>(".sheet-handle");
		const scroll = surface.querySelector<HTMLElement>(".sheet-scroll");
		if (!handle || !scroll) return;
		const token = this.app.modalToken;
		let drag: {
			id: number;
			x: number;
			y: number;
			height: number;
			full: boolean;
			live: boolean;
		} | null = null;
		let snapTimer = 0;
		let frame = 0,
			distance = 0;
		const paint = () => {
			frame = 0;
			if (!drag || !current() || MotionEngine.reduced) return;
			// Downward dismissal keeps content geometry stable, including the sticky header.
			surface.style.translate = distance > 0 ? `0 ${distance}px` : "";
			surface.style.maxHeight = "100dvh";
			surface.style.height = `${Math.max(120, Math.min(innerHeight, drag.height - Math.min(0, distance)))}px`;
		};
		const current = () => token === this.app.modalToken && surface.isConnected;
		const collapsed = () => {
			const style = getComputedStyle(scroll);
			const content = [...scroll.children].reduce((height, child: HTMLElement) => {
				const childStyle = getComputedStyle(child);
				return (
					height +
					child.offsetHeight +
					parseFloat(childStyle.marginTop || "0") +
					parseFloat(childStyle.marginBottom || "0")
				);
			}, 0);
			return Math.min(
				content +
					parseFloat(style.paddingTop || "0") +
					parseFloat(style.paddingBottom || "0") +
					parseFloat(getComputedStyle(surface).paddingBottom || "0"),
				innerHeight - 64,
			);
		};
		const snap = (full: boolean, from?: number) => {
			if (!current()) return;
			clearTimeout(snapTimer);
			cancelAnimationFrame(frame);
			frame = 0;
			surface.classList.remove("is-drag");
			surface.style.maxHeight = "";
			surface.style.translate = "";
			if (from !== undefined) surface.style.height = `${from}px`;
			void surface.offsetHeight;
			surface.classList.toggle("is-full", full);
			handle.setAttribute("aria-expanded", String(full));
			if (from !== undefined) {
				surface.style.height = `${full ? innerHeight : collapsed()}px`;
				snapTimer = window.setTimeout(
					() => {
						if (current()) surface.style.height = "";
					},
					MotionEngine.reduced ? 0 : 360,
				);
			}
		};
		const cancel = () => {
			if (!drag) return;
			const previous = drag;
			drag = null;
			snap(
				previous.full,
				surface.offsetHeight - (MotionEngine.reduced ? 0 : Math.max(0, distance)),
			);
		};
		handle.addEventListener("pointerdown", (event: PointerEvent) => {
			if (!current() || event.button !== 0 || !event.isPrimary) return;
			clearTimeout(snapTimer);
			distance = 0;
			drag = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				height: surface.offsetHeight,
				full: surface.classList.contains("is-full"),
				live: false,
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
			if (MotionEngine.reduced) return;
			distance = dy;
			if (!frame) frame = requestAnimationFrame(paint);
		});
		handle.addEventListener("pointerup", (event: PointerEvent) => {
			if (!drag || drag.id !== event.pointerId || !current()) return;
			const previous = drag,
				dy = event.clientY - previous.y;
			cancelAnimationFrame(frame);
			frame = 0;
			drag = null;
			if (!previous.live) return;
			// Suppress the click synthesized after a drag; keyboard clicks still toggle.
			handle.dataset.dragged = "true";
			window.setTimeout(() => {
				delete handle.dataset.dragged;
			}, 0);
			if (dy > 160) {
				this.exitSurface(surface, () => this.app.closeModal());
				return;
			}
			snap(
				dy < -40 ? true : dy > 40 ? false : previous.full,
				surface.offsetHeight - (MotionEngine.reduced ? 0 : Math.max(0, distance)),
			);
		});
		handle.addEventListener("pointercancel", cancel);
		handle.addEventListener("lostpointercapture", cancel);
		handle.addEventListener("click", () => {
			if (handle.dataset.dragged || !current()) return;
			snap(!surface.classList.contains("is-full"), surface.offsetHeight);
		});
	}
	/** A bounded edge response never scrolls the desk, completes reading, or dismisses a preview. */
	bindPreviewResistance(surface: HTMLElement) {
		const scroll = surface.querySelector<HTMLElement>(".sheet-scroll");
		if (!scroll) return;
		const token = this.app.modalToken;
		let touch: { x: number; y: number } | null = null;
		let distance = 0,
			timer = 0;
		const current = () => token === this.app.modalToken && surface.isConnected;
		// Pulling down at the top moves the sheet; pushing on at the end belongs to the read-end ring when it is on.
		const edge = (delta: number) =>
			delta < 0 &&
			!surface.querySelector(".push-ring") &&
			scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
		const paint = (delta: number) => {
			if (!current()) return;
			const offset = Math.sign(delta) * 14 * (1 - Math.exp(-Math.abs(delta) / 100));
			scroll.style.translate = MotionEngine.reduced ? "" : `0 ${offset.toFixed(2)}px`;
		};
		const reset = () => {
			clearTimeout(timer);
			touch = null;
			distance = 0;
			scroll.classList.remove("is-drag");
			if (current()) scroll.style.translate = "";
		};
		scroll.addEventListener(
			"wheel",
			(event: WheelEvent) => {
				if (!current() || this.fromField(event) || Math.abs(event.deltaX) > Math.abs(event.deltaY))
					return;
				const delta = -event.deltaY * (event.deltaMode === 1 ? 16 : 1);
				if (!delta || !edge(delta)) return reset();
				if (event.cancelable) event.preventDefault();
				distance = Math.sign(distance) === Math.sign(delta) ? distance + delta : delta;
				paint(distance);
				clearTimeout(timer);
				timer = window.setTimeout(reset, 120);
			},
			{ passive: false },
		);
		scroll.addEventListener(
			"touchstart",
			(event: TouchEvent) => {
				reset();
				if (event.touches.length === 1 && !this.fromField(event)) touch = this.point(event);
			},
			{ passive: true },
		);
		scroll.addEventListener(
			"touchmove",
			(event: TouchEvent) => {
				if (!touch || !current()) return;
				if (event.touches.length !== 1) return reset();
				const point = this.point(event),
					delta = point.y - touch.y;
				if (Math.abs(point.x - touch.x) > Math.abs(delta)) return reset();
				if (!edge(delta)) {
					touch = point;
					return;
				}
				if (event.cancelable) event.preventDefault();
				scroll.classList.add("is-drag");
				paint(delta);
			},
			{ passive: false },
		);
		scroll.addEventListener("touchend", reset, { passive: true });
		scroll.addEventListener("touchcancel", reset, { passive: true });
	}
	bindPush(id?: any, scroll?: any) {
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
		chip.innerHTML =
			'<svg class="arc" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="8" stroke-dasharray="50.27" stroke-dashoffset="50.27"/></svg><svg class="tick" viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		host.appendChild(chip);
		const arc = chip.querySelector(".arc circle:last-child"),
			bar = dialog.querySelector(":scope > .float-bar");
		const need = 120,
			token = app.modalToken,
			wheel = this.intent();
		let pull = 0,
			timer = 0,
			touch = null,
			done = false;
		const atEnd = () => scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
		const paint = () => {
			if (app.modalToken !== token) return;
			chip.style.opacity = String(Math.min(1, pull / 30));
			chip.style.transform = MotionEngine.reduced
				? "none"
				: `scale(${(0.6 + 0.4 * Math.min(1, pull / 60)).toFixed(3)})`;
			arc.setAttribute("stroke-dashoffset", String(50.27 * (1 - Math.min(1, pull / need))));
			scroll.style.translate =
				pull && !MotionEngine.reduced ? `0 ${-Math.round(pull * 0.35)}px` : "";
			if (bar) {
				bar.style.opacity = pull ? "0" : "";
				bar.style.translate = pull && !MotionEngine.reduced ? "0 16px" : "";
			}
		};
		const finish = () => {
			if (done || app.modalToken !== token) return;
			done = true;
			clearTimeout(timer);
			pull = need;
			paint();
			chip.classList.add("is-done");
			chip.style.transform = "scale(1)";
			Store.patch(id, { read: true, progress: 1 });
			app.refreshCard(id);
			this.swallowMomentum();
			window.setTimeout(() => {
				if (app.modalToken !== token) return;
				// A stacked preview folds back to the card below it; reading returns to the desk.
				if (app.modalKind === "preview") app.closeModal();
				else app.closeToDesk(true);
			}, 460);
		};
		const set = (v?: any) => {
			if (done || app.modalToken !== token) return;
			pull = Math.max(0, Math.min(need, v));
			paint();
			if (pull >= need) finish();
		};
		const cancel = () => {
			touch = null;
			if (done || app.modalToken !== token) return;
			clearTimeout(timer);
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
			(e?: any) => {
				if (done || app.modalToken !== token) return;
				if (this.fromField(e)) return cancel();
				const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
				if (d <= 0 || !atEnd()) {
					wheel.reset();
					if (pull) {
						pull = 0;
						paint();
					}
					return;
				}
				if (!wheel.feed(d)) return;
				set(pull + Math.min(40, d) * 0.5);
				clearTimeout(timer);
				timer = window.setTimeout(() => {
					if (!done && app.modalToken === token) {
						pull = 0;
						paint();
						wheel.reset(false);
					}
				}, 180);
			},
			{ passive: true },
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
			if (touch) host.classList.remove("is-drag");
			cancel();
		});
		scroll.addEventListener("touchcancel", cancel, { passive: true });
	}
}

export { Gestures };
