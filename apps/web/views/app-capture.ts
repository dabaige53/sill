import type { ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { icon } from "../atoms/icons.ts";
import { markdownText } from "../atoms/markdown.ts";
import { esc, eventEnded, eventRelative, eventTimely, minutes } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { demoBase, SeedCards, SeedItems } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";
import { renderContent } from "./react-renderer.ts";
import { repaintSettings, setPref } from "./settings-controller.ts";

export const appCaptureMethods = {
	startInlineEdit(this: AppController, id?: string) {
		this.finishInlineEdit();
		const node = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`),
			c = Store.card(id);
		if (!node || !c) return;
		this.editingId = id;
		Store.patch(id, { seen: true, read: true });
		node.classList.add("is-editing");
		node.querySelector<HTMLElement>(".card-body").outerHTML =
			`<div class="inline-editor"><span class="card-head">${icon("note", 16)}<span class="card-src">${copy("web.app.5d7845b38bf2")}${esc(copy("web.cards.de6785d99e02"))}</span></span><input id="inline-title" aria-label="${copy("web.title")}" value="${esc(c.title)}" maxlength="200"><textarea id="inline-body" aria-label="${copy("web.app.7a688306423b")}" maxlength="4000">${esc(c.body || c.summary || "")}</textarea><small id="inline-state">${copy("web.app.f2db3712a685")}</small></div>`;
		this.layout.schedule(false);
		const area = node.querySelector<HTMLTextAreaElement>("#inline-body");
		area.focus();
		area.setSelectionRange(area.value.length, area.value.length);
	},
	saveInlineEdit(this: AppController) {
		const id = this.editingId,
			c = Store.card(id);
		if (!c) return;
		const title =
				(document.getElementById("inline-title") as HTMLInputElement)?.value.trim() || c.title,
			text = (document.getElementById("inline-body") as HTMLInputElement)?.value || "";
		const body = text.trim();
		Object.assign(c, {
			title: title.slice(0, 200),
			body: body || title,
			summary: markdownText(body).replace(/\s+/g, " ").slice(0, 300),
		});
		Store.save();
		const state = document.getElementById("inline-state");
		if (state)
			state.textContent = window.__QG_LOCAL__
				? copy("web.app.5fa0ce52b47e")
				: copy("web.cloudentry.1bd91a7d0c53");
	},
	finishInlineEdit(this: AppController) {
		if (!this.editingId) return;
		const id = this.editingId;
		this.saveInlineEdit();
		this.editingId = "";
		const node = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
		node?.classList.remove("is-editing");
		this.refreshCard(id);
		this.layout.schedule(false);
	},
	loadDemo(this: AppController) {
		Store.state.preferences.onboarded = true;
		const demo = SeedCards.map((c?: Card) => ({
			...c,
			tasks: c.tasks?.map((t) => ({ ...t })),
			time: c.time,
			...(c.start
				? { start: Date.now() + (c.start - demoBase), end: Date.now() + (c.end - demoBase) }
				: {}),
			...(c.due ? { due: Date.now() + (c.due - demoBase) } : {}),
		}));
		this.closeNative();
		this.withFeedAnchor(() => {
			Store.insert(demo);
			for (const [id, x] of Object.entries(SeedItems)) Store.patch(id, x);
		}, true);
	},
	setPref(this: AppController, key?: string, value?: unknown): unknown {
		return setPref.call(this, key, value);
	},
	replacePanelContent(this: AppController, html?: ReactNode) {
		const oldSurface = MotionEngine.surface(this.dialog);
		const oldBody = oldSurface.querySelector(".preview-body")?.innerHTML;
		const active = document.activeElement as HTMLElement;
		const key = (n?: HTMLElement) =>
			[n.id, n.dataset.action, n.dataset.id, n.dataset.extra].join("|");
		const focused = this.dialog.contains(active) ? key(active) : null;
		const selectors = [".sheet-scroll", ".settings-main", ".settings-nav", ".sheet"];
		const positions = selectors.map((selector) => {
			const node = this.dialog.querySelector<HTMLElement>(selector);
			return { selector, x: node?.scrollLeft || 0, y: node?.scrollTop || 0 };
		});
		const full = this.dialog
			.querySelector<HTMLElement>(".preview-sheet")
			?.classList.contains("is-full");
		const toast = document.getElementById("toast");
		if (toast && this.dialog.contains(toast)) document.body.appendChild(toast);
		renderContent(this.dialog, html);
		if (full) this.dialog.querySelector<HTMLElement>(".preview-sheet")?.classList.add("is-full");
		if (focused) {
			const target = [
				...this.dialog.querySelectorAll<HTMLElement>("button,input,textarea,a,[tabindex]"),
			].find((n?: HTMLElement) => key(n) === focused);
			const focus = target || this.dialog.querySelector<HTMLElement>("#modal-title");
			if (focus) {
				if (!focus.matches("button,input,textarea,a,[tabindex]")) focus.tabIndex = -1;
				focus.focus({ preventScroll: true });
			}
		}
		for (const { selector, x, y } of positions) {
			const node = this.dialog.querySelector<HTMLElement>(selector);
			if (node) {
				node.scrollLeft = x;
				node.scrollTop = y;
			}
		}
		if (this.modalKind === "preview" || this.modalKind === "reader") this.bindSheetChrome();
		const surface = MotionEngine.surface(this.dialog);
		if (
			this.modalKind !== "lightbox" &&
			this.modalKind !== "settings" &&
			(oldBody === undefined || oldBody !== surface.querySelector(".preview-body")?.innerHTML)
		)
			MotionEngine.fade(surface);
	},
	repaintSettings(this: AppController): undefined {
		return repaintSettings.call(this);
	},
	exportAll(this: AppController) {
		const data: ReturnType<typeof Store.serialized> = {
			app: "Sill",
			exportedAt: new Date().toISOString(),
			...Store.serialized(),
		};
		this.download(
			`sill-${new Date().toISOString().slice(0, 10)}.json`,
			JSON.stringify(data, null, 2),
			"application/json",
		);
	},
	download(this: AppController, name?: string, text?: string, type: string = "text/plain") {
		const blob = new Blob([text], { type }),
			url = URL.createObjectURL(blob),
			a = document.createElement("a");
		a.href = url;
		a.download = name;
		a.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	},
	tick(this: AppController) {
		this.checkReminders();
		if (!document.hidden) {
			const minute = Math.floor(Date.now() / 60000);
			if (this.clockMinute !== minute) {
				this.clockMinute = minute;
				this.grid.querySelectorAll<HTMLElement>("[data-card]").forEach((node?: HTMLElement) => {
					const c = Store.card(node.dataset.card);
					if (!c) return;
					if (c.type === "event") {
						const label = node.querySelector<HTMLElement>(".event-relative");
						if (label) label.textContent = eventRelative(c);
						// The join button appears only once the meeting is near; an ended meeting fades.
						if (
							!!node.querySelector<HTMLElement>('[data-action="join"]') !==
								(eventTimely(c) && !!c.meeting) ||
							node.classList.contains("is-ended") !== eventEnded(c)
						)
							this.refreshCard(c.id);
					} else if (c.type === "reminder") {
						// The time itself is fixed; only crossing it turns the time amber.
						const when = FeedPolicy.reminderTime(c, Store.item(c.id), Date.now());
						const label = node.querySelector<HTMLElement>(".reminder-label");
						if (label && label.classList.contains("is-due") !== !!when?.due) this.refreshCard(c.id);
					}
				});
			}
		}
		if (
			this.modalKind === "reader" &&
			this.dialog.open &&
			!document.hidden &&
			Date.now() - this.lastActivity < 60000
		) {
			Store.state.seconds++;
			document.querySelectorAll<HTMLElement>("[data-live-time]").forEach((n?: HTMLElement) => {
				n.textContent = minutes(Store.state.seconds);
			});
			if (Store.state.seconds % 5 === 0) Store.save();
		}
	},
};
