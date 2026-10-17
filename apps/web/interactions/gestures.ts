import { Store } from "../data/store.ts";
import { MotionEngine } from "./motion.ts";

/** Gestures. One rule, taken from the MobileProto board: a gesture only ever sets where something should be;
 *  CSS transitions (sheet curve, 360ms) carry it there. Wheel steps glide, a change of direction picks up from wherever it is,
 *  and a finger on the glass (`is-drag`) switches the transition off so the surface sits exactly under it. */
class Gestures {
	declare app: any;
	declare phone: any;
	declare pullWheel: any;

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
	/* Pull to refresh, by finger or by trackpad at the top of the desk: the desk gives a little, a ring fills;
    full, it turns for at most a second. Let go early and both glide back. */
	bindPull() {
		const ring = document.createElement("div");
		ring.id = "pull-ring";
		ring.className = "pull-ring glass";
		ring.setAttribute("aria-hidden", "true");
		ring.innerHTML =
			'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" pathLength="100"/></svg>';
		document.body.appendChild(ring);
		const need = 64,
			circle = ring.querySelector("circle"),
			main = document.querySelector("main");
		let start = null,
			pull = 0,
			busy = false,
			timer = 0;
		const wheel = this.intent();
		// The desk moves down and the ring sits centred in the gap it opens, never on a card.
		const padTop = () => parseFloat(getComputedStyle(main).paddingTop) || 16;
		const paint = () => {
			const p = Math.min(need, pull),
				shift = Math.round(p * 0.9);
			main.style.translate = pull && !MotionEngine.reduced ? `0 ${shift}px` : "";
			ring.style.translate = MotionEngine.reduced
				? "0 0"
				: `0 ${pull ? Math.round((padTop() + shift) / 2 - 20) : -48}px`;
			ring.style.opacity = String(Math.min(1, pull / 24));
			circle.style.strokeDashoffset = String(100 - Math.min(100, (pull / need) * 100));
		};
		const cancel = () => {
			start = null;
			clearTimeout(timer);
			wheel.reset();
			document.body.classList.remove("is-pulling");
			if (!busy) {
				pull = 0;
				paint();
			}
		};
		const refresh = async () => {
			busy = true;
			pull = need;
			paint();
			ring.classList.add("is-spinning");
			document.body.classList.remove("is-pulling");
			const started = Date.now();
			await Promise.race([
				this.app.refresh(),
				new Promise((r?: any) => window.setTimeout(r, 1000)),
			]);
			await new Promise((r?: any) =>
				window.setTimeout(r, Math.max(0, 420 - (Date.now() - started))),
			);
			ring.classList.remove("is-spinning");
			pull = 0;
			paint();
			busy = false;
		};
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
					e.target.closest?.("#dock,#toast,.card-more-menu,.deck")
				)
					return;
				start = { ...this.point(e), at: Date.now() };
			},
			{ passive: true },
		);
		document.addEventListener(
			"touchmove",
			(e?: any) => {
				if (!start || this.app.drag?.active) return;
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
				if (e.cancelable) e.preventDefault();
				document.body.classList.add("is-pulling");
				pull = Math.min(110, dy * 0.5);
				paint();
			},
			{ passive: false },
		);
		document.addEventListener("touchend", () => {
			if (!start) return;
			start = null;
			document.body.classList.remove("is-pulling");
			if (pull >= need) refresh();
			else if (pull) {
				pull = 0;
				paint();
			}
		});
		document.addEventListener("touchcancel", cancel, { passive: true });
		window.addEventListener(
			"wheel",
			(e?: any) => {
				if (
					busy ||
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
				if (!wheel.feed(-e.deltaY)) return;
				pull = Math.min(need, pull + -e.deltaY * 0.4);
				paint();
				clearTimeout(timer);
				if (pull >= need) {
					wheel.reset();
					this.swallowMomentum();
					refresh();
					return;
				}
				timer = window.setTimeout(() => {
					pull = 0;
					paint();
					wheel.reset(false);
				}, 180);
			},
			{ passive: true },
		);
	}
	/* Sheets by finger: drag down from the grabber, or from content already at its top. Past 190px or a flick it leaves;
    otherwise it glides back. A full screen phone sheet pulled a little steps back to half height. */
	bindSheetDrag() {
		const dialog = this.app.dialog;
		let drag = null;
		const sheetOf = (t?: any) =>
			!dialog.classList.contains("page") &&
			(dialog.classList.contains("preview") || dialog.classList.contains("panel"))
				? t.closest?.(".sheet")
				: null;
		const cancel = () => {
			if (!drag) return;
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
				if (!e.target.closest(".grabber") && scroll && scroll.scrollTop > 0) return;
				if (this.fromField(e) || e.target.closest(".player-bar,.media-player")) return;
				drag = {
					sheet,
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
				drag.sheet.style.translate = MotionEngine.reduced ? "" : `0 ${drag.dy}px`;
				this.dim(1 - Math.min(1, drag.dy / (drag.sheet.offsetHeight || 1)) * 0.7);
				if (drag.bar) drag.bar.style.opacity = String(Math.max(0, 1 - drag.dy / 120));
			},
			{ passive: false },
		);
		dialog.addEventListener("touchend", () => {
			if (drag && drag.token !== this.app.modalToken) return cancel();
			if (!drag?.live) {
				drag = null;
				return;
			}
			const { sheet, dy, bar } = drag,
				v = dy / Math.max(1, Date.now() - drag.at);
			drag = null;
			sheet.classList.remove("is-drag");
			dialog.classList.remove("is-drag");
			if (bar) bar.style.opacity = "";
			if (dy > 190 || (v > 0.5 && dy > 40)) {
				if (MotionEngine.phoneSheet(dialog)) this.app.closeModal();
				else {
					sheet.style.translate = MotionEngine.reduced ? "" : `0 ${sheet.offsetHeight + 80}px`;
					bar?.classList.add("is-hidden");
					this.dismiss(() => this.app.closeModal());
				}
				return;
			}
			sheet.style.translate = "";
			this.dim(null);
			if (dy > 60 && sheet.classList.contains("is-full")) sheet.classList.remove("is-full");
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
		const scroll = reader
			? dialog.querySelector("#reader-scroll")
			: surface.querySelector(".sheet-scroll") || surface;
		const bar = reader ? null : dialog.querySelector(":scope > .float-bar"),
			token = app.modalToken,
			wheel = this.intent();
		const need = () => (phone ? 110 : Math.min(150, Math.max(110, surface.offsetHeight * 0.2)));
		let pull = 0,
			timer = 0,
			done = false,
			hold = 0,
			last = 0;
		const atTop = () => scroll.scrollTop <= 0;
		const paint = () => {
			if (app.modalToken !== token) return;
			surface.style.translate =
				pull && !MotionEngine.reduced ? `0 ${Math.round(pull * (phone ? 0.6 : 1))}px` : "";
			this.dim(pull ? 1 - Math.min(1, pull / need()) * 0.7 : null);
			if (bar) bar.style.opacity = pull ? String(Math.max(0, 1 - (pull / need()) * 1.6)) : "";
		};
		const close = () => {
			if (done || app.modalToken !== token) return;
			done = true;
			clearTimeout(timer);
			this.swallowMomentum();
			if (phone) {
				app.closeModal();
				return;
			}
			surface.style.translate = MotionEngine.reduced
				? ""
				: reader
					? `0 ${innerHeight}px`
					: `0 ${surface.offsetHeight + 80}px`;
			if (bar) bar.style.opacity = "0";
			this.dismiss(() => {
				if (reader) app.closeToDesk(false);
				else app.closeModal();
			});
		};
		// Phone: reading on makes the sheet full screen. The bars follow the shared tuck rule (ChromeAutoHide).
		if (phone)
			scroll.addEventListener(
				"scroll",
				() => {
					if (scroll.scrollTop > 4) surface.classList.add("is-full");
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
			const now = Date.now(),
				d = -e.deltaY * (e.deltaMode === 1 ? 16 : 1),
				gap = now - last;
			last = now;
			if (d <= 0 || !atTop()) {
				wheel.reset();
				if (pull && d < 0) {
					pull = 0;
					paint();
				}
				return;
			}
			// The coasting tail of the gesture that just changed state is not a new pull.
			if (hold) {
				if (gap < 160) return;
				hold = 0;
			}
			if (phone && surface.classList.contains("is-full")) {
				surface.classList.remove("is-full");
				hold = 1;
				pull = 0;
				paint();
				return;
			}
			if (!wheel.feed(d)) return;
			pull = Math.min(
				need() * 1.2,
				pull + Math.min(40, d) * (phone ? 1 : 1 - pull / (need() * 2.5)),
			);
			paint();
			clearTimeout(timer);
			if (pull >= need()) {
				close();
				return;
			}
			timer = window.setTimeout(
				() => {
					if (app.modalToken !== token) return;
					pull = 0;
					paint();
					wheel.reset(false);
				},
				phone ? 180 : 260,
			);
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
				if (app.modalToken === token) app.closeToDesk(true);
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
