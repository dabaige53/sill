import { Store } from "../data/store.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
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
	const main = this.dialog.querySelector(".settings-main"),
		y = main?.scrollTop || 0,
		active = document.activeElement,
		key = [
			(active as HTMLElement)?.dataset.action,
			(active as HTMLElement)?.dataset.id,
			(active as HTMLElement)?.dataset.extra,
		].join("|");
	this.replacePanelContent(Panels.settings(this, this.settingsGroup));
	const next = this.dialog.querySelector(".settings-main");
	if (next) next.scrollTop = y;
	[...this.dialog.querySelectorAll("[data-action]")]
		.find((n?: any) => [n.dataset.action, n.dataset.id, n.dataset.extra].join("|") === key)
		?.focus({ preventScroll: true });
}
