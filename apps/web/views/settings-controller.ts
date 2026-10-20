import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { renderView } from "./react-renderer.ts";
import type { AppController } from "./app.ts";

export function setPref(this: AppController, key?: any, value?: any) {
	const before = Store.pref(key);
	Store.setPref(key, value);
	this.applyPreferences();
	if (["stack", "fadeRead", "archiveAfter", "floatTimely", "density"].includes(key))
		this.withFeedAnchor(() => {}, true);
	if (this.modalKind === "settings") this.repaintSettings();
	return before;
}

export function repaintSettings(this: AppController) {
	const toggleKey = (node: HTMLElement) =>
		[node.dataset.action, node.dataset.id, node.dataset.extra].join("|");
	const toggles = new Map(
		[...this.dialog.querySelectorAll<HTMLElement>(".toggle")].map((node) => {
			const state = {
				checked: node.getAttribute("aria-checked"),
				transform: getComputedStyle(node, "::before").transform,
			};
			MotionEngine.cancel(node);
			return [toggleKey(node), state] as const;
		}),
	);

	const main = this.dialog.querySelector(".settings-main"),
		y = main?.scrollTop || 0,
		active = document.activeElement,
		key = [
			(active as HTMLElement)?.dataset.action,
			(active as HTMLElement)?.dataset.id,
			(active as HTMLElement)?.dataset.extra,
		].join("|");
	renderView(this.dialog, Panels.settings(this, this.settingsGroup));
	for (const node of this.dialog.querySelectorAll<HTMLElement>(".toggle")) {
		const previous = toggles.get(toggleKey(node));
		if (!previous || previous.checked === node.getAttribute("aria-checked")) continue;
		MotionEngine.animate(
			node,
			[
				{ transform: previous.transform },
				{ transform: getComputedStyle(node, "::before").transform },
			],
			{ duration: MotionEngine.time("dur-press"), pseudoElement: "::before" },
		);
	}
	const next = this.dialog.querySelector(".settings-main");
	if (next) next.scrollTop = y;
	[...this.dialog.querySelectorAll("[data-action]")]
		.find((n?: any) => [n.dataset.action, n.dataset.id, n.dataset.extra].join("|") === key)
		?.focus({ preventScroll: true });
}
