import { copy } from "../../copy.ts";
import { Store } from "../../data/store.ts";
import { Panels } from "../../interactions/panels.ts";
import type { AppController } from "../app.ts";
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

function why(this: AppController, { id }: ActionContext) {
	this.openPanel("why", id);
}

function lessLike(this: AppController) {
	this.closeNative();
	this.toast(copy("web.app.0ec82d74e53c"));
}

function neverShow(this: AppController, { id }: ActionContext) {
	const before: Record<string, any> = { ...Store.item(id) };
	this.closeNative();
	Store.patch(id, { dismissed: true });
	this.withFeedAnchor(() => {}, true);
	this.toast(copy("web.app.c7fec996c47f"), () => {
		Store.patch(id, before);
		this.withFeedAnchor(() => {}, true);
	});
}

function cardMore(this: AppController, { id }: ActionContext) {
	this.more(id);
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
	const before: Record<string, any> = { ...Store.item(id) };
	Store.patch(id, { archived: false, restoredAt: Date.now() });
	this.dialog.innerHTML = Panels.archive(this, this.editId);
	this.withFeedAnchor(() => {});
	this.toast(copy("web.app.fff336942d9b"), () => {
		Store.patch(id, before);
		this.withFeedAnchor(() => {});
		if (this.modalKind === "archive") this.dialog.innerHTML = Panels.archive(this, this.editId);
	});
}

function archiveAll(this: AppController) {
	const ids = this.shelved("stale").map((c?: any) => c.id),
		before = ids.map((i?: any) => [i, { ...Store.item(i) }]);
	ids.forEach((i?: any) => {
		Store.patch(i, { archived: true });
	});
	this.closeNative();
	this.withFeedAnchor(() => {});
	this.toast(
		`${copy("web.app.d22d0186c603")}${ids.length}${copy("web.common.cardCountSuffix")}`,
		() => {
			before.forEach(([i, v]: any) => {
				Store.patch(i, v);
			});
			this.withFeedAnchor(() => {});
		},
	);
}

function editorTag(this: AppController, { extra }: ActionContext) {
	this.editTags.has(extra) ? this.editTags.delete(extra) : this.editTags.add(extra);
	const note = (document.getElementById("note-editor") as HTMLInputElement)?.value;
	this.dialog.innerHTML = Panels.editor(this, this.editId);
	if (note !== undefined) (document.getElementById("note-editor") as HTMLInputElement).value = note;
	document.getElementById("tag-new")?.focus();
}

function addTag(this: AppController) {
	const field = document.getElementById("tag-new"),
		value = (field as HTMLInputElement).value.trim().replace(/^#/, "").slice(0, 30);
	if (!value) return;
	if (this.editTags.size >= 20) {
		this.alert(copy("web.app.1859bc867672"));
		return;
	}
	this.editTags.add(value);
	const note = (document.getElementById("note-editor") as HTMLInputElement)?.value;
	this.dialog.innerHTML = Panels.editor(this, this.editId);
	(document.getElementById("note-editor") as HTMLInputElement).value = note || "";
	document.getElementById("tag-new").focus();
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
	why: why,
	"less-like": lessLike,
	"never-show": neverShow,
	"card-more": cardMore,
	"toggle-read": toggleRead,
	archive: archive,
	"restore-card": restoreCard,
	"archive-all": archiveAll,
	"editor-tag": editorTag,
	"add-tag": addTag,
	"save-note": saveNote,
} satisfies Record<string, ActionHandler>;
