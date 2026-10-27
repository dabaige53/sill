/*! Interaction adapted from https://github.com/xevrion/ui-lab (tag-input), MIT License,
Copyright (c) 2026 Yash Bavadiya. See home-search-motion.ts for the full notice.
*/
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";

const timing = tokens.motion.tagInput;
const SLOT = "\u0000input";

export type TagSnapshot = { rects: Map<string, DOMRect>; leaving?: HTMLElement; removed?: string };

const chips = (list: HTMLElement | null) => [
	...(list?.querySelectorAll<HTMLElement>(":scope > .tag-pill") || []),
];
const keyOf = (node: HTMLElement) => node.dataset.tag ?? SLOT;

/** Read every chip and the input slot before a repaint; a removed chip is kept as a visual copy. */
export function captureTags(list: HTMLElement | null, removed?: string): TagSnapshot {
	const rects = new Map<string, DOMRect>();
	for (const node of list?.querySelectorAll<HTMLElement>(":scope > li") || [])
		rects.set(keyOf(node), node.getBoundingClientRect());
	const source = chips(list).find((node) => node.dataset.tag === removed);
	const leaving = source?.cloneNode(true) as HTMLElement | undefined;
	if (leaving) {
		leaving.removeAttribute("data-tag");
		leaving.inert = true;
		leaving.setAttribute("aria-hidden", "true");
	}
	return { rects, leaving, removed };
}

/**
 * After a repaint: chips that moved slide to their new place, a removed chip fades out where it
 * stood, and new chips pop in. A typed tag keeps its letters still; only its body and × arrive.
 */
export function settleTags(
	list: HTMLElement | null,
	before: TagSnapshot,
	added: string[] = [],
	typed = false,
) {
	if (!list || MotionEngine.keyboard) return;
	const box = list.getBoundingClientRect();
	for (const node of list.querySelectorAll<HTMLElement>(":scope > li")) {
		const key = keyOf(node);
		const from = before.rects.get(key);
		if (added.includes(key)) {
			popTag(node, typed);
			continue;
		}
		if (!from) continue;
		const to = node.getBoundingClientRect();
		const dx = from.left - to.left,
			dy = from.top - to.top;
		if (dx || dy)
			MotionEngine.animate(
				node,
				[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
				{ spring: "tag-slide" },
			);
	}
	const ghost = before.leaving;
	const rect = before.removed === undefined ? undefined : before.rects.get(before.removed);
	if (!ghost || !rect) return;
	Object.assign(ghost.style, {
		position: "absolute",
		left: `${rect.left - box.left}px`,
		top: `${rect.top - box.top}px`,
		width: `${rect.width}px`,
		margin: "0",
		pointerEvents: "none",
	});
	list.append(ghost);
	const leave = MotionEngine.animate(
		ghost,
		[
			{ opacity: 1, transform: "none", filter: "blur(0px)" },
			{
				opacity: 0,
				transform: `scale(${timing.enterScale})`,
				filter: `blur(${timing.leaveBlur}px)`,
			},
		],
		{ duration: timing.leave, easing: timing.leaveEase, fill: "forwards" },
	);
	if (leave)
		leave.finished.then(
			() => ghost.remove(),
			() => ghost.remove(),
		);
	else ghost.remove();
}

function popTag(chip: HTMLElement, typed: boolean) {
	const hidden = `scale(${timing.enterScale})`;
	if (!typed) {
		MotionEngine.animate(
			chip,
			[
				{ opacity: 0, transform: hidden, filter: `blur(${timing.enterBlur}px)` },
				{ opacity: 1, transform: "none", filter: "blur(0px)" },
			],
			{ spring: "tag-pop" },
		);
		return;
	}
	const body = chip.querySelector<HTMLElement>(".tag-pill-body");
	const remove = chip.querySelector<HTMLElement>("button");
	MotionEngine.animate(
		body,
		[
			{ opacity: 0, transform: hidden },
			{ opacity: 1, transform: "none" },
		],
		{ spring: "tag-pop" },
	);
	MotionEngine.animate(
		remove,
		[
			{ opacity: 0, transform: "scale(0.25)", filter: `blur(${timing.enterBlur}px)` },
			{ opacity: 1, transform: "none", filter: "blur(0px)" },
		],
		{ spring: "search-icon", delay: timing.removeDelay, fill: "backwards" },
	);
}

/** A tag that is already there shakes instead of being added twice. */
export function shakeTag(list: HTMLElement | null, tag: string) {
	const chip = chips(list).find((node) => node.dataset.tag === tag);
	const text = chip?.querySelector<HTMLElement>(".tag-pill-text");
	if (!text) return;
	MotionEngine.animate(
		text,
		[0, -4, 4, -3, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
		{ duration: timing.shake, easing: timing.shakeEase },
	);
}

/** The first Backspace on an empty field arms the last chip; the second removes it. */
export function armLastTag(list: HTMLElement | null, armed: boolean) {
	const all = chips(list);
	const target = armed ? all.at(-1) : all.find((node) => node.classList.contains("is-armed"));
	if (!target || target.classList.contains("is-armed") === armed) return;
	const body = target.querySelector<HTMLElement>(".tag-pill-body");
	const from = body && getComputedStyle(body).backgroundColor;
	target.classList.toggle("is-armed", armed);
	if (body && from)
		MotionEngine.animate(
			body,
			[{ backgroundColor: from }, { backgroundColor: getComputedStyle(body).backgroundColor }],
			{ duration: timing.leave, easing: timing.leaveEase },
		);
}

export function armedTag(list: HTMLElement | null) {
	return chips(list).find((node) => node.classList.contains("is-armed"))?.dataset.tag;
}

export function announceTags(text: string) {
	const live = document.getElementById("tag-live");
	if (live) live.textContent = text;
}
