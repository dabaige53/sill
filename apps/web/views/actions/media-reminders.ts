import { Store } from "../../data/store.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function photoStep(this: AppController, { id, extra, name }: ActionContext) {
	const c = Store.card(id),
		n = (c.images || []).length;
	const next = Math.max(
		0,
		Math.min(n - 1, name === "photo-go" ? Number(extra) : this.photoIndex + Number(extra)),
	);
	if (next === this.photoIndex) return;
	this.photoIndex = next;
	// Photo navigation replaces the content; retain the shared recovery notice and its state.
	const toast = this.dialog.querySelector("#toast");
	if (toast) document.body.appendChild(toast);
	this.replacePanelContent(Panels.lightbox(c, this.photoIndex, this));
	if (toast) this.dialog.appendChild(toast);
}

function snooze(this: AppController, { id, name }: ActionContext) {
	this.changeReminder(id, name);
}

export const mediaReminderActions = {
	"photo-step": photoStep,
	"photo-go": photoStep,
	snooze: snooze,
	"dismiss-reminder": snooze,
	"complete-reminder": snooze,
	"restore-reminder": snooze,
} satisfies Record<string, ActionHandler>;
