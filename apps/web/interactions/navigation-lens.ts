import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { stretchEdges } from "./stretch-edges.ts";

const lenses = new WeakMap<
	HTMLElement,
	{
		edges: ReturnType<typeof stretchEdges>;
		key: string;
		width: number;
		// Geometry is read once per move. Read on every spring frame, it forced layout of the page
		// that the same tap was opening.
		top: number;
		height: number;
	}
>();

// @design nav-capsule
// https://lab.xevrion.dev/lab/segmented-control — one clipped row recolors icons at the moving edge.
export function placeNavigationLens(nav: HTMLElement, tab: HTMLElement) {
	const lens = nav.querySelector<HTMLElement>(".nav-lens");
	if (!lens || !nav.clientWidth) return;
	let state = lenses.get(nav);
	if (!state) {
		const edges = stretchEdges((left, right) => {
			const geometry = lenses.get(nav);
			if (!geometry) return;
			const { top, width, height } = geometry;
			lens.style.clipPath = `inset(${top}px ${Math.max(0, width - right)}px ${top}px ${Math.max(0, left)}px round ${height}px)`;
		}, tokens.motion.segmentedControl);
		state = { edges, key: "", width: 0, top: 0, height: 0 };
		lenses.set(nav, state);
	}
	const key = tab.dataset.extra ?? "home";
	const width = nav.clientWidth;
	const resized = state.width !== width;
	if (key === state.key && !resized) return;
	state.top = tab.offsetTop;
	state.height = nav.clientHeight;
	state.width = width;
	state.key = key;
	state.edges.move(
		tab.offsetLeft,
		tab.offsetLeft + tab.offsetWidth,
		resized || document.documentElement.dataset.inputModality === "keyboard",
	);
}
