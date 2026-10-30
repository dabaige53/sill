import { icon } from "../atoms/icons.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { deferReadingRefresh } from "../interactions/reading-feedback.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";
import { refreshCompletion, updateCompletionState } from "./card-state-feedback.ts";

export const appFeedUpdatesMethods = {
	withFeedAnchor(this: AppController, change?: () => void, animate = false) {
		const nodes = [...this.grid.querySelectorAll<HTMLElement>("[data-card]")];
		const surfaces = [...this.grid.querySelectorAll<HTMLElement>(":scope > .feed-item")];
		const key = (n: HTMLElement) =>
			n.dataset.card || n.dataset.stack || n.dataset.stackOpen || "shelf";
		const positions = animate
			? new Map<string, { node: HTMLElement; rect: DOMRect }>(
					surfaces.map((n: HTMLElement) => [
						key(n),
						{ node: n.cloneNode(true) as HTMLElement, rect: n.getBoundingClientRect() },
					]),
				)
			: null;
		const anchors = nodes
			.filter((n?: HTMLElement) => n.getBoundingClientRect().bottom > 0)
			.map((n?: HTMLElement) => ({ id: n.dataset.card, top: n.getBoundingClientRect().top }));
		const oldY = scrollY,
			focus = document.activeElement as HTMLElement;
		const focusCard = (focus?.closest<HTMLElement>("[data-card]") as HTMLElement)?.dataset.card,
			focusAction = (focus as HTMLElement)?.dataset.action,
			focusExtra = (focus as HTMLElement)?.dataset.extra,
			focusId = (focus as HTMLElement)?.dataset.id;
		change();
		this.renderCurrent(false);
		if (oldY > 0) {
			const anchor = anchors.find((a) =>
				this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(a.id)}"]`),
			);
			if (anchor) {
				const node = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(anchor.id)}"]`);
				const targetY = scrollY + node.getBoundingClientRect().top - anchor.top;
				const scroller = document.scrollingElement;
				// Masonry can move this card further than the whole feed grows. Near the bottom,
				// reserve the missing scroll range before restoring it so the reading point stays.
				const missing = Math.ceil(targetY + scroller.clientHeight - scroller.scrollHeight);
				if (missing > 0)
					this.grid.style.minHeight =
						Math.ceil(this.grid.getBoundingClientRect().height + missing) + "px";
				window.scrollTo({ top: targetY, behavior: "instant" });
			}
		}
		if (focusCard && !this.dialog.open) {
			const card = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(focusCard)}"]`);
			const target =
				card &&
				[...card.querySelectorAll<HTMLElement>("[data-action]")].find(
					(n?: HTMLElement) =>
						n.dataset.action === focusAction &&
						n.dataset.extra === focusExtra &&
						n.dataset.id === focusId,
				);
			card?.focus({ preventScroll: true });
			(
				target ||
				card?.querySelector<HTMLElement>(".card-title-button") ||
				card ||
				document.getElementById("account")
			).focus({ preventScroll: true });
		}
		if (positions) {
			this.grid
				.querySelectorAll<HTMLElement>(":scope > .feed-item")
				.forEach((node: HTMLElement) => {
					MotionEngine.cancelExit(key(node));
					const previous = positions.get(key(node));
					const rect = node.getBoundingClientRect();
					if (rect.bottom > 0 && rect.top < innerHeight) {
						if (previous) {
							MotionEngine.flip(node, previous.rect);
							if (previous.node.textContent !== node.textContent)
								MotionEngine.fade(node.querySelector(".card-body") || node);
						} else MotionEngine.drop(node, this.sheetLeaving ? MotionEngine.time("fast") : 0);
					}
					positions.delete(key(node));
				});
			for (const [id, { node, rect }] of positions) MotionEngine.retire(node, rect, id);
		}
	},
	showNew(this: AppController, quiet = false) {
		if (this.dialog.open || this.drag.active) return;
		this.checkReminders();
		if (!this.pendingCards.length && !this.pendingReminders.length) return;
		const reminderCount = this.pendingReminders.length;
		let count = 0;
		window.scrollTo({ top: 0, behavior: "instant" });
		this.withFeedAnchor(() => {
			// Cloud arrivals are already stored and only waited behind the pill.
			count = new Set(this.pendingCards.map((c) => c.id)).size;
			Store.insert(this.pendingCards);
			this.pendingCards = [];
			for (const id of this.pendingReminders) {
				const c = Store.card(id);
				Store.patch(id, {
					snoozedUntil: 0,
					lastReminderKey: FeedPolicy.key(c),
					lastNotifiedAt: Date.now(),
				});
			}
			this.pendingReminders = [];
			this.feedNow = Date.now();
			this.mode = "feed";
			this.baseMode = "feed";
			history.replaceState({ glass: true, prev: null }, "", "#feed");
		}, true);
		this.checkReminders();
		this.paintPending();
		if (!quiet)
			this.announce(
				`${copy("web.app.fa2c54768fda")}${count}${copy("web.app.f9c6ab19b7d4")}${reminderCount}${copy("web.app.904aa82438d8")}`,
			);
	},
	changeReminder(this: AppController, id?: string, action?: string) {
		const c = Store.card(id);
		if (!c || !FeedPolicy.supports(c)) return;
		const now = Date.now();
		const patch =
			action === "snooze"
				? { snoozedUntil: now + 600000, dismissed: false, reminderDone: false }
				: action === "dismiss-reminder"
					? { dismissed: true, snoozedUntil: 0 }
					: action === "complete-reminder"
						? { reminderDone: true, snoozedUntil: 0 }
						: {
								snoozedUntil: 0,
								dismissed: false,
								reminderDone: false,
								lastReminderKey: FeedPolicy.key(c),
								lastNotifiedAt: now,
							};
		Store.patch(id, patch);
		this.selected.delete(id);
		const keepPreview =
			this.dialog.open &&
			this.modalKind === "preview" &&
			this.currentId === id &&
			c.type === "reminder" &&
			["complete-reminder", "restore-reminder"].includes(action);
		const closedPreview = this.dialog.open && !keepPreview;
		if (closedPreview) this.closeToDesk(false);
		if (keepPreview) deferReadingRefresh(this, id);
		else if (["complete-reminder", "restore-reminder"].includes(action))
			refreshCompletion(this, id);
		else this.refreshCard(id);
		this.checkReminders();
		if (keepPreview) {
			updateCompletionState(this.dialog, id);
			return;
		}
		if (!closedPreview && ["complete-reminder", "restore-reminder"].includes(action)) return;
		const card = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
		(
			card?.querySelector<HTMLElement>(".card-title-button") ||
			this.grid.querySelector<HTMLElement>(".card-title-button") ||
			document.getElementById("account")
		).focus({ preventScroll: true });
	},
	applySelectionAction(this: AppController, ids?: string[], target?: string) {
		if (!ids?.length || !["tag", "bookmark", "later"].includes(target)) return;
		if (target === "tag") {
			this.bulkEditIds = ids;
			this.openPanel("editor", ids[0]);
			return;
		}
		const key = target === "bookmark" ? "bookmarked" : "later";
		const value = !ids.every((id) => Store.item(id)[key]);
		ids.forEach((id?: string) => {
			Store.patch(id, { [key]: value });
			this.refreshCard(id);
		});
	},
};
