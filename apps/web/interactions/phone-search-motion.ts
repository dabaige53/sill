import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";

type Drawn = { opacity: string; transform: string; clipPath: string; rect: DOMRect };
export type SearchPose = {
	nodes: Map<HTMLElement, Drawn>;
	header?: DOMRect;
	result?: { node: HTMLElement; rect: DOMRect; opacity: string };
};
const states = new WeakMap<
	HTMLElement,
	{ animations: (Playback | null)[]; openedAt: number; ghost?: HTMLElement }
>();
const timing = tokens.motion.phoneSearch;
const list = tokens.motion.searchChoice;
const actors = (dialog: HTMLElement) =>
	[
		...dialog.querySelectorAll<HTMLElement>(
			".search-header, .search-page-heading, .search-browse, .search-cancel, .search-pill, .search-clear, .search-dictate, #search-results, .search-chips",
		),
		document.getElementById("dock"),
	].filter(Boolean) as HTMLElement[];

/** Read the drawn frame before cancellation or a query reset changes the DOM. */
export function capturePhoneSearch(dialog: HTMLElement, retainResults = false): SearchPose {
	const nodes = new Map(
		actors(dialog).map((node) => {
			const style = getComputedStyle(node);
			return [
				node,
				{
					opacity: style.opacity,
					transform: style.transform,
					clipPath: style.clipPath,
					rect: node.getBoundingClientRect(),
				},
			] as const;
		}),
	);
	const result = dialog.querySelector<HTMLElement>("#search-results:not(:has(.search-browse))");
	return {
		nodes,
		header: dialog.querySelector(".search-header")?.getBoundingClientRect(),
		result:
			retainResults && result
				? {
						node: result.cloneNode(true) as HTMLElement,
						rect: result.getBoundingClientRect(),
						opacity: getComputedStyle(result).opacity,
					}
				: undefined,
	};
}
function draw(node: HTMLElement, pose: SearchPose) {
	return (
		pose.nodes.get(node) || {
			opacity: "0",
			transform: "none",
			clipPath: "none",
			rect: node.getBoundingClientRect(),
		}
	);
}
function fade(
	node: HTMLElement,
	from: string | number,
	to: string | number,
	duration: number,
	delay = 0,
) {
	return MotionEngine.animate(node, [{ opacity: from }, { opacity: to }], {
		duration,
		delay,
		easing: "ease",
		fill: "backwards",
	});
}
function travel(
	node: HTMLElement,
	from: string,
	to: string,
	duration: number,
	delay = 0,
	easing = timing.supportEase,
) {
	return MotionEngine.animate(node, [{ transform: from }, { transform: to }], {
		duration,
		delay,
		easing,
		fill: "backwards",
	});
}
export function revealPhoneSearchResults(dialog: HTMLElement) {
	if (!dialog.classList.contains("search-editing")) return;
	const state = states.get(dialog);
	const delay = Math.max(
		0,
		timing.resultDelay - (performance.now() - (state?.openedAt ?? performance.now())),
	);
	const nodes = [
		...dialog.querySelectorAll<HTMLElement>(
			"#search-results:not(:has(.search-browse)), .search-chips:not([hidden])",
		),
	];
	for (const node of nodes) {
		state?.animations.push(
			fade(node, 0, 1, timing.resultFade, delay),
			travel(node, `translateY(${timing.resultTravel}px)`, "none", timing.resultMove, delay),
		);
	}
}
const docks = new WeakMap<HTMLElement, (Playback | null)[]>();
/**
 * The keyboard decides two things: while it is up, card suggestions cover the results (opening
 * and closing like the Web Combobox list) and the tab bar steps aside. A submitted search, or a
 * tap on the results, puts the keyboard away: the full results show and the tab bar takes taps.
 */
export function syncPhoneSearchKeyboard(dialog: HTMLElement, typing: boolean, pose?: SearchPose) {
	if (dialog.classList.contains("search-keyboard") === typing) return;
	const dock = document.getElementById("dock");
	const drawn = dock && getComputedStyle(dock);
	const before =
		dock && (pose?.nodes.get(dock) || { opacity: drawn.opacity, transform: drawn.transform });
	const toggle = () => dialog.classList.toggle("search-keyboard", typing);
	const suggest = dialog.querySelector<HTMLElement>(".search-suggest");
	if (suggest)
		MotionEngine.change(suggest, toggle, typing ? list.listOpen : list.listClose, {
			easing: list.listEase,
		});
	else toggle();
	if (!dock || !before) return;
	for (const animation of docks.get(dock) || []) animation?.cancel();
	dock.inert = typing;
	dock.style.visibility = "visible";
	const movement = travel(
		dock,
		before.transform || "none",
		typing ? `translateY(${timing.navTravel}px)` : "none",
		timing.navMove,
		0,
		timing.navEase,
	);
	const animations = [
		fade(dock, before.opacity || (typing ? "1" : "0"), typing ? 0 : 1, timing.navFade),
		movement,
	];
	docks.set(dock, animations);
	const finish = () => {
		if (docks.get(dock) === animations) dock.style.visibility = typing ? "hidden" : "";
	};
	if (movement) movement.finished.then(finish, () => {});
	else finish();
}
export function transitionPhoneSearch(
	dialog: HTMLElement,
	editing: boolean,
	captured?: SearchPose,
	typing = editing,
) {
	if (dialog.classList.contains("search-editing") === editing) return;
	const pose = captured || capturePhoneSearch(dialog);
	const previous = states.get(dialog);
	// Sampling precedes cancellation so a rapid reversal continues from its visible frame.
	for (const animation of previous?.animations || []) animation?.cancel();
	previous?.ghost?.remove();
	dialog.classList.toggle("search-editing", editing);
	const state = {
		animations: [] as (Playback | null)[],
		openedAt: performance.now(),
		ghost: undefined as HTMLElement | undefined,
	};
	states.set(dialog, state);
	const header = dialog.querySelector<HTMLElement>(".search-header");
	const cancel = dialog.querySelector<HTMLElement>(".search-cancel");
	const pill = dialog.querySelector<HTMLElement>(".search-pill");
	const gap = header ? Number.parseFloat(getComputedStyle(header).gap) || 0 : 0;
	const reserve = cancel ? cancel.getBoundingClientRect().width + gap : 0;
	header?.style.setProperty("--search-cancel-space", `${reserve}px`);
	if (header && pose.header) {
		const target = header.getBoundingClientRect();
		state.animations.push(
			MotionEngine.animate(
				header,
				[
					{
						transform: `translate(${pose.header.left - target.left}px, ${pose.header.top - target.top}px)`,
					},
					{ transform: "none" },
				],
				{ duration: timing.move, easing: timing.moveEase },
			),
		);
	}
	if (cancel) {
		cancel.inert = !editing;
		const before = draw(cancel, pose);
		state.animations.push(fade(cancel, before.opacity || "0", editing ? 1 : 0, timing.cancelFade));
		state.animations.push(
			MotionEngine.animate(
				cancel,
				[
					{
						clipPath:
							before.clipPath && before.clipPath !== "none"
								? before.clipPath
								: editing
									? "inset(0 100% 0 0)"
									: "inset(0 0% 0 0)",
					},
					{ clipPath: editing ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" },
				],
				{ duration: timing.cancelResize, easing: timing.supportEase },
			),
		);
	}
	if (pill) {
		const radius = getComputedStyle(pill).borderRadius || "0px";
		const before = draw(pill, pose);
		state.animations.push(
			MotionEngine.animate(
				pill,
				[
					{
						clipPath:
							before.clipPath && before.clipPath !== "none"
								? before.clipPath
								: `inset(0 ${editing ? 0 : reserve}px 0 0 round ${radius})`,
					},
					{ clipPath: `inset(0 ${editing ? reserve : 0}px 0 0 round ${radius})` },
				],
				{ duration: timing.cancelResize, easing: timing.supportEase },
			),
		);
		for (const control of pill.querySelectorAll<HTMLElement>(".search-clear, .search-dictate")) {
			const target = control.getBoundingClientRect(),
				from = pose.nodes.get(control)?.rect;
			if (from)
				state.animations.push(
					travel(control, `translateX(${from.left - target.left}px)`, "none", timing.cancelResize),
				);
		}
	}
	for (const node of dialog.querySelectorAll<HTMLElement>(".search-page-heading, .search-browse")) {
		const before = draw(node, pose),
			head = node.classList.contains("search-page-heading");
		node.inert = editing;
		state.animations.push(
			fade(
				node,
				before.opacity || (editing ? "1" : "0"),
				editing ? 0 : 1,
				head ? timing.headFade : timing.browseFade,
			),
			travel(
				node,
				before.transform || "none",
				editing ? `translateY(-${timing.headTravel}px)` : "none",
				head ? timing.headMove : timing.browseMove,
				0,
				head ? timing.supportEase : timing.browseEase,
			),
		);
	}
	syncPhoneSearchKeyboard(dialog, typing, pose);
	if (editing) revealPhoneSearchResults(dialog);
	else {
		if (pose.result) {
			const { node, rect, opacity } = pose.result;
			node.removeAttribute("id");
			node.querySelectorAll("[id]").forEach((child) => {
				child.removeAttribute("id");
			});
			node.inert = true;
			node.setAttribute("aria-hidden", "true");
			Object.assign(node.style, {
				position: "fixed",
				left: `${rect.left}px`,
				top: `${rect.top}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				pointerEvents: "none",
				zIndex: "2",
				// The fade ends before the slide; without an end opacity the copy came back whole
				// for the rest of the slide, and the results flashed over the returning search page.
				opacity: "0",
			});
			dialog.append(node);
			state.ghost = node;
			state.animations.push(
				fade(node, opacity || "1", 0, timing.resultFade),
				travel(node, "none", `translateY(${timing.resultTravel}px)`, timing.resultMove),
			);
			Promise.all(state.animations.map((animation) => animation?.finished)).then(
				() => node.remove(),
				() => {},
			);
		}
	}
}
export function resetPhoneSearch(dialog: HTMLElement) {
	const state = states.get(dialog);
	for (const animation of state?.animations || []) animation?.cancel();
	state?.ghost?.remove();
	states.delete(dialog);
	dialog.classList.remove("search-keyboard");
	const dock = document.getElementById("dock");
	if (dock) {
		for (const animation of docks.get(dock) || []) animation?.cancel();
		docks.delete(dock);
		dock.inert = false;
		dock.style.visibility = "";
	}
}
