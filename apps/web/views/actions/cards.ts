import { copy } from "../../copy.ts";
import { Store } from "../../data/store.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import {
	announceTags,
	captureTags,
	settleTags,
	shakeTag,
} from "../../interactions/tag-input-motion.ts";
import type { AppController } from "../app.ts";
import { renderView } from "../react-renderer.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function bookmark(this: AppController, { id }: ActionContext) {
	this.setFlag(id, "bookmarked", !Store.item(id).bookmarked);
}

function later(this: AppController, { id }: ActionContext) {
	this.setFlag(id, "later", !Store.item(id).later);
}

function task(this: AppController, { id, extra }: ActionContext) {
	this.toggleTask(id, extra);
}

function edit(this: AppController, { id }: ActionContext) {
	this.bulkEditIds = null;
	this.openPanel("editor", id);
}

function lessLike(this: AppController) {
	this.closeNative();
	this.toast(copy("web.app.0ec82d74e53c"));
}

function neverShow(this: AppController, { id }: ActionContext) {
	this.closeNative();
	Store.patch(id, { dismissed: true });
	this.withFeedAnchor(() => {}, true);
}

function toggleRead(this: AppController, { id }: ActionContext) {
	const before: Record<string, any> = { ...Store.item(id) },
		read = !before.read;
	Store.patch(id, {
		read,
		seen: read,
		progress: read ? 1 : 0,
		readAt: read ? Date.now() : 0,
	});
	this.refreshCard(id);
}

function archive(this: AppController, { extra }: ActionContext) {
	this.openPanel("archive", extra);
}

function restoreCard(this: AppController, { id }: ActionContext) {
	Store.patch(id, { archived: false, restoredAt: Date.now() });
	this.replacePanelContent(Panels.archive(this, this.editId));
	this.withFeedAnchor(() => {}, true);
}

function archiveAll(this: AppController) {
	const ids = this.shelved("stale").map((c?: any) => c.id);
	ids.forEach((i?: any) => {
		Store.patch(i, { archived: true });
	});
	this.closeNative();
	this.withFeedAnchor(() => {}, true);
}

const MAX_TAGS = 20;

/** Repaint the editor in place; only the chips that change or move animate (tag-input-motion). */
function paintTags(this: AppController, added: string[], typed: boolean, removed?: string) {
	const before = captureTags(document.getElementById("editor-tags"), removed);
	const note = (document.getElementById("note-editor") as HTMLInputElement)?.value;
	renderView(this.dialog, Panels.editor(this, this.editId));
	if (note !== undefined) (document.getElementById("note-editor") as HTMLInputElement).value = note;
	settleTags(document.getElementById("editor-tags"), before, added, typed);
}

/** A suggestion adds its tag; a chip's × removes it. Focus stays in the field. */
function editorTag(this: AppController, { extra }: ActionContext) {
	const removing = this.editTags.has(extra);
	if (!removing && this.editTags.size >= MAX_TAGS) {
		this.alert(copy("web.app.1859bc867672"));
		return;
	}
	if (removing) this.editTags.delete(extra);
	else this.editTags.add(extra);
	paintTags.call(this, removing ? [] : [extra], false, removing ? extra : undefined);
	announceTags(`${copy(removing ? "web.editor.tagRemoved" : "web.editor.tagAdded")}${extra}`);
	document.getElementById("tag-new")?.focus({ preventScroll: true });
}

/**
 * Enter or a comma adds the draft; a paste or a phone keyboard may bring several, split on
 * commas and new lines. A tag already there, in any case, shakes instead of doubling.
 */
function addTag(this: AppController, { extra }: ActionContext) {
	const field = document.getElementById("tag-new") as HTMLInputElement | null;
	const parts = (extra || field?.value || "")
		.split(/[,，\n]/)
		.map((part) => part.trim().replace(/^#/, "").slice(0, 30))
		.filter(Boolean);
	if (field) field.value = "";
	if (!parts.length) return;
	const added: string[] = [],
		repeated: string[] = [];
	for (const part of parts) {
		const lower = part.toLocaleLowerCase();
		const existing = [...this.editTags].find((tag) => tag.toLocaleLowerCase() === lower);
		if (existing) {
			if (!repeated.includes(existing)) repeated.push(existing);
			continue;
		}
		if (this.editTags.size >= MAX_TAGS) {
			this.alert(copy("web.app.1859bc867672"));
			break;
		}
		this.editTags.add(part);
		added.push(part);
	}
	if (added.length) paintTags.call(this, added, true);
	const list = document.getElementById("editor-tags");
	for (const tag of repeated) shakeTag(list, tag);
	announceTags(
		[
			...added.map((tag) => `${copy("web.editor.tagAdded")}${tag}`),
			...repeated.map((tag) => `${tag}${copy("web.editor.tagExistsSuffix")}`),
		].join("，"),
	);
	document.getElementById("tag-new")?.focus({ preventScroll: true });
}

function saveNote(this: AppController, { id }: ActionContext) {
	const pending = (document.getElementById("tag-new") as HTMLInputElement)?.value.trim();
	if (pending) this.editTags.add(pending.replace(/^#/, "").slice(0, 30));
	const note = (document.getElementById("note-editor") as HTMLInputElement).value.slice(0, 4000);
	const ids = this.bulkEditIds || [id];
	ids.forEach((cardId?: any, i?: any) => {
		Store.patch(cardId, {
			tags: [...this.editTags],
			tagsEdited: true,
			...(i === 0 ? { note } : {}),
		});
		this.refreshCard(cardId);
	});
	this.bulkEditIds = null;
	this.closeModal();
	this.toast(
		Store.state.storageAvailable
			? window.__QG_LOCAL__
				? copy("web.app.5fa0ce52b47e")
				: copy("web.cloudentry.1bd91a7d0c53")
			: copy("web.app.ea63f4be5073"),
	);
}

export const cardsActions = {
	bookmark: bookmark,
	later: later,
	task: task,
	edit: edit,
	"less-like": lessLike,
	"never-show": neverShow,
	"toggle-read": toggleRead,
	archive: archive,
	"restore-card": restoreCard,
	"archive-all": archiveAll,
	"editor-tag": editorTag,
	"add-tag": addTag,
	"save-note": saveNote,
} satisfies Record<string, ActionHandler>;
