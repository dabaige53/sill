import { wheelInput, wheelPixels } from "./gesture-input.ts";
import { bindRefresh } from "./gesture-refresh.ts";
import type { Gestures } from "./gestures.ts";
import { MotionEngine } from "./motion.ts";

export const gesturePullMethods = {
	// @design pull-refresh
	bindPull: bindRefresh,
	bindPullDown(this: Gestures) {
		const app = this.app,
			dialog = app.dialog,
			reader = dialog.classList.contains("reader"),
			phone = MotionEngine.phoneSheet(dialog);
		const surface = reader ? dialog : dialog.querySelector(".preview-sheet");
		if (!surface || dialog.hasAttribute("data-phone-drawer")) return;
		if (!reader) {
			this.bindPreviewResistance(surface);
			if (phone) {
				this.bindPreviewHandle(surface);
				this.bindPreviewExpansion(surface);
			}
		}
		if (!matchMedia("(max-width:650px)").matches) {
			if (this.pullWheel) dialog.removeEventListener("wheel", this.pullWheel);
			return;
		}
		const scroll = reader
			? dialog.querySelector("#reader-scroll")
			: surface.querySelector(".sheet-scroll") || surface;
		const bar = reader
				? null
				: dialog.querySelector(":scope > .phone-drawer > .float-bar, :scope > .float-bar"),
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
			const d = -wheelPixels(e, innerHeight);
			if (d <= 0 || !atTop()) {
				wheel.feed(d, false);
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
			const settle = () => {
				if (app.modalToken !== token) return;
				if (pull >= need()) {
					close();
					return;
				}
				pull = 0;
				paint();
				wheel.reset(false);
			};
			if (pull >= need()) settle();
			else timer = window.setTimeout(settle, wheelInput.releaseIdleMs);
		};
		dialog.addEventListener("wheel", this.pullWheel, { passive: true });
		if (!reader) return;
		// Full screen reading by finger: pull down from the top, past a fifth or with a flick, and it slides away.
		let touch = null;
		const cancel = () => {
			const live = touch?.live || pull > 0;
			touch = null;
			if (done || app.modalToken !== token) return;
			cancelAnimationFrame(frame);
			frame = 0;
			clearTimeout(timer);
			wheel.reset();
			pull = 0;
			if (live) {
				this.settle(surface);
				this.dim(1, MotionEngine.time("dur-sheet"));
			}
		};
		scroll.addEventListener(
			"touchstart",
			(e?: any) => {
				cancel();
				if (
					e.touches.length === 1 &&
					!this.fromHorizontalContent(e) &&
					atTop() &&
					!done &&
					app.modalToken === token
				)
					touch = {
						...this.point(e),
						velocity: this.velocity(this.point(e).y),
						base: 0,
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
					dy = p.y - touch.y,
					dx = Math.abs(p.x - touch.x);
				if (!touch.live) {
					if (dy < 6 && dx < 6) return;
					if (dy <= 0 || dx > dy) {
						cancel();
						return;
					}
					touch.live = true;
					touch.base = this.capture(surface);
					dialog.classList.add("is-drag");
				}
				if (e.cancelable) e.preventDefault();
				touch.velocity.feed(p.y);
				pull = Math.max(0, touch.base + dy);
				schedulePaint();
			},
			{ passive: false },
		);
		scroll.addEventListener("touchend", () => {
			if (app.modalToken !== token) return cancel();
			if (!touch?.live) return cancel();
			cancelAnimationFrame(frame);
			frame = 0;
			const v = touch.velocity.read();
			touch = null;
			dialog.classList.remove("is-drag");
			if (pull >= need() || this.flick(pull, v)) close();
			else {
				pull = 0;
				this.settle(surface, v);
				this.dim(1, MotionEngine.time("dur-sheet"));
			}
		});
		scroll.addEventListener("touchcancel", cancel, { passive: true });
	},
};
