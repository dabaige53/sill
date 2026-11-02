import { copy } from "../../copy.ts";
import { Store } from "../../data/store.ts";
import { MotionEngine } from "../../interactions/motion.ts";
import { PanelViews as Panels } from "../../interactions/panels-components.tsx";
import {
	announceTags,
	captureTags,
	settleTags,
	shakeTag,
} from "../../interactions/tag-input-motion.ts";
import type { AppController } from "../app.ts";
import { repaintDetail } from "../preview-controller.ts";
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
	const scroll = this.editorLayer.querySelector(".tag-panel-fields").scrollTop;
	const input = this.editorLayer.querySelector<HTMLInputElement>("#tag-new");
	const draft = typed ? "" : input.value;
	const selection = [input.selectionStart, input.selectionEnd];
	renderView(this.editorLayer, Panels.editor(this, this.editId));
	if (note !== undefined) (document.getElementById("note-editor") as HTMLInputElement).value = note;
	this.editorLayer.querySelector(".tag-panel-fields").scrollTop = scroll;
	const next = this.editorLayer.querySelector<HTMLInputElement>("#tag-new");
	next.value = draft;
	settleTags(document.getElementById("editor-tags"), before, added, typed);
	if (!typed) next.setSelectionRange(selection[0], selection[1]);
}

/** A suggestion adds its tag; a chip's × removes it. Focus stays in the field. */
function editorTag(this: AppController, { extra }: ActionContext) {
	const removing = this.editTags.has(extra);
	const typing = this.desktop() || document.activeElement?.id === "tag-new";
	if (!removing && this.editTags.size >= MAX_TAGS) {
		this.alert(copy("web.app.1859bc867672"));
		return;
	}
	if (removing) this.editTags.delete(extra);
	else this.editTags.add(extra);
	paintTags.call(this, removing ? [] : [extra], false, removing ? extra : undefined);
	announceTags(`${copy(removing ? "web.editor.tagRemoved" : "web.editor.tagAdded")}${extra}`);
	// On a phone a chip tap leaves the keyboard as it was; only the tag field itself raises it.
	if (typing) document.getElementById("tag-new")?.focus({ preventScroll: true });
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

/**
 * Phone: the note row opens the note's own page over the sheet. The field takes focus inside
 * the tap, which is what lets the phone raise its keyboard.
 */
function noteOpen(this: AppController) {
	const sheet = this.editorLayer.querySelector<HTMLElement>(".tag-editor-sheet");
	const field = this.editorLayer.querySelector<HTMLTextAreaElement>("#note-editor");
	if (!sheet || !field) return;
	notePage(sheet, true);
	field.focus({ preventScroll: true });
	field.setSelectionRange(field.value.length, field.value.length);
}

/** Done keeps the note as typed and returns to the tags; Save writes both. */
function noteDone(this: AppController) {
	const sheet = this.editorLayer.querySelector<HTMLElement>(".tag-editor-sheet");
	const field = this.editorLayer.querySelector<HTMLTextAreaElement>("#note-editor");
	if (!sheet || !field) return;
	field.blur();
	this.editNote = field.value.slice(0, 4000);
	paintTags.call(this, [], false);
	notePage(sheet, false);
}

/** The page slides over from the side while the sheet grows to full height, and back. */
function notePage(sheet: HTMLElement, open: boolean) {
	const page = sheet.querySelector<HTMLElement>(".note-page");
	const from = sheet.offsetHeight;
	MotionEngine.cancel(sheet);
	MotionEngine.cancel(page);
	sheet.classList.toggle("note-open", open);
	sheet.classList.toggle("note-leaving", !open);
	const to = sheet.offsetHeight;
	const timing = {
		duration: MotionEngine.time("dur-sheet"),
		easing: MotionEngine.curve("ease-sheet"),
	};
	if (from !== to)
		MotionEngine.animate(sheet, [{ height: `${from}px` }, { height: `${to}px` }], timing);
	const slide = MotionEngine.animate(
		page,
		open
			? [{ transform: "translateX(100%)" }, { transform: "none" }]
			: [{ transform: "none" }, { transform: "translateX(100%)" }],
		timing,
	);
	const settle = () => {
		if (!sheet.classList.contains("note-open")) sheet.classList.remove("note-leaving");
	};
	if (open || !slide) settle();
	else slide.finished.then(settle, settle);
}

function saveNote(this: AppController, { id }: ActionContext) {
	const pending = (document.getElementById("tag-new") as HTMLInputElement)?.value.trim();
	if (pending) this.editTags.add(pending.replace(/^#/, "").slice(0, 30));
	const note = (
		(document.getElementById("note-editor") as HTMLInputElement)?.value ??
		this.editNote ??
		""
	).slice(0, 4000);
	const ids = this.bulkEditIds || [id];
	ids.forEach((cardId?: any, i?: any) => {
		Store.setTags(cardId, [...this.editTags]);
		if (i === 0) Store.patch(cardId, { note });
		this.refreshCard(cardId);
		repaintDetail(this, cardId);
	});
	this.closeEditor();
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
	"note-open": noteOpen,
	"note-done": noteDone,
} satisfies Record<string, ActionHandler>;
