import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { recentVelocity, wheelInput, wheelIntent, wheelPixels } from "./gesture-input.ts";
import { MotionEngine } from "./motion.ts";

const config = tokens.motion.edgeDrag;
export function resistedDistance(distance: number) {
	return (
		Math.sign(distance) *
		config.scale *
		(1 - Math.exp((-Math.abs(distance) * config.resistance) / config.scale))
	);
}

export function gestureContent(scroll: HTMLElement) {
	return scroll.querySelector<HTMLElement>(":scope > .gesture-content") || scroll;
}

/** Retain the current edge travel; the release spring follows the ui-lab reference. */
// @design content-edge-rebound
export function reboundTrack(element: HTMLElement) {
	let distance = 0,
		base = 0,
		offset = 0,
		velocity: ReturnType<typeof recentVelocity> | null = null;
	return {
		begin() {
			const drawn = getComputedStyle(element).translate.split(" ");
			offset = Number.parseFloat(drawn[1]) || 0;
			MotionEngine.cancel(element);
			MotionEngine.move(element, offset ? `0 ${offset}px` : "", true);
			base = distance =
				((-Math.sign(offset) * config.scale) / config.resistance) *
				Math.log(1 - Math.min(Math.abs(offset) / config.scale, 0.999));
			velocity = recentVelocity(offset, MotionEngine.time("gesture-velocity-window") || 100);
		},
		pull(value: number, incremental = false) {
			distance = incremental ? distance + value : base + value;
			const next = resistedDistance(distance);
			offset = next;
			velocity?.feed(next);
			MotionEngine.move(element, next ? `0 ${next}px` : "", true);
		},
		release() {
			const speed = (velocity?.read(config.minSampleSeconds * 1000) || 0) * 1000;
			return MotionEngine.move(element, "", false, {
				spring: tokens.motion.contentReboundSpring,
				velocity: { y: Math.max(-config.maxVelocity, Math.min(config.maxVelocity, speed)) },
			});
		},
	};
}

export function bindEdgeRebound(
	scroll: HTMLElement,
	current: () => boolean,
	fromField: (event: WheelEvent | TouchEvent) => boolean,
	readEnd: () => boolean,
) {
	const track = reboundTrack(gestureContent(scroll)),
		wheel = wheelIntent();
	let active = false,
		timer = 0,
		previous = 0;
	let touch: { x: number; y: number } | null = null;
	const release = () => {
		clearTimeout(timer);
		if (!active) return;
		active = false;
		wheel.reset();
		if (current()) track.release();
	};
	scroll.addEventListener(
		"wheel",
		(event: WheelEvent) => {
			if (touch) return;
			if (!current() || fromField(event) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
			const delta = wheelPixels(event, scroll.clientHeight);
			const eligible =
				delta > 0 &&
				!readEnd() &&
				scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
			const accepted = wheel.feed(delta, eligible);
			if (!eligible) {
				previous = delta;
				return release();
			}
			if (active && delta < previous * 0.9) {
				previous = delta;
				return release();
			}
			if (!accepted) return;
			if (event.cancelable) event.preventDefault();
			previous = delta;
			if (!active) {
				active = true;
				track.begin();
			}
			track.pull(-delta, true);
			clearTimeout(timer);
			timer = window.setTimeout(release, wheelInput.releaseIdleMs);
		},
		{ passive: false },
	);
	scroll.addEventListener(
		"touchstart",
		(event: TouchEvent) => {
			release();
			touch =
				event.touches.length === 1 && !fromField(event)
					? { x: event.touches[0].clientX, y: event.touches[0].clientY }
					: null;
		},
		{ passive: true },
	);
	scroll.addEventListener(
		"touchmove",
		(event: TouchEvent) => {
			if (!touch || !current()) return;
			if (event.touches.length !== 1) {
				touch = null;
				return release();
			}
			const point = event.touches[0],
				delta = point.clientY - touch.y;
			if (Math.abs(point.clientX - touch.x) > Math.abs(delta)) {
				touch = null;
				return release();
			}
			if (
				delta >= 0 ||
				readEnd() ||
				scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 2
			) {
				touch = { x: point.clientX, y: point.clientY };
				return release();
			}
			if (!event.cancelable) {
				touch = null;
				return release();
			}
			event.preventDefault();
			if (!active) {
				active = true;
				track.begin();
			}
			track.pull(delta);
		},
		{ passive: false },
	);
	for (const type of ["touchend", "touchcancel"])
		scroll.addEventListener(
			type,
			() => {
				touch = null;
				release();
			},
			{ passive: true },
		);
}
