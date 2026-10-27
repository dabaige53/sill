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
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "../interactions/motion.ts";

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
