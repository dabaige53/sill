import type { Card } from "../../../contracts/card.ts";
import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { CardPresentation } from "../cards/presentation.ts";
import { copy } from "../copy.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { FeedPolicy } from "../services/feed-policy.ts";
import { systemReminders } from "../services/system-reminders.ts";
import type { AppController } from "./app.ts";
import type { CardFlag } from "./app-types.ts";

/** The card's context menu items; shared by the app and the design-system previews. */
export function cardMenuHTML(card: Card, s: ReturnType<typeof Store.item>, selected: boolean) {
	const id = card.id,
		items = [
			[
				"bookmark",
				s.bookmarked ? copy("web.preview.removeBookmark") : copy("web.bookmark"),
				"bookmark",
			],
			["glasses", s.later ? copy("web.app.1056291ba162") : copy("web.later"), "later"],
			["tag", copy("web.app.09fe39e89e28"), "edit"],
			...(CardTypes[card.type].readable
				? [
						[
							s.read ? "undo" : "circle",
							s.read ? copy("web.app.fe32886b3172") : copy("web.app.82f35d89b827"),
							"toggle-read",
						],
					]
				: []),
			[
				"check-circle",
				selected ? copy("web.app.74966e20df2e") : copy("web.app.c11330b85234"),
				"select",
			],
		];
	return items
		.map(
			([symbol, label, action]) =>
				`<button type="button" class="card-menu-item" data-action="${action}" data-id="${esc(id)}">${icon(symbol, 18)}<span>${label}</span></button>`,
		)
		.join("");
}

export const appCardActionsMethods = {
	setFlag(this: AppController, id?: string, key?: CardFlag, value?: boolean) {
		Store.patch(id, { [key]: value });
		this.refreshCard(id);
		this.syncPreviewButtons(id);
	},
	syncPreviewButtons(this: AppController, id?: string) {
		const s = Store.item(id);
		this.dialog
			.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"][data-action="bookmark"]`)
			.forEach((n?: HTMLElement) => {
				n.classList.toggle("active", s.bookmarked);
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
		this.refreshCard(id);
		if (this.dialog.open && this.currentId === id && this.modalKind === "preview")
			this.replacePanelContent(Panels.preview(this, c));
	},
	closeMore(this: AppController, restoreFocus = false) {
		const menu = document.querySelector<HTMLElement>(".card-more-menu");
		if (!menu) return;
		const card = menu.closest<HTMLElement>("[data-card]"),
			trigger = card?.querySelector<HTMLElement>(".card-title-button");
		if (restoreFocus) trigger?.focus({ preventScroll: true });
		const drawn = getComputedStyle(menu);
		const from = { opacity: drawn.opacity, transform: drawn.transform };
		MotionEngine.cancel(menu);
		// The menu leaves faster than it came, toward its anchor.
		menu.classList.replace("card-more-menu", "card-more-leaving");
		menu.removeAttribute("id");
		menu.inert = true;
		const out = MotionEngine.keyboard
			? null
			: MotionEngine.animate(
					menu,
					[from, { opacity: 0, transform: "translateY(-4px) scale(.95)" }],
					{
						duration: MotionEngine.time("fast"),
						easing: MotionEngine.curve(),
					},
				);
		if (out)
			out.finished.then(
				() => menu.remove(),
				() => menu.remove(),
			);
		else menu.remove();
		card?.classList.remove("tools-open");
		trigger?.setAttribute("aria-expanded", "false");
		trigger?.removeAttribute("aria-controls");
	},
	more(this: AppController, id?: string) {
		const c = (this.modalKind === "search" ? this.dialog : this.grid).querySelector<HTMLElement>(
				`[data-card="${CSS.escape(id)}"]`,
			),
			card = Store.card(id);
		if (!c || !card) return;
		if (c.querySelector<HTMLElement>(".card-more-menu")) {
			this.closeMore(true);
			return;
		}
		this.closeMore();
		MotionEngine.cancel(c);
		c.classList.add("tools-open");
		const menu = document.createElement("div");
		menu.className = "card-more-menu";
		menu.setAttribute("role", "group");
		menu.setAttribute("aria-label", copy("web.templates.ee9430845e26"));
		menu.id = "card-menu-" + id;
		menu.innerHTML = cardMenuHTML(card, Store.item(id), this.selected.has(id));
		c.appendChild(menu);
		// One place on every screen: under the card's top-right corner. Near the bottom it slides up only
		// as far as it must to stay clear of the capsule.
		const box = c.getBoundingClientRect(),
			floor =
				Math.min(
					innerHeight,
					...[...(document.getElementById("dock")?.children || [])]
						.map((n) => n.getBoundingClientRect())
						.filter((r) => r.height)
						.map((r) => r.top),
				) - 12,
			top = Math.min(48, floor - box.top - menu.offsetHeight);
		if (top < 48) menu.style.top = `${Math.max(8 - box.top, top)}px`;
		const trigger = c.querySelector<HTMLElement>(".card-title-button");
		trigger?.setAttribute("aria-expanded", "true");
		trigger?.setAttribute("aria-controls", menu.id);
		if (!MotionEngine.keyboard)
			MotionEngine.animate(
				menu,
				[
					{ opacity: 0, transform: "translateY(-4px) scale(.95)" },
					{ opacity: 1, transform: "none" },
				],
				{ duration: 180 },
			);
		menu.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
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
