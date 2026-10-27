import type { Card } from "../../../contracts/card.ts";
import { icon } from "../atoms/icons.ts";
import { CardPresentation } from "../cards/presentation.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { deferReadingRefresh } from "../interactions/reading-feedback.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { systemReminders } from "../services/system-reminders.ts";
import type { AppController } from "./app.ts";
import type { CardFlag } from "./app-types.ts";
import { refreshCompletion, updateCompletionState } from "./card-state-feedback.ts";

export const appCardActionsMethods = {
	setFlag(this: AppController, id?: string, key?: CardFlag, value?: boolean) {
		Store.patch(id, { [key]: value });
		if (
			this.dialog.open &&
			this.currentId === id &&
			["preview", "reader", "lightbox"].includes(this.modalKind)
		)
			deferReadingRefresh(this, id);
		else this.refreshCard(id);
		this.syncPreviewButtons(id);
	},
	syncPreviewButtons(this: AppController, id?: string) {
		const s = Store.item(id);
		this.dialog
			.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"][data-action="bookmark"]`)
			.forEach((n?: HTMLElement) => {
				n.classList.toggle("active", s.bookmarked);
				n.setAttribute("aria-pressed", String(!!s.bookmarked));
				n.setAttribute(
					"aria-label",
					s.bookmarked ? copy("web.preview.removeBookmark") : copy("web.bookmark"),
				);
			});
		this.dialog
			.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"][data-action="later"]`)
			.forEach((n?: HTMLElement) => {
				n.classList.toggle("active", s.later);
				n.setAttribute("aria-label", s.later ? copy("web.preview.removeLater") : copy("web.later"));
			});
	},
	toggleTask(this: AppController, id?: string, taskId?: string) {
		const c = Store.card(id),
			before = Store.tasks(c)
				.filter((t) => t.done)
				.map((t) => t.id);
		const after = before.includes(taskId)
			? before.filter((t) => t !== taskId)
			: [...before, taskId];
		Store.patch(id, { taskDone: after });
		this.checkReminders();
		if (
			this.dialog.open &&
			this.currentId === id &&
			["preview", "reader", "lightbox"].includes(this.modalKind)
		) {
			updateCompletionState(this.dialog, id);
			deferReadingRefresh(this, id);
		} else refreshCompletion(this, id);
	},
	setOffline(this: AppController, on?: boolean) {
		const n = document.getElementById("offline");
		MotionEngine.visibility(n, !!on);
		n.classList.remove("is-retrying");
	},
	checkReminders(this: AppController, now = Date.now()) {
		try {
			const scope = this.agentScope();
			systemReminders.bind({
				owner: scope.kind === "cloud" ? scope.owner : "local",
				open: (id) => {
					if (Store.card(id)) this.openCard(id, true);
				},
			});
			systemReminders.check(Store.state.cards, Store.state.items, now);
		} catch {
			systemReminders.bind(null);
		}
		const next = Store.state.cards
			.filter((c?: Card) => FeedPolicy.eligible(c, Store.item(c.id), now))
			.map((c?: Card) => c.id);
		const added = next.some((id?: string) => !this.pendingReminders.includes(id));
		this.pendingReminders = next;
		this.paintPending();
		if (added)
			this.announce(`${copy("web.app.a6815db95ff5")}${next.length}${copy("web.app.46f0aa3f3a96")}`);
	},
	paintPending(this: AppController) {
		const count = this.pendingCards.length + this.pendingReminders.length,
			n = document.getElementById("new-count");
		const hide = !count || (Store.pref("newHint") === "off" && !this.pendingReminders.length);
		const signature = `${count}|${this.pendingReminders.length}|${hide}`;
		if (n.dataset.pending === signature) return;
		n.dataset.pending = signature;
		MotionEngine.visibility(n, !hide);
		const kinds = [
			...(this.pendingReminders.length ? [icon("bell", 12)] : []),
			...this.pendingCards.map((c?: Card) => CardPresentation.sourceIcon(c, 12)),
		];
		const sources = [...new Set(kinds)].slice(0, 3);
		n.innerHTML = `${sources.length ? `<span class="new-sources" aria-hidden="true">${sources.map((k) => `<span>${k}</span>`).join("")}</span>` : ""}${icon("up", 14)}<span class="num">${count}</span>${copy("web.newContent")}`;
		n.setAttribute(
			"aria-label",
			`${copy("web.app.9ae8f7e3040d")}${this.pendingCards.length}${copy("web.app.5b2f6ba24e42")}${this.pendingReminders.length}${copy("web.app.099a1047b74a")}`,
		);
	},
};
