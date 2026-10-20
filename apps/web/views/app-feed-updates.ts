import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";

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
			count = Store.insert(this.pendingCards);
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
		this.paintPending();
		if (!quiet)
			this.announce(
				`${copy("web.app.fa2c54768fda")}${count}${copy("web.app.f9c6ab19b7d4")}${reminderCount}${copy("web.app.904aa82438d8")}`,
			);
	},
	changeReminder(this: AppController, id?: string, action?: string) {
		const c = Store.card(id);
		if (!c || !FeedPolicy.supports(c)) return;
		const item = Store.item(id),
			keys = ["snoozedUntil", "dismissed", "reminderDone", "lastReminderKey", "lastNotifiedAt"];
		const before = Object.fromEntries(keys.map((k) => [k, item[k]]));
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
		// End the active preview before refreshing its source card state.
		if (this.dialog.open) this.closeToDesk(false);
		this.refreshCard(id);
		this.checkReminders();
		const card = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
		(
			card?.querySelector<HTMLElement>(".card-title-button") ||
			this.grid.querySelector<HTMLElement>(".card-title-button") ||
			document.getElementById("account")
		).focus({ preventScroll: true });
		const text =
			action === "snooze"
				? copy("web.app.8b61908123ce")
				: action === "dismiss-reminder"
					? copy("web.app.c9bb70bcaaa3")
					: action === "complete-reminder"
						? copy("web.app.4203e358dee2")
						: copy("web.app.480719186cc8");
		this.toast(text, () => {
			Store.patch(id, before);
			this.refreshCard(id);
			this.checkReminders();
			const back = this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
			(
				back?.querySelector<HTMLElement>(".card-title-button") ||
				back ||
				document.getElementById("account")
			).focus({
				preventScroll: true,
			});
		});
	},
	applySelectionAction(this: AppController, ids?: string[], target?: string) {
		if (!ids?.length || !["tag", "bookmark", "later"].includes(target)) return;
		if (target === "tag") {
			this.bulkEditIds = ids;
			this.openPanel("editor", ids[0]);
			return;
		}
		const key = target === "bookmark" ? "bookmarked" : "later",
			old = ids.map((id?: string): [string, boolean] => [id, Store.item(id)[key]]);
		ids.forEach((id?: string) => {
			Store.patch(id, { [key]: true });
			this.refreshCard(id);
		});
		this.toast(
			target === "bookmark"
				? `${copy("web.app.96e7ee93f3ba")}${ids.length}${copy("web.common.cardCountSuffix")}`
				: `${ids.length}${copy("web.app.34d0636b70c8")}`,
			() =>
				old.forEach(([id, v]) => {
					Store.patch(id, { [key]: v });
					this.refreshCard(id);
				}),
		);
	},
	paintMedia(this: AppController) {
		const c = Store.card(this.currentId),
			el = document.getElementById("media-slide");
		if (!el || !c) return;
		const labels = [
				copy("web.app.a8c81f93f2e0"),
				copy("web.app.18b083a026ba"),
				copy("web.app.8d017e1c9a30"),
				copy("web.app.3a71561035b2"),
			],
			total = c.body.length || 1;
		const title = labels[this.mediaIndex] || copy("web.app.c8e19ce87856") + (this.mediaIndex + 1),
			body = c.body[this.mediaIndex] || "";
		document.getElementById("media-step").textContent = `${this.mediaIndex + 1} / ${total}`;
		const current = el.querySelector<HTMLElement>(".media-slide-copy:not(.is-leaving)");
		if (
			current?.querySelector("b")?.textContent === title &&
			current.querySelector("span")?.textContent === body
		)
			return;
		const previous = [...el.querySelectorAll<HTMLElement>(".media-slide-copy")];
		const next = document.createElement("div");
		next.className = "media-slide-copy";
		next.innerHTML = `<b>${esc(title)}</b><span>${esc(body)}</span>`;
		for (const layer of previous) {
			const opacity = getComputedStyle(layer).opacity || "1";
			MotionEngine.cancel(layer);
			layer.classList.add("is-leaving");
			layer.setAttribute("aria-hidden", "true");
			const out = MotionEngine.animate(layer, [{ opacity }, { opacity: 0 }], {
				duration: MotionEngine.time("fast"),
			});
			if (out)
				out.finished.then(
					() => layer.remove(),
					() => {},
				);
			else layer.remove();
		}
		el.append(next);
		if (previous.length) MotionEngine.fade(next);
	},
	pauseMedia(this: AppController) {
		clearInterval(this.mediaTimer);
		this.mediaTimer = null;
		const b = this.dialog?.querySelector<HTMLElement>('[data-action="media-play"]');
		if (b) {
			b.innerHTML = icon("play");
			b.setAttribute("aria-label", copy("web.preview.media.playDemo"));
		}
		const p = this.dialog?.querySelector<HTMLElement>('[data-action="podcast-play"]');
		if (p) {
			p.innerHTML = icon("play", 22);
			p.setAttribute("aria-label", copy("web.preview.play"));
		}
	},
	playMedia(this: AppController) {
		if (this.mediaTimer) {
			this.pauseMedia();
			return;
		}
		const c = Store.card(this.currentId),
			last = (c.body.length || 1) - 1;
		if (this.mediaIndex === last) this.mediaIndex = 0;
		this.paintMedia();
		const b = this.dialog.querySelector<HTMLElement>('[data-action="media-play"]');
		b.innerHTML = icon("pause");
		b.setAttribute("aria-label", copy("web.app.8c3c5d2fa170"));
		this.mediaTimer = setInterval(() => {
			if (document.hidden) return;
			if (this.mediaIndex < last) {
				this.mediaIndex++;
				this.paintMedia();
				Store.patch(this.currentId, {
					progress: (this.mediaIndex + 1) / (last + 1),
					read: this.mediaIndex === last,
				});
				this.refreshCard(this.currentId);
			} else this.pauseMedia();
		}, 2500);
	},
	podcast(this: AppController, id?: string, _seek = 0) {
		if (!Store.card(id)) return;
		this.toast(copy("web.media.playbackUnavailable"));
	},
};
