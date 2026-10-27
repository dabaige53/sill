import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { wheelIntent } from "./gesture-input.ts";

export const refreshConfig = tokens.motion.pullRefresh;

/** One visible distance drives content, readiness and feedback. */
export function refreshBand(distance: number) {
	const d = Math.max(0, distance),
		{ rubberDimension: size, rubber } = refreshConfig;
	return (d * size * rubber) / (size + rubber * d);
}

export function refreshUnband(offset: number) {
	const { rubberDimension: size, rubber } = refreshConfig;
	return (offset * size) / (rubber * (size - offset));
}

/** Wheel has no finger-up phase. Require sustained decay, not one smaller event. */
export function refreshWheel(now = () => performance.now()) {
	const intent = wheelIntent(now);
	let tracking = false,
		distance = 0,
		peak = 0,
		previous = 0,
		decay = 0;
	return {
		feed(delta: number, eligible: boolean) {
			const active = intent.feed(delta, eligible);
			if (!eligible) {
				tracking = false;
				return { phase: "ignore" as const, distance: 0 };
			}
			if (!tracking) {
				if (!active) return { phase: "ignore" as const, distance: 0 };
				tracking = true;
				distance = decay = 0;
				peak = previous = delta;
				// The first wheel event establishes the edge origin; it cannot refresh alone.
				return { phase: "start" as const, distance };
			}
			decay = delta < previous ? decay + 1 : 0;
			previous = delta;
			peak = Math.max(peak, delta);
			if (
				decay >= refreshConfig.wheel.decaySamples &&
				delta <= peak * refreshConfig.wheel.decayRatio
			) {
				tracking = false;
				intent.reset();
				return { phase: "release" as const, distance };
			}
			distance += delta;
			return { phase: "pull" as const, distance };
		},
		reset(seen = true) {
			tracking = false;
			intent.reset(seen);
		},
	};
}
