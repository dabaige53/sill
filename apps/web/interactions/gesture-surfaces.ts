import type { Gestures } from "./gestures.ts";
import { MotionEngine } from "./motion.ts";

export const gestureSurfacesMethods = {
	bindSheetDrag(this: Gestures) {
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
			this.settle(sheet);
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
					velocity: this.velocity(this.point(e).y),
					base: this.capture(sheet),
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
						cancel();
						return;
					}
					drag.live = true;
					drag.sheet.classList.add("is-drag");
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				drag.velocity.feed(p.y);
				drag.dy = Math.max(0, drag.base + dy);
				if (!frame)
					frame = requestAnimationFrame(() => {
						frame = 0;
						if (!drag || drag.token !== this.app.modalToken) return;
						MotionEngine.move(drag.sheet, `0 ${drag.dy}px`, true);
						this.dim(1 - Math.min(1, drag.dy / drag.height) * 0.7);
						if (drag.bar) drag.bar.style.opacity = String(Math.max(0, 1 - drag.dy / 120));
					});
			},
			{ passive: false },
		);
		dialog.addEventListener("touchend", () => {
			if (drag && drag.token !== this.app.modalToken) return cancel();
			if (!drag?.live) return cancel();
			cancelAnimationFrame(frame);
			frame = 0;
			const { sheet, dy, bar } = drag,
				v = drag.velocity.read();
			drag = null;
			if (dy >= this.value("dismiss-distance", 110) || this.flick(dy, v)) {
				this.swallowMomentum();
				this.exitSurface(sheet, () => this.app.closeModal());
				return;
			}
			sheet.classList.remove("is-drag");
			dialog.classList.remove("is-drag");
			if (bar) bar.style.opacity = "";
			this.settle(sheet, v);
			this.dim(null);
		});
		dialog.addEventListener("touchcancel", cancel, { passive: true });
	},
	bindReaderSwipe(this: Gestures) {
		const dialog = this.app.dialog;
		let swipe = null;
		const cancel = () => {
			if (!swipe) return;
			const { token } = swipe;
			swipe = null;
			if (this.app.modalToken === token) {
				dialog.classList.remove("is-drag");
				this.settle(dialog, 0, "x");
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
					velocity: this.velocity(this.point(e).x),
					base: this.capture(dialog, "x"),
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
						cancel();
						return;
					}
					swipe.live = true;
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				swipe.velocity.feed(p.x);
				swipe.dx = Math.max(0, swipe.base + dx);
				MotionEngine.move(dialog, `${swipe.dx}px 0`, true);
				this.dim(1 - Math.min(1, swipe.dx / innerWidth));
			},
			{ passive: false },
		);
		dialog.addEventListener("touchend", () => {
			if (swipe && swipe.token !== this.app.modalToken) return cancel();
			if (!swipe?.live) return cancel();
			const { dx } = swipe,
				v = swipe.velocity.read();
			swipe = null;
			dialog.classList.remove("is-drag");
			if (dx > innerWidth * 0.3 || this.flick(dx, v)) {
				this.exitSurface(dialog, () => this.app.closeToDesk(false), "x");
			} else {
				this.settle(dialog, v, "x");
				this.dim(null);
			}
		});
		dialog.addEventListener("touchcancel", cancel, { passive: true });
	},
	bindToastSwipe(this: Gestures) {
		const toast = document.getElementById("toast");
		let start = null;
		let generation = 0;
		const cancel = () => {
			generation++;
			start = null;
			MotionEngine.cancel(toast);
			MotionEngine.move(toast, "", true);
			toast.style.opacity = "";
		};
		toast.addEventListener(
			"touchstart",
			(event: TouchEvent) => {
				const offset = parseFloat(getComputedStyle(toast).translate.split(" ")[1]) || 0;
				cancel();
				if (event.touches.length === 1 && !(event.target as Element).closest("button")) {
					MotionEngine.move(toast, `0 ${offset}px`, true);
					start = { ...this.point(event), offset, seq: this.app.toastSeq };
				}
			},
			{ passive: true },
		);
		toast.addEventListener(
			"touchmove",
			(event: TouchEvent) => {
				if (!start) return;
				if (event.touches.length !== 1 || start.seq !== this.app.toastSeq) return cancel();
				const dy = Math.max(0, this.point(event).y - start.y + start.offset);
				if (event.cancelable) event.preventDefault();
				MotionEngine.move(toast, `0 ${dy}px`, true);
				toast.style.opacity = String(1 - Math.min(1, dy / 80));
			},
			{ passive: false },
		);
		toast.addEventListener("touchend", (event: TouchEvent) => {
			if (!start) return;
			if (start.seq !== this.app.toastSeq) return cancel();
			const dy = this.point(event).y - start.y + start.offset;
			const seq = start.seq,
				token = generation;
			start = null;
			const opacity = toast.style.opacity || "1";
			toast.style.opacity = "";
			MotionEngine.animate(toast, [{ opacity }, { opacity: dy > 24 ? 0 : 1 }], {
				duration: 180,
				fill: dy > 24 ? "forwards" : undefined,
			});
			const animation = MotionEngine.move(toast, dy > 24 ? "0 60px" : "");
			if (dy > 24)
				animation.finished.then(
					() => {
						if (seq !== this.app.toastSeq || token !== generation) return;
						toast.hidden = true;
						clearTimeout(this.app.toastTimer);
					},
					() => {},
				);
		});
		toast.addEventListener("touchcancel", cancel, { passive: true });
	},
};
