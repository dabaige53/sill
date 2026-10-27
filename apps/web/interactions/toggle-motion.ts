import { MotionEngine } from "./motion.ts";

export function captureToggle(node: HTMLElement) {
	const knob = node.querySelector<HTMLElement>(".toggle-knob");
	const state = {
		checked: node.getAttribute("aria-checked"),
		transform: getComputedStyle(knob || node, knob ? undefined : "::before").transform,
		backgroundColor: getComputedStyle(node).backgroundColor,
	};
	return state;
}

export function animateToggle(node: HTMLElement, previous: ReturnType<typeof captureToggle>) {
	if (node.hasAttribute("data-live-toggle") || !previous || previous.checked === node.getAttribute("aria-checked")) return;
	// Only the changed switch stops. Read its destination after removing the old effect;
	// unchanged switches keep their spring through settings and sync redraws.
	MotionEngine.cancel(node, true);
	const thumb = node.querySelector<HTMLElement>(".toggle-knob");
	const knob = thumb ? null : MotionEngine.animate(
		thumb || node,
		[
			{ transform: previous.transform },
			{ transform: getComputedStyle(thumb || node, thumb ? undefined : "::before").transform },
		],
		{ spring: "toggle", ...(thumb ? {} : { pseudoElement: "::before" }) },
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
