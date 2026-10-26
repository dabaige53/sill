import { MotionEngine } from "./motion.ts";

export function captureToggle(node: HTMLElement) {
	const state = {
		checked: node.getAttribute("aria-checked"),
		transform: getComputedStyle(node, "::before").transform,
		backgroundColor: getComputedStyle(node).backgroundColor,
	};
	MotionEngine.cancel(node);
	return state;
}

export function animateToggle(node: HTMLElement, previous: ReturnType<typeof captureToggle>) {
	if (!previous || previous.checked === node.getAttribute("aria-checked")) return;
	const knob = MotionEngine.animate(
		node,
		[
			{ transform: previous.transform },
			{ transform: getComputedStyle(node, "::before").transform },
		],
		{ spring: "toggle", pseudoElement: "::before" },
	);
	MotionEngine.animate(
		node,
		[
			{ backgroundColor: previous.backgroundColor },
			{ backgroundColor: getComputedStyle(node).backgroundColor },
		],
		{ spring: "toggle" },
	);
	return knob;
}
