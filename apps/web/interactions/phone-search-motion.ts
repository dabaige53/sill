import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";
import { markOpenPage } from "./status-bar.ts";

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
	// The categories count only while they show: editing hides them under the field.
	const result = dialog.querySelector<HTMLElement>(
		dialog.classList.contains("search-editing")
			? "#search-results:not(:has(.search-browse))"
			: "#search-results",
	);
	const copy = retainResults ? (result?.cloneNode(true) as HTMLElement | undefined) : undefined;
	const browse = result?.querySelector<HTMLElement>(".search-browse");
	const copied = copy?.querySelector<HTMLElement>(".search-browse");
	if (browse && copied) {
		// The copy keeps the grid it was drawn with, not the class that editing hides and that
		// the page reads to know it is showing categories.
		const { display, gridTemplateColumns, gap } = getComputedStyle(browse);
		copied.removeAttribute("class");
		Object.assign(copied.style, { display, gridTemplateColumns, gap });
	}
	return {
		nodes,
		header: dialog.querySelector(".search-header")?.getBoundingClientRect(),
		result: copy
			? {
					node: copy,
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
			travel(node, `translateY(${timing.resultTravel}px)`, "none", timing.resultMove, delay),
		);
		if (node.id !== "search-results") {
			state?.animations.push(fade(node, 0, 1, timing.resultFade, delay));
			continue;
		}
		// The cards in view come up with the bar, one after another, instead of the list blinking in.
		const cards = [...node.querySelectorAll<HTMLElement>("[data-card]")].filter(
			(card) => card.getBoundingClientRect().top < window.innerHeight,
		);
		cards.forEach((card, index) => {
			const start = delay + Math.min(index, 7) * timing.resultStagger;
			state?.animations.push(
				fade(card, 0, 1, timing.resultCardFade, start),
				travel(card, `translateY(${timing.resultTravel}px)`, "none", timing.resultMove, start),
			);
		});
	}
}
/** With nothing typed, editing hides the categories and has no results: the suggestions stay,
 * or the page under the field was left empty once the keyboard went (or a card closed). */
function suggesting(dialog: HTMLElement, typing: boolean) {
	return (
		typing ||
		(dialog.classList.contains("search-editing") &&
			!!dialog.querySelector("#search-results .search-browse"))
	);
}
/** Suggestions follow keyboard visibility; the editing page owns navigation visibility. */
export function syncPhoneSearchKeyboard(dialog: HTMLElement, typing: boolean, _pose?: SearchPose) {
	markOpenPage();
	const dock = document.getElementById("dock");
	if (dock) dock.inert = dialog.classList.contains("search-editing");
	const listed = suggesting(dialog, typing);
	if (dialog.classList.contains("search-keyboard") === listed) return;
	const toggle = () => dialog.classList.toggle("search-keyboard", listed);
	const suggest = dialog.querySelector<HTMLElement>(".search-suggest");
	if (suggest)
		MotionEngine.change(suggest, toggle, listed ? list.listOpen : list.listClose, {
			easing: list.listEase,
		});
	else toggle();
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
	dialog.classList.toggle("search-moving", editing);
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
	Promise.all(state.animations.map((animation) => animation?.finished)).then(
		() => {
			if (states.get(dialog) === state) dialog.classList.remove("search-moving");
		},
		() => {},
	);
	syncPhoneSearchKeyboard(dialog, typing, pose);
	if (editing) revealPhoneSearchResults(dialog);
	// A category's results replace the categories before this runs; a copy of the categories leaves
	// like the categories do while typing, instead of the grid vanishing to a blank page.
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
			...(editing
				? [
						fade(node, opacity || "1", 0, timing.browseFade),
						travel(
							node,
							"none",
							`translateY(-${timing.headTravel}px)`,
							timing.browseMove,
							0,
							timing.browseEase,
						),
					]
				: [
						fade(node, opacity || "1", 0, timing.resultFade),
						travel(node, "none", `translateY(${timing.resultTravel}px)`, timing.resultMove),
					]),
		);
		Promise.all(state.animations.map((animation) => animation?.finished)).then(
			() => node.remove(),
			() => {},
		);
	}
}
export function resetPhoneSearch(dialog: HTMLElement, preserveNavigation = false) {
	const state = states.get(dialog);
	for (const animation of state?.animations || []) animation?.cancel();
	state?.ghost?.remove();
	states.delete(dialog);
	dialog.classList.remove("search-moving");
	// The keyboard goes; suggestions with nothing typed stay under a card as they were.
	dialog.classList.toggle("search-keyboard", suggesting(dialog, false));
	const dock = document.getElementById("dock");
	if (dock && !preserveNavigation) {
		dock.inert = false;
		dock.style.visibility = "";
	}
}
