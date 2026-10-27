import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { stretchEdges } from "./stretch-edges.ts";

const lenses = new WeakMap<
	HTMLElement,
	{ edges: ReturnType<typeof stretchEdges>; key: string; width: number }
>();

// @design nav-capsule
// https://lab.xevrion.dev/lab/segmented-control — one clipped row recolors icons at the moving edge.
export function placeNavigationLens(nav: HTMLElement, tab: HTMLElement) {
	const lens = nav.querySelector<HTMLElement>(".nav-lens");
	if (!lens || !nav.clientWidth) return;
	let state = lenses.get(nav);
	if (!state) {
		const edges = stretchEdges((left, right) => {
			lens.style.clipPath = `inset(${tab.offsetTop}px ${Math.max(0, nav.clientWidth - right)}px ${tab.offsetTop}px ${Math.max(0, left)}px round ${nav.clientHeight}px)`;
		}, tokens.motion.segmentedControl);
		state = { edges, key: "", width: nav.clientWidth };
		lenses.set(nav, state);
	}
	const key = tab.dataset.extra ?? "home";
	const resized = state.width !== nav.clientWidth;
	if (key === state.key && !resized) return;
	state.edges.move(
		tab.offsetLeft,
		tab.offsetLeft + tab.offsetWidth,
		resized || document.documentElement.dataset.inputModality === "keyboard",
	);
	state.key = key;
	state.width = nav.clientWidth;
}
