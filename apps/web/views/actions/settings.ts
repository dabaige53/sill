import { createElement } from "react";
import { defaultAppearance } from "../../../../contracts/appearance.ts";
import { copy } from "../../copy.ts";
import { Store } from "../../data/store.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import type { AppController } from "../app.ts";
import { ConfirmActions } from "../cloud-views.tsx";
import type { ActionContext, ActionHandler } from "./types.ts";

function settings(this: AppController) {
	this.settingsGroup = "desk";
	this.openPanel("settings");
}

function settingsGroup(this: AppController, { extra }: ActionContext) {
	this.settingsGroup = extra;
	this.repaintSettings();
	this.dialog
		.querySelector(`[data-action="settings-group"][data-extra="${extra}"]`)
		?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function pref(this: AppController, { id, extra }: ActionContext) {
	const before = this.setPref(id, extra);
	if (before !== extra && ["archiveAfter", "theme", "density"].includes(id))
		this.announce(copy("web.app.434203a723b4"));
}

function prefToggle(this: AppController, { id }: ActionContext) {
	this.setPref(id, !Store.pref(id));
}

function exportAll(this: AppController) {
	this.exportAll();
}

function clearAll(this: AppController) {
	const back =
		this.modalKind === "settings"
			? () => this.swapPanel(Panels.settings(this, "data"), "settings", "panel wide")
			: null;
	this.panelReturn = back;
	this.swapPanel(
		Panels.confirm(
			copy("web.app.7f1a78cdb3f2"),
			copy("web.app.d008fc7f75ba"),
			createElement(ConfirmActions, {
				label: copy("web.app.bce2377283c2"),
				action: "clear-confirm",
				danger: true,
			}),
		),
		"confirm",
		"panel narrow",
	);
}

function clearConfirm(this: AppController) {
	Store.state.cards = [];
	Store.state.items = {};
	Store.state.freshIds = [];
	Store.state.preferences.onboarded = false;
	Store.save();
	this.panelReturn = null;
	this.closeNative();
	this.pendingCards = [];
	this.renderCurrent(true);
}

function resetLayout(this: AppController) {
	Object.assign(Store.state.preferences, defaultAppearance, { density: "standard" });
	Store.save();
	this.applyPreferences();
	this.withFeedAnchor(() => {}, true);
	this.repaintSettings();
}

export const settingsActions = {
	"layout-reset": resetLayout,
	settings: settings,
	"settings-group": settingsGroup,
	pref: pref,
	"pref-toggle": prefToggle,
	"export-all": exportAll,
	"clear-all": clearAll,
	"clear-confirm": clearConfirm,
} satisfies Record<string, ActionHandler>;
