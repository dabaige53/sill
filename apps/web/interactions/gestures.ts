import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { gesturePreviewMethods } from "./gesture-preview.ts";
import { gesturePullMethods } from "./gesture-pull.ts";
import { gestureSurfacesMethods } from "./gesture-surfaces.ts";
import { MotionEngine } from "./motion.ts";

/** Shared gesture release, interruption and surface exit rules. */
class Gestures {
	declare bindPreviewHandle: GesturesMethods["bindPreviewHandle"];
	declare setPreviewFull: GesturesMethods["setPreviewFull"];
	declare bindPreviewExpansion: GesturesMethods["bindPreviewExpansion"];
	declare bindPreviewResistance: GesturesMethods["bindPreviewResistance"];
	declare bindPush: GesturesMethods["bindPush"];
	declare bindPull: GesturesMethods["bindPull"];
	declare bindPullDown: GesturesMethods["bindPullDown"];
	declare bindSheetDrag: GesturesMethods["bindSheetDrag"];
	declare bindReaderSwipe: GesturesMethods["bindReaderSwipe"];
	declare bindToastSwipe: GesturesMethods["bindToastSwipe"];

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
	/** Native controls and horizontal scrollers own their entire touch sequence. */
	fromHorizontalContent(event: TouchEvent) {
		const target = event.target as Element;
		if (
			target.closest(
				'button,a,input,textarea,select,audio,video,iframe,[role="slider"],[contenteditable="true"]',
			)
		)
			return true;
		for (let node = target; node && node !== this.app.dialog; node = node.parentElement) {
			if (node.scrollWidth <= node.clientWidth + 1) continue;
			if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowX)) return true;
		}
		return false;
	}
	value(name: string, fallback: number) {
		return MotionEngine.time(`gesture-${name}`) || fallback;
	}
	velocity(position: number) {
		const windowMs = this.value("velocity-window", 100);
		let samples = [{ position, time: performance.now() }];
		return {
			feed(position: number) {
				const time = performance.now();
				// A stationary hold must not dilute the final flick. Retain a boundary sample.
				const cutoff = time - windowMs;
				while (samples.length > 1 && samples[1].time <= cutoff) samples.shift();
				if (samples[0].time < cutoff) samples[0] = { ...samples[0], time: cutoff };
				samples.push({ position, time });
			},
			read() {
				const last = samples[samples.length - 1];
				if (performance.now() - last.time > windowMs) return 0;
				return (last.position - samples[0].position) / Math.max(1, last.time - samples[0].time);
			},
		};
	}
	flick(distance: number, velocity: number) {
		return distance > this.value("flick-distance", 40) && velocity > this.value("flick-speed", 0.5);
	}
	capture(surface: HTMLElement, axis: "x" | "y" = "y") {
		const style = getComputedStyle(surface);
		const translate = style.translate;
		const parts = translate === "none" ? [] : translate.split(" ");
		let offset = parseFloat(parts[axis === "x" ? 0 : 1] || "0") || 0;
		if (surface === this.app.dialog || surface.closest("dialog") === this.app.dialog) {
			if (
				style.transform &&
				style.transform !== "none" &&
				typeof DOMMatrixReadOnly !== "undefined"
			) {
				const transform = new DOMMatrixReadOnly(style.transform);
				offset += axis === "x" ? transform.m41 : transform.m42;
			}
			this.app.sheetLeaving = false;
			surface.inert = false;
			MotionEngine.cancelPanel(this.app.dialog);
			surface.classList.add("is-drag");
			surface.classList.remove("is-off");
			if (surface !== this.app.dialog) surface.style.transform = "";
			this.dim(null);
			const bar = this.app.dialog.querySelector(":scope > .float-bar");
			if (bar) {
				bar.classList.remove("is-hidden");
				bar.style.opacity = "";
			}
		}
		MotionEngine.cancel(surface);
		surface.classList.add("is-drag");
		MotionEngine.move(surface, axis === "x" ? `${offset}px 0` : `0 ${offset}px`, true);
		return offset;
	}
	settle(surface: HTMLElement, _velocity = 0, _axis: "x" | "y" = "y") {
		surface.classList.remove("is-drag");
		MotionEngine.move(surface);
	}
	dim(v?: any) {
		MotionEngine.dim(this.app.dialog, v ?? null);
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
	/** Keep the drawn offset until the exit finishes; no reset between hand and dismissal. */
	exitSurface(surface: HTMLElement, close: () => void, axis: "x" | "y" = "y") {
		if (this.app.sheetLeaving) return;
		const dialog = this.app.dialog,
			token = this.app.modalToken;
		const style = getComputedStyle(surface);
		const drawn = style.translate,
			transform = style.transform,
			opacity = style.opacity;
		const offset = parseFloat(drawn.split(" ")[axis === "x" ? 0 : 1] || "0") || 0;
		const rect = surface.getBoundingClientRect();
		const desktopPreview =
			axis === "y" && dialog.classList.contains("preview") && !this.phone.matches;
		const duration = MotionEngine.time(desktopPreview ? "dur-close" : "dur-sheet");
		const destination = desktopPreview
			? offset + tokens.motion.detailTravel
			: offset + (axis === "x" ? innerWidth - rect.left : innerHeight - rect.top) + 1;
		MotionEngine.cancel(surface);
		// Freeze the drawn transform before cancelling entry and travel.
		MotionEngine.cancelPanel(dialog);
		this.app.sheetLeaving = true;
		dialog.inert = true;
		MotionEngine.move(surface, "", true);
		surface.classList.add("is-drag");
		dialog.classList.remove("is-drag");
		const bar = dialog.querySelector(":scope > .float-bar");
		if (bar) bar.style.opacity = "0";
		MotionEngine.dim(dialog, 0, duration);
		surface.inert = true;
		const base = transform === "none" ? "" : transform;
		const translate = (value: number) =>
			`${axis === "x" ? "translateX" : "translateY"}(${value}px) ${base}`;
		const animation = MotionEngine.animate(
			surface,
			[
				{ transform: translate(offset), opacity },
				{ transform: translate(destination), opacity: desktopPreview ? 0 : opacity },
			],
			{
				duration,
				easing: MotionEngine.curve(desktopPreview ? "ease" : "ease-sheet"),
				fill: "forwards",
			},
		);
		const finish = () => {
			if (this.app.modalToken !== token || !dialog.open) return;
			this.app.sheetLeaving = false;
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
}

export { Gestures };

type GesturesMethods = typeof gesturePullMethods &
	typeof gestureSurfacesMethods &
	typeof gesturePreviewMethods;
for (const methods of [gesturePullMethods, gestureSurfacesMethods, gesturePreviewMethods]) {
	for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
		Object.defineProperty(Gestures.prototype, name, { ...descriptor, enumerable: false });
	}
}
