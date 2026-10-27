import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";

/** Keep context timing independent from navigation; opacity finishes before the gentle travel. */
export function contextMotion(
	node: HTMLElement,
	entering: boolean,
	phone = false,
	delay = 0,
): Playback | null {
	const timing = tokens.motion.aiContext;
	const drawn = getComputedStyle(node);
	const travel = phone ? timing.phoneTravel : timing.webTravel;
	const movement = MotionEngine.animate(
		node,
		[
			{ transform: entering ? `translateY(${travel}px)` : drawn.transform },
			{ transform: entering ? "none" : `translateY(${travel}px)` },
		],
		{
			duration: entering ? timing.enterMove : timing.exitMove,
			delay,
			easing: MotionEngine.curve("ease-reveal"),
		},
	);
	const fade = MotionEngine.animate(
		node,
		[{ opacity: entering ? 0 : drawn.opacity }, { opacity: entering ? 1 : 0 }],
		{ duration: entering ? timing.enterFade : timing.exitFade, delay, fill: "forwards" },
	);
	if (!movement && !fade) return null;
	const finished = Promise.all([movement?.finished, fade?.finished]).then(() => {
		fade?.cancel();
	});
	finished.catch(() => {});
	return {
		finished,
		cancel() {
			movement?.cancel();
			fade?.cancel();
		},
		complete() {
			movement?.complete();
			fade?.complete();
		},
	};
}
export function reflowContext(node: HTMLElement, before: DOMRect) {
	const rect = node.getBoundingClientRect();
	const x = before.left - rect.left,
		y = before.top - rect.top;
	if (!x && !y) return;
	return MotionEngine.animate(
		node,
		[{ transform: `translate(${x}px,${y}px)` }, { transform: "none" }],
		{
			duration: tokens.motion.aiContext.reflow,
			easing: MotionEngine.curve("ease-reveal"),
		},
	);
}
