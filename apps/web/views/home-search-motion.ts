/*! Interaction adapted from https://github.com/xevrion/ui-lab.
MIT License

Copyright (c) 2026 Yash Bavadiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { createElement } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { Icon } from "../atoms/react-primitives.tsx";
import { MotionEngine } from "../interactions/motion.ts";
import { renderView } from "./react-renderer.ts";

const flights = new WeakMap<HTMLElement, DOMRect>();

const iconPose = (visible: boolean) => ({
	transform: visible ? "scale(1)" : "scale(0.25)",
	opacity: visible ? "1" : "0",
	filter: `blur(${visible ? 0 : tokens.motion.searchChoice.iconBlur}px)`,
});

/** Reserve the trailing slot so the clear icon can leave without moving the input. */
export function syncSearchClear(field: HTMLElement, visible: boolean) {
	const node = field.querySelector<HTMLElement>(".home-search-clear");
	if (!node) return;
	const old = node.dataset.visible;
	node.dataset.visible = String(visible);
	node.hidden = false;
	node.inert = !visible;
	node.tabIndex = visible ? 0 : -1;
	node.setAttribute("aria-hidden", String(!visible));
	if (old === String(visible)) return;
	const to = iconPose(visible);
	if (old === undefined || MotionEngine.keyboard) {
		MotionEngine.cancel(node);
		Object.assign(node.style, to);
	} else {
		const drawn = getComputedStyle(node);
		MotionEngine.animate(
			node,
			[{ opacity: drawn.opacity, transform: drawn.transform, filter: drawn.filter }, to],
			{
				spring: "search-icon",
				duration: tokens.motion.searchIconSpring.duration * 1000,
				fill: "forwards",
			},
		);
	}
}

/** Capture the selected icon while its row is still mounted. */
export function searchChoiceOrigin(field: HTMLElement | null, extra: string) {
	const option = [
		...(field?.querySelectorAll<HTMLElement>('[data-action="home-hash"]') || []),
	].find((node) => node.dataset.extra === extra);
	const rect = option?.querySelector<HTMLElement>(".home-option-icon")?.getBoundingClientRect();
	if (field && rect?.width && field.dataset.choice !== extra && !MotionEngine.keyboard)
		flights.set(field, rect);
	return rect;
}

/** Like the reference avatar, every selected kind lands in the field's leading slot. */
export function flySearchChoice(field: HTMLElement | null) {
	if (!field) return;
	const from = flights.get(field);
	flights.delete(field);
	const target = field.querySelector<HTMLElement>(".home-search-choice");
	if (!target || !from || MotionEngine.keyboard) return;
	MotionEngine.cancel(target);
	const to = target.getBoundingClientRect();
	if (!to.width) return;
	MotionEngine.animate(
		target,
		[
			{
				transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
			},
			{ transform: "none" },
		],
		{ duration: tokens.motion.searchChoice.duration, easing: tokens.motion.searchChoice.easing },
	);
}

export function syncSearchIcon(field: HTMLElement, choice: string) {
	const slot = field.querySelector<HTMLElement>(".home-search-leading");
	if (!slot) return;
	const old = field.dataset.choice;
	field.dataset.choice = choice;
	const target = slot.querySelector<HTMLElement>(".home-search-choice");
	if (target && old !== choice) {
		const name = choice.startsWith("query:")
			? "clock"
			: choice.startsWith("tag:")
				? "tag"
				: "filter";
		renderView(target, createElement(Icon, { name, size: 16 }));
	}
	if (old === choice) return;
	for (const node of slot.querySelectorAll<HTMLElement>("[data-search-icon]")) {
		const visible = (node.dataset.searchIcon === "condition") === !!choice;
		const to = iconPose(visible);
		const instant = visible && flights.has(field);
		if (old === undefined || MotionEngine.keyboard || instant) {
			MotionEngine.cancel(node);
			Object.assign(node.style, to);
		} else {
			const drawn = getComputedStyle(node);
			MotionEngine.animate(
				node,
				[{ transform: drawn.transform, opacity: drawn.opacity, filter: drawn.filter }, to],
				{
					spring: "search-icon",
					duration: tokens.motion.searchIconSpring.duration * 1000,
					fill: "forwards",
				},
			);
		}
	}
}

/** Mouse hover moves only the highlight; keyboard navigation may also scroll the list. */
export function syncSearchHighlight(
	list: HTMLElement,
	identity: string,
	active: number,
	scroll = false,
) {
	const highlight = list.querySelector<HTMLElement>(".home-hash-highlight");
	const row = list.querySelector<HTMLElement>(`#home-option-${active}`);
	if (!highlight) return;
	highlight.hidden = !row;
	if (!row) return;
	const transform = `translateY(${row.offsetTop}px)`;
	const jump = list.dataset.options !== identity;
	if (jump || MotionEngine.keyboard) {
		MotionEngine.cancel(highlight);
		highlight.style.transform = transform;
	} else if (highlight.style.transform !== transform) {
		MotionEngine.change(
			highlight,
			() => {
				highlight.style.transform = transform;
			},
			tokens.motion.searchChoice.highlightDuration,
			{ easing: tokens.motion.searchChoice.listEase },
		);
	}
	list.dataset.options = identity;
	if (jump || scroll) {
		if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
		else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
			list.scrollTop = Math.max(0, row.offsetTop + row.offsetHeight - list.clientHeight);
	}
}
