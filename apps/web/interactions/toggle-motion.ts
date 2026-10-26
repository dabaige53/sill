import { MotionEngine } from "./motion.ts";

export function captureToggle(node: HTMLElement) {
	const state = {
		checked: node.getAttribute("aria-checked"),
		transform: getComputedStyle(node, "::before").transform,
	};
	MotionEngine.cancel(node);
	return state;
}

export function animateToggle(node: HTMLElement, previous: ReturnType<typeof captureToggle>) {
	if (!previous || previous.checked === node.getAttribute("aria-checked")) return;
	return MotionEngine.animate(
		node,
		[
			{ transform: previous.transform },
			{ transform: getComputedStyle(node, "::before").transform },
		],
		{ duration: MotionEngine.time("dur-press"), pseudoElement: "::before" },
	);
}
