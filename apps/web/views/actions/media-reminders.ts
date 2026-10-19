import { Store } from "../../data/store.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function photoStep(this: AppController, { id, extra, name }: ActionContext) {
	const c = Store.card(id),
		n = (c.photos || [c.image]).length;
	this.photoIndex = name === "photo-go" ? Number(extra) : (this.photoIndex + Number(extra) + n) % n;
	// Photo navigation replaces the content; retain the shared recovery notice and its state.
	const toast = this.dialog.querySelector("#toast");
	if (toast) document.body.appendChild(toast);
	this.replacePanelContent(Panels.lightbox(c, this.photoIndex, this));
	if (toast) this.dialog.appendChild(toast);
}

function snooze(this: AppController, { id, name }: ActionContext) {
	this.changeReminder(id, name);
}

function mediaPlay(this: AppController) {
	this.playMedia();
}

function mediaNext(this: AppController) {
	const c = Store.card(this.currentId);
	this.pauseMedia();
	this.mediaIndex = Math.min((c.body.length || 1) - 1, this.mediaIndex + 1);
	this.paintMedia();
}

function mediaPrev(this: AppController) {
	this.pauseMedia();
	this.mediaIndex = Math.max(0, this.mediaIndex - 1);
	this.paintMedia();
}

function podcastPlay(this: AppController, { id }: ActionContext) {
	this.podcast(id);
}

function podcastSeek(this: AppController, { id, extra }: ActionContext) {
	this.podcast(id, Number(extra));
}

export const mediaReminderActions = {
	"photo-step": photoStep,
	"photo-go": photoStep,
	snooze: snooze,
	"dismiss-reminder": snooze,
	"complete-reminder": snooze,
	"restore-reminder": snooze,
	"media-play": mediaPlay,
	"media-next": mediaNext,
	"media-prev": mediaPrev,
	"podcast-play": podcastPlay,
	"podcast-seek": podcastSeek,
} satisfies Record<string, ActionHandler>;
