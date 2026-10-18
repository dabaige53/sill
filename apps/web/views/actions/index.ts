import { copy } from "../../copy.ts";
import { Store } from "../../data/store.ts";
import { MotionEngine } from "../../interactions/motion.ts";
import { Panels } from "../../interactions/panels.ts";
import { agentKey } from "../../services/agent-handoff.ts";
import { FeedPolicy } from "../../services/feed-policy.ts";
import { LocalSync } from "../../services/local-sync.ts";
import type { AppController } from "../app.ts";

export function action(
	this: AppController,
	name?: any,
	id: any = "",
	extra: any = "",
	el: any = null,
	event: any = null,
) {
	switch (name) {
		case "agent-handoff":
			void this.handoffCard(id);
			break;
		case "filter":
		case "search":
			this.openPanel("search");
			break;
		case "settings":
			this.settingsGroup = "desk";
			this.openPanel("settings");
			break;
		case "nav":
			this.goTo(extra);
			break;
		case "settings-group":
			this.settingsGroup = extra;
			this.repaintSettings();
			this.dialog
				.querySelector(`[data-action="settings-group"][data-extra="${extra}"]`)
				?.scrollIntoView({ block: "nearest", inline: "nearest" });
			break;
		case "capture":
			this.openPanel("capture");
			break;
		case "capture-save": {
			const text = (document.getElementById("capture-text") as HTMLInputElement)?.value;
			if (!text?.trim()) return;
			this.closeNative();
			this.capture(text);
			break;
		}
		case "refresh":
			this.gestures.refresh();
			break;
		case "retry":
			this.gestures.refresh();
			break;
		case "show-new":
			this.showNew();
			break;
		case "top":
			window.scrollTo({ top: 0, behavior: MotionEngine.reduced ? "instant" : "smooth" });
			break;
		case "home-tab": {
			const tab = this.homeTabFilter(extra);
			if (!tab) break;
			this.filter = { ...this.filter, ...tab, tag: "", query: "" };
			window.scrollTo({ top: 0, behavior: "instant" });
			this.renderCurrent(true);
			break;
		}
		case "card-open":
		case "preview":
			this.navigate("#card/" + id);
			break;
		case "reader":
			this.navigate("#read/" + id);
			break;
		case "close":
			this.closeModal();
			break;
		case "close-all":
			this.closeToDesk();
			break;
		case "bookmark":
			this.setFlag(id, "bookmarked", !Store.item(id).bookmarked);
			break;
		case "later":
			this.setFlag(id, "later", !Store.item(id).later);
			break;
		case "task":
			this.toggleTask(id, extra);
			break;
		case "edit":
			this.bulkEditIds = null;
			this.openPanel("editor", id);
			break;
		case "why":
			this.openPanel("why", id);
			break;
		case "less-like":
			this.closeNative();
			this.toast(copy("web.app.0ec82d74e53c"));
			break;
		case "never-show": {
			const before: Record<string, any> = { ...Store.item(id) };
			this.closeNative();
			Store.patch(id, { dismissed: true });
			this.withFeedAnchor(() => {}, true);
			this.toast(copy("web.app.c7fec996c47f"), () => {
				Store.patch(id, before);
				this.withFeedAnchor(() => {}, true);
			});
			break;
		}
		case "card-more":
			this.more(id);
			break;
		case "toggle-read": {
			const before: Record<string, any> = { ...Store.item(id) },
				read = !before.read;
			Store.patch(id, {
				read,
				seen: read,
				progress: read ? 1 : 0,
				readAt: read ? Date.now() : 0,
			});
			this.refreshCard(id);
			break;
		}
		case "select":
			this.select(id);
			break;
		case "select-all":
			this.selectionContext()
				.grid.querySelectorAll("[data-card]")
				.forEach((n?: any) => {
					this.selected.add(n.dataset.card);
				});
			this.updateSelection();
			break;
		case "clear-selection":
			this.selected.clear();
			this.updateSelection();
			break;
		case "selection-menu":
			this.drag.openMenu([...this.selected], el);
			break;
		case "selected-ai":
			this.openSelectionAI([...this.selected]);
			break;
		case "selected-bookmark":
			this.applySelectionAction([...this.selected], "bookmark");
			this.selected.clear();
			this.updateSelection();
			break;
		case "selected-later":
			this.applySelectionAction([...this.selected], "later");
			this.selected.clear();
			this.updateSelection();
			break;
		case "selected-tag": {
			const ids = [...this.selected];
			this.selected.clear();
			this.updateSelection();
			this.applySelectionAction(ids, "tag");
			break;
		}
		case "stack-open":
			this.openStacks.add(extra);
			this.withFeedAnchor(() => {}, true);
			this.grid
				.querySelector(`[data-stack-open="${CSS.escape(extra)}"] .card-title-button`)
				?.focus({ preventScroll: true });
			break;
		case "stack-close":
			this.openStacks.delete(extra);
			this.withFeedAnchor(() => {}, true);
			this.grid
				.querySelector(`[data-stack="${CSS.escape(extra)}"]`)
				?.focus({ preventScroll: true });
			break;
		case "archive":
			this.openPanel("archive", extra);
			break;
		case "restore-card": {
			const before: Record<string, any> = { ...Store.item(id) };
			Store.patch(id, { archived: false, restoredAt: Date.now() });
			this.dialog.innerHTML = Panels.archive(this, this.editId);
			this.withFeedAnchor(() => {});
			this.toast(copy("web.app.fff336942d9b"), () => {
				Store.patch(id, before);
				this.withFeedAnchor(() => {});
				if (this.modalKind === "archive") this.dialog.innerHTML = Panels.archive(this, this.editId);
			});
			break;
		}
		case "archive-all": {
			const ids = this.shelved("stale").map((c?: any) => c.id),
				before = ids.map((i?: any) => [i, { ...Store.item(i) }]);
			ids.forEach((i?: any) => {
				Store.patch(i, { archived: true });
			});
			this.closeNative();
			this.withFeedAnchor(() => {});
			this.toast(
				`${copy("web.app.d22d0186c603")}${ids.length}${copy("web.panels.e9e0fdc242b4")}`,
				() => {
					before.forEach(([i, v]: any) => {
						Store.patch(i, v);
					});
					this.withFeedAnchor(() => {});
				},
			);
			break;
		}
		case "filter-type":
			this.searchFilter.type = extra;
			this.repaintSearch();
			break;
		case "filter-status":
			this.searchFilter.status = this.searchFilter.status === extra ? "all" : extra;
			this.repaintSearch();
			break;
		case "filter-tag":
			this.searchFilter.tag = this.searchFilter.tag === extra ? "" : extra;
			this.repaintSearch();
			break;
		case "clear-query":
			this.searchFilter.query = "";
			this.repaintSearch();
			document.getElementById("filter-search")?.focus();
			break;
		case "clear-filter":
			if (this.modalKind === "search") {
				this.searchFilter = { type: "all", status: "all", tag: "", query: "" };
				this.repaintSearch();
			} else {
				this.filter = { type: "all", status: "all", tag: "", query: "" };
				this.renderCurrent(true);
			}
			break;
		case "apply-filter":
			this.closeNative();
			window.scrollTo(0, 0);
			break;
		case "sort-feed":
			if (FeedPolicy.sorts.includes(extra)) {
				Store.setPref("sort", extra);
				this.applyPreferences();
				this.feedNow = Date.now();
				this.renderCurrent(false);
			}
			break;
		case "editor-tag": {
			this.editTags.has(extra) ? this.editTags.delete(extra) : this.editTags.add(extra);
			const note = (document.getElementById("note-editor") as HTMLInputElement)?.value;
			this.dialog.innerHTML = Panels.editor(this, this.editId);
			if (note !== undefined)
				(document.getElementById("note-editor") as HTMLInputElement).value = note;
			document.getElementById("tag-new")?.focus();
			break;
		}
		case "add-tag": {
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
			break;
		}
		case "save-note": {
			const pending = (document.getElementById("tag-new") as HTMLInputElement)?.value.trim();
			if (pending) this.editTags.add(pending.replace(/^#/, "").slice(0, 30));
			const note = (document.getElementById("note-editor") as HTMLInputElement).value.slice(
				0,
				4000,
			);
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
			break;
		}
		case "pref": {
			const before = this.setPref(id, extra);
			if (before !== extra && ["archiveAfter", "theme", "density"].includes(id))
				this.announce(copy("web.app.434203a723b4"));
			break;
		}
		case "pref-toggle":
			this.setPref(id, !Store.pref(id));
			break;
		case "action-toggle": {
			const hidden = new Set<string>(Store.pref("hiddenActions") || []);
			if (!hidden.delete(id)) hidden.add(id);
			this.setPref("hiddenActions", [...hidden]);
			break;
		}
		case "toggle-transparency":
			this.setPref("reduceTransparency", !Store.pref("reduceTransparency"));
			break;
		case "export-all":
			this.exportAll();
			break;
		case "clear-all": {
			const back =
				this.modalKind === "settings"
					? () => this.swapPanel(Panels.settings(this, "data"), "settings", "panel wide")
					: null;
			this.panelReturn = back;
			this.swapPanel(
				Panels.confirm(
					copy("web.app.7f1a78cdb3f2"),
					copy("web.app.d008fc7f75ba"),
					`<button type="button" class="soft-button" data-action="close">${copy("web.cancel")}</button><button type="button" class="solid-button" style="background:var(--alert)" data-action="clear-confirm">${copy("web.app.bce2377283c2")}</button>`,
				),
				"confirm",
				"panel narrow",
			);
			break;
		}
		case "clear-confirm":
			Store.state.cards = [];
			Store.state.items = {};
			Store.state.freshIds = [];
			Store.state.preferences.onboarded = false;
			Store.save();
			this.panelReturn = null;
			this.closeNative();
			this.pendingCards = [];
			this.renderCurrent(true);
			break;
		case "welcome-demo":
			this.loadDemo();
			break;
		case "join": {
			const c = Store.card(id);
			if (c?.meeting?.url) void this.openExternal(c, c.meeting.url);
			break;
		}
		case "photo-step":
		case "photo-go": {
			const c = Store.card(id),
				n = (c.photos || [c.image]).length;
			this.photoIndex =
				name === "photo-go" ? Number(extra) : (this.photoIndex + Number(extra) + n) % n;
			// Photo navigation replaces the content; retain the shared recovery notice and its state.
			const toast = this.dialog.querySelector("#toast");
			if (toast) document.body.appendChild(toast);
			this.dialog.innerHTML = Panels.lightbox(c, this.photoIndex, this);
			if (toast) this.dialog.appendChild(toast);
			break;
		}
		case "sync-retry":
			this.refresh();
			break;
		case "sync-export":
			this.exportAll();
			break;
		case "sync-discard":
			this.openModal(
				Panels.confirm(
					copy("web.app.ecb323046b6a"),
					copy("web.app.cd47b1d68c71"),
					`<button type="button" class="soft-button" data-action="close">${copy("web.cancel")}</button><button type="button" class="solid-button" data-action="sync-discard-confirm">${copy("web.app.c3520240ae08")}</button>`,
				),
				"confirm",
				null,
				"panel narrow",
			);
			break;
		case "sync-discard-confirm":
			LocalSync.discard()
				.then(() => this.closeNative())
				.catch((error?: any) => this.alert(error.message));
			break;
		case "toast-close":
			this.hideToast();
			break;
		case "undo":
			if (this.undoAction) {
				const fn = this.undoAction;
				this.undoAction = null;
				this.hideToast();
				fn();
			}
			break;
		case "external": {
			const card = Store.card(id);
			let scope: string;
			try {
				scope = agentKey(id, this.agentScope());
			} catch {
				this.alert(copy("web.agent.disconnected"));
				break;
			}
			void this.openExternal(card).then((opened) => {
				let current = false;
				try {
					current = scope === agentKey(id, this.agentScope());
				} catch {}
				if (opened && current && Store.card(id)?.type === "mail" && !Store.item(id).read) {
					Store.patch(id, { read: true });
					this.refreshCard(id);
				}
			});
			break;
		}
		case "download-calendar": {
			const c = Store.card(id),
				date = (x?: any) =>
					new Date(x)
						.toISOString()
						.replace(/[-:]/g, "")
						.replace(/\.\d{3}/, "");
			this.download(
				"sill.ics",
				`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sill//Local//ZH
BEGIN:VEVENT
UID:${c.id}@sill.local
DTSTAMP:${date(Date.now())}
DTSTART:${date(c.start)}
DTEND:${date(c.end)}
SUMMARY:${c.title}
${
	c.location
		? `LOCATION:${c.location}
`
		: ""
}END:VEVENT
END:VCALENDAR
`,
				"text/calendar",
			);
			break;
		}
		case "snooze":
		case "dismiss-reminder":
		case "complete-reminder":
		case "restore-reminder":
			this.changeReminder(id, name);
			break;
		case "media-play":
			this.playMedia();
			break;
		case "media-next": {
			const c = Store.card(this.currentId);
			this.pauseMedia();
			this.mediaIndex = Math.min((c.body.length || 1) - 1, this.mediaIndex + 1);
			this.paintMedia();
			break;
		}
		case "media-prev":
			this.pauseMedia();
			this.mediaIndex = Math.max(0, this.mediaIndex - 1);
			this.paintMedia();
			break;
		case "podcast-play":
			this.podcast(id);
			break;
		case "podcast-seek":
			this.podcast(id, Number(extra));
			break;
	}
}
