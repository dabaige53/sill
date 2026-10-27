import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "../interactions/motion.ts";

/** Carry only the condition icon; label text and the field retain their final geometry. */
export function searchChoiceOrigin(field: HTMLElement | null, extra: string) {
	const option = [
		...(field?.querySelectorAll<HTMLElement>('[data-action="home-hash"]') || []),
	].find((node) => node.dataset.extra === extra);
	return option?.querySelector<HTMLElement>(".home-option-icon")?.getBoundingClientRect();
}

export function flySearchChoice(field: HTMLElement | null, key: "tag" | "mark", from?: DOMRect) {
	const target = field?.querySelector<HTMLElement>(
		`.home-search-token[data-extra="${key}"] .home-condition-icon`,
	);
	if (!target || !from || MotionEngine.keyboard) return;
	const to = target.getBoundingClientRect();
	if (!from.width || !to.width) return;
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

export function syncSearchIcon(field: HTMLElement, selected: boolean) {
	const slot = field.querySelector<HTMLElement>(".home-search-leading");
	if (!slot || slot.dataset.selected === String(selected)) return;
	const old = slot.dataset.selected;
	slot.dataset.selected = String(selected);
	for (const node of slot.querySelectorAll<HTMLElement>("[data-search-icon]")) {
		const visible = (node.dataset.searchIcon === "condition") === selected;
		const to = { transform: visible ? "scale(1)" : "scale(0.25)", opacity: visible ? "1" : "0" };
		if (old === undefined || MotionEngine.keyboard) {
			MotionEngine.cancel(node);
			Object.assign(node.style, to);
		} else {
			const drawn = getComputedStyle(node);
			MotionEngine.animate(node, [{ transform: drawn.transform, opacity: drawn.opacity }, to], {
				spring: "search-icon",
				duration: tokens.motion.searchIconSpring.duration * 1000,
				fill: "forwards",
			});
		}
	}
}

/** One moving highlight, with instant placement when the list opens or is filtered. */
export function syncSearchHighlight(list: HTMLElement, identity: string, active: number) {
	const highlight = list.querySelector<HTMLElement>(".home-hash-highlight");
	const row = list.querySelector<HTMLElement>(`#home-option-${active}`);
	if (!highlight || !row) return;
	const transform = `translateY(${row.offsetTop}px)`;
	if (list.dataset.options !== identity || MotionEngine.keyboard) {
		MotionEngine.cancel(highlight);
		highlight.style.transform = transform;
	} else if (highlight.style.transform !== transform) {
		MotionEngine.change(
			highlight,
			() => {
				highlight.style.transform = transform;
			},
			tokens.motion.searchChoice.highlightDuration,
		);
	}
	list.dataset.options = identity;
	if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
	else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
		list.scrollTop = Math.max(0, row.offsetTop + row.offsetHeight - list.clientHeight);
}
