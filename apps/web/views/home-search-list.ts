import type { ReactNode } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "../interactions/motion.ts";
import type { Playback } from "../interactions/motion-playback.ts";
import { renderView } from "./react-renderer.ts";

const lists = new WeakMap<HTMLElement, { open: boolean; animation: Playback | null }>();

/** Retain outgoing options until exit finishes; reverse from the currently drawn frame. */
export function renderSearchList(slot: HTMLElement, open: boolean, content: ReactNode) {
	const state = lists.get(slot) || { open: false, animation: null };
	lists.set(slot, state);
	const previous = slot.querySelector<HTMLElement>(".home-hash");
	const drawn = previous && getComputedStyle(previous);
	const from = drawn && { opacity: drawn.opacity, transform: drawn.transform };
	const changed = state.open !== open;
	if (changed) state.animation?.cancel();
	state.open = open;
	if (open) renderView(slot, content);
	const list = slot.querySelector<HTMLElement>(".home-hash");
	if (!list) return null;
	if (changed && open) delete list.dataset.options;
	list.inert = !open;
	list.setAttribute("aria-hidden", String(!open));
	if (!changed) return open ? list : null;
	const timing = tokens.motion.searchChoice;
	const animation =
		list.getBoundingClientRect().width > 0
			? MotionEngine.animate(
					list,
					[
						from || { opacity: 0, transform: `scale(${timing.listScale})` },
						{ opacity: open ? 1 : 0, transform: open ? "none" : `scale(${timing.listScale})` },
					],
					{ duration: open ? timing.listOpen : timing.listClose, easing: timing.listEase },
				)
			: null;
	state.animation = animation;
	const finish = () => {
		if (state.animation !== animation || state.open !== open) return;
		state.animation = null;
		if (!open) renderView(slot, null);
	};
	if (animation) animation.finished.then(finish, () => {});
	else finish();
	return open ? list : null;
}
