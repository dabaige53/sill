import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { recentVelocity, shieldWheelTail, wheelIntent } from "./gesture-input.ts";
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
		return recentVelocity(position, this.value("velocity-window", 100));
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
	settle(surface: HTMLElement, velocity = 0, axis: "x" | "y" = "y") {
		surface.classList.remove("is-drag");
		MotionEngine.move(surface, "", false, {
			spring: tokens.motion.edgeSpring,
			velocity: { [axis]: velocity * 1000 },
		});
	}
	dim(v?: any, duration = 0) {
		MotionEngine.dim(this.app.dialog, v ?? null, duration);
	}
	// Shared edge intent observes native scrolling and recognizes a fresh sequence or renewed effort.
	intent() {
		return wheelIntent();
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
		const base = transform === "none" ? "" : transform;
		const translate = (value: number) =>
			`${axis === "x" ? "translateX" : "translateY"}(${value}px) ${base}`;
		const animation = MotionEngine.animate(
			surface,
			[
				{ transform: translate(offset), ...(desktopPreview ? { opacity } : {}) },
				{ transform: translate(destination), ...(desktopPreview ? { opacity: 0 } : {}) },
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
			dialog.inert = false;
			this.app.skipReturnMotion = true;
			close();
		};
		// A replacement panel cancels this exit through the same managed animation owner.
		MotionEngine.panelAnimations.set(dialog, [
			...(MotionEngine.panelAnimations.get(dialog) || []),
			animation,
		]);
		if (animation)
			animation.finished.then(finish, () => {
				if (this.app.modalToken !== token || !dialog.open) return;
				this.app.sheetLeaving = false;
				dialog.inert = false;
				surface.classList.remove("is-drag");
				this.settle(surface);
				this.dim(1, duration);
				if (bar) bar.style.opacity = "";
			});
		else finish();
	}
	swallowMomentum(delta = 0) {
		shieldWheelTail(delta);
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
