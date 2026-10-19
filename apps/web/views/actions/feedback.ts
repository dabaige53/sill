import { createElement } from "react";
import { copy } from "../../copy.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import { LocalSync } from "../../services/local-sync.ts";
import type { AppController } from "../app.ts";
import { ConfirmActions } from "../cloud-views.tsx";
import type { ActionHandler } from "./types.ts";

function refresh(this: AppController) {
	this.gestures.refresh();
}

function retry(this: AppController) {
	this.gestures.refresh();
}

function showNew(this: AppController) {
	this.showNew();
}

function syncRetry(this: AppController) {
	this.refresh();
}

function syncExport(this: AppController) {
	this.exportAll();
}

function syncDiscard(this: AppController) {
	this.openModal(
		Panels.confirm(
			copy("web.app.ecb323046b6a"),
			copy("web.app.cd47b1d68c71"),
			createElement(ConfirmActions, {
				label: copy("web.app.c3520240ae08"),
				action: "sync-discard-confirm",
			}),
		),
		"confirm",
		null,
		"panel narrow",
	);
}

function syncDiscardConfirm(this: AppController) {
	LocalSync.discard()
		.then(() => this.closeNative())
		.catch((error?: any) => this.alert(error.message));
}

function toastClose(this: AppController) {
	this.hideToast();
}

function undo(this: AppController) {
	if (this.undoAction) {
		const fn = this.undoAction;
		this.undoAction = null;
		this.hideToast();
		fn();
	}
}

export const feedbackActions = {
	refresh: refresh,
	retry: retry,
	"show-new": showNew,
	"sync-retry": syncRetry,
	"sync-export": syncExport,
	"sync-discard": syncDiscard,
	"sync-discard-confirm": syncDiscardConfirm,
	"toast-close": toastClose,
	undo: undo,
} satisfies Record<string, ActionHandler>;
