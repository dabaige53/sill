import type { ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { icon } from "../atoms/icons.ts";
import { copy } from "../copy.ts";
import { cardSource } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";
import { feedView } from "./feed.tsx";
import { renderView } from "./react-renderer.ts";

export const appFeedMethods = {
	shelfOf(this: AppController, c?: Card): "desk" | "read" {
		return FeedPolicy.shelf(c, Store.item(c.id), this.feedNow, Store.pref("archiveAfter"));
	},
	shelved(this: AppController, which?: string) {
		return Store.state.cards.filter(
			(c?: Card) => this.shelfOf(c) === which && FeedPolicy.visible(c, Store.item(c.id)),
		);
	},
	matches(this: AppController, c?: Card, q?: string) {
		const s = Store.item(c.id);
		return [c.title, c.summary, cardSource(c), s.note, ...(c.body || []), ...Store.tags(c)]
			.join(" ")
			.toLocaleLowerCase()
			.includes(q.toLocaleLowerCase());
	},
	/** Text to match, without a trailing # condition that is still being typed. */
	searchText(this: AppController, q = "") {
		return q.replace(/(^|\s)#\S*$/, "").trim();
	},
	/** The # fragment at the end of the query, or null when none is being typed. */
	searchHash(this: AppController, q = "") {
		const m = q.match(/(?:^|\s)#(\S*)$/);
		return m ? m[1] : null;
	},
	searchAll(this: AppController, q?: string) {
		const f = this.searchFilter;
		q = this.searchText(q);
		if (!q?.trim() && f.type === "all" && f.status === "all" && !f.tag)
			return { desk: [], shelved: [] };
		const all = Store.state.cards.filter((c?: Card) => {
			const state = Store.item(c.id);
			return (
				(!q || this.matches(c, q)) &&
				(f.type === "all" || c.type === f.type) &&
				(!f.tag || Store.tags(c).includes(f.tag)) &&
				(f.status === "all" ||
					(f.status === "unread" && !state.read) ||
					(f.status === "saved" && state.bookmarked) ||
					(f.status === "later" && state.later))
			);
		});
		return {
			desk: all.filter((c?: Card) => this.shelfOf(c) === "desk"),
			shelved: all.filter((c?: Card) => this.shelfOf(c) !== "desk"),
		};
	},
	filtering(this: AppController) {
		const f = this.filter;
		return f.type !== "all" || f.status !== "all" || !!f.tag || !!f.query;
	},
	filtered(this: AppController): Card[] {
		const f = this.filter,
			q = f.query.trim();
		const statusOnly = ["snoozed", "dismissed", "done"].includes(f.status);
		return FeedPolicy.sort(
			Store.state.cards.filter((c?: Card) => {
				const s = Store.item(c.id);
				// Searching reaches every shelf; browsing shows only the desk.
				if (!q && !statusOnly && this.shelfOf(c) !== "desk") return false;
				return (
					FeedPolicy.visible(c, s, f.status) &&
					(f.type === "all" ||
						c.type === f.type ||
						(f.type === "todo" && ["task", "reminder"].includes(c.type))) &&
					(statusOnly ||
						f.status === "all" ||
						(f.status === "unread" && !s.read) ||
						(f.status === "read" && s.read) ||
						(f.status === "saved" && s.bookmarked) ||
						(f.status === "later" && s.later)) &&
					(!f.tag || Store.tags(c).includes(f.tag)) &&
					(!q || this.matches(c, q))
				);
			}),
			this.sort,
			Store.state.items,
			this.feedNow,
		);
	},
	deskView(this: AppController, heldId = "", taskPreviewOrder: string[] = []): ReactNode {
		return feedView(this, heldId, taskPreviewOrder);
	},
	renderCurrent(this: AppController, animate = false) {
		const heights = new Map(
			[...this.grid.querySelectorAll<HTMLElement>("[data-card]")].map((n) => [
				n.dataset.card,
				n.getBoundingClientRect().height,
			]),
		);
		const focused = this.grid.contains(document.activeElement as HTMLElement)
			? (document.activeElement as HTMLElement as HTMLElement)
			: null;
		const previousCard = focused?.closest<HTMLElement>("[data-card]"),
			focusedCardId = previousCard?.dataset.card;
		const taskPreviewOrder =
			previousCard?.dataset.taskPreviewLocked ||
			(focused?.dataset.action === "task" && focused.matches(":focus-visible"))
				? [...previousCard.querySelectorAll<HTMLElement>('.checklist [data-action="task"]')].map(
						(node) => node.dataset.extra,
					)
				: [];
		this.closeMore();
		// An anchored reflow may temporarily need extra room below the final row.
		this.grid.style.removeProperty("min-height");
		document.body.dataset.view = this.mode;
		renderView(this.grid, this.deskView(focusedCardId, taskPreviewOrder));
		const focusedCard = focusedCardId
			? this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(focusedCardId)}"]`)
			: null;
		if (focusedCard && taskPreviewOrder.length) {
			focusedCard.dataset.taskPreviewLocked = "true";
			const held = focusedCard;
			held.addEventListener(
				"focusout",
				() =>
					window.setTimeout(() => {
						if (held.isConnected && !held.contains(document.activeElement))
							this.refreshCard(focusedCardId);
					}, 0),
				{ once: true },
			);
		}
		for (const n of this.grid.querySelectorAll<HTMLElement>("[data-card]")) {
			n.style.minHeight =
				this.preserveFeed && heights.has(n.dataset.card) ? `${heights.get(n.dataset.card)}px` : "";
		}
		this.revealImages(this.grid);
		this.layout.layout(false);
		this.restoreStacks();
		this.updateSelection();
		this.updateFilterIndicator();
		if (focusedCard) {
			// Loading the next page must keep the same control, even when it is offscreen.
			const target =
				focused === previousCard
					? focusedCard
					: [...focusedCard.querySelectorAll<HTMLElement>("[data-action]")].find(
							(node?: HTMLElement) =>
								node.dataset.action === focused.dataset.action &&
								node.dataset.id === focused.dataset.id &&
								node.dataset.extra === focused.dataset.extra,
						);
			target?.focus({ preventScroll: true });
		}
		// Only the first screen enters; cards below the fold are simply there when scrolled to.
		if (animate)
			[...this.grid.children]
				.filter((n?: HTMLElement) => n.getBoundingClientRect().top < innerHeight)
				.forEach((n?: HTMLElement, i?: number) => {
					MotionEngine.enter(n, i < 10 ? i * MotionEngine.time("stagger") : 0);
				});
	},
	revealImages(this: AppController, root?: ParentNode) {
		root.querySelectorAll<HTMLImageElement>("img.card-image").forEach((img) => {
			if (this.loadedImages.has(img.src)) {
				img.classList.add("is-loaded");
				return;
			}
			const done = () => {
				if (this.loadedImages.has(img.src)) {
					img.classList.add("is-loaded");
					return;
				}
				this.loadedImages.add(img.src);
				img.classList.add("is-loaded");
				MotionEngine.animate(img, [{ opacity: 0 }, { opacity: getComputedStyle(img).opacity }], {
					duration: MotionEngine.time("fast"),
				});
				this.layout.schedule(false);
			};
			if (img.complete && img.naturalWidth) requestAnimationFrame(done);
			else img.addEventListener("load", done, { once: true });
		});
	},
	refreshCard(this: AppController, id?: string) {
		const active = document.activeElement as HTMLElement;
		const search = this.searchBackground || (this.modalKind === "search" ? this.dialog : null);
		const results = search?.querySelector<HTMLElement>("#search-results");
		if (results && Store.card(id)) {
			const scroll = results.scrollTop;
			const focused = results.contains(active);
			renderView(results, Panels.searchResults(this));
			results.scrollTop = scroll;
			for (const card of results.querySelectorAll<HTMLElement>("[data-card]"))
				this.markSelectionCard(card, this.searchSelected);
			if (focused) {
				const next = [...results.querySelectorAll<HTMLElement>("[data-action]")].find(
					(node) =>
						node.dataset.action === active.dataset.action &&
						node.dataset.id === active.dataset.id &&
						node.dataset.extra === active.dataset.extra,
				);
				next?.focus({ preventScroll: true });
				this.searchFocus = next;
			}
			this.revealImages(results);
		}
		const oldY = scrollY;
		this.preserveFeed = true;
		try {
			this.renderCurrent(false);
		} finally {
			this.preserveFeed = false;
		}
		for (const card of this.grid.querySelectorAll<HTMLElement>("[data-card]"))
			this.markSelectionCard(card, this.homeSelected);

		if (scrollY !== oldY) window.scrollTo({ top: oldY, behavior: "instant" });
	},
	updateFilterIndicator(this: AppController) {
		const tab = this.homeTab();
		document
			.getElementById("dock")
			.classList.toggle("filter-active", this.filtering() && !tab && !this.desktop());
		document.querySelectorAll<HTMLElement>(".home-tab").forEach((n) => {
			n.setAttribute("aria-pressed", String(n.dataset.extra === (tab || "")));
		});
		this.syncHomeSearch();
	},
	/** Desktop windows (wider than 650px) use the top-bar search and the bottom AI box (ADR 0049). */
	desktop(this: AppController) {
		return matchMedia("(min-width: 651px)").matches;
	},
	/** The chosen tab is a token in the top-bar search; home filter and search share one state. */
	syncHomeSearch(this: AppController) {
		const field = document.getElementById("home-search-field");
		if (!field) return;
		const tab = this.homeTab() || "all";
		const labels: Record<string, string> = {
			unread: copy("web.unread"),
			todo: copy("web.home.todo"),
			later: copy("web.later"),
			saved: copy("web.bookmark"),
		};
		const token = document.getElementById("home-search-token");
		const input = document.getElementById("home-search") as HTMLInputElement;
		const label = labels[tab];
		token.hidden = !label;
		token.textContent = label || "";
		token.setAttribute("aria-label", label ? `${copy("web.home.removeTab")} ${label}` : "");
		input.placeholder = label
			? `${copy("web.home.searchInPrefix")}${label}${copy("web.home.searchInSuffix")}`
			: copy("web.home.searchPlaceholder");
		if (document.activeElement !== input && input.value !== this.filter.query)
			input.value = this.filter.query;
		field.classList.toggle("has-token", !!label);
		field.classList.toggle("has-text", !!this.filter.query);
		field.querySelector<HTMLElement>(".home-search-clear").hidden = !this.filter.query;
		document.querySelectorAll<HTMLElement>(".home-menu-item").forEach((n) => {
			n.setAttribute("aria-checked", String(n.dataset.extra === tab));
		});
	},
	homeTopHTML(this: AppController) {
		const tabs = [
			["all", copy("web.all")],
			["unread", copy("web.unread")],
			["todo", copy("web.home.todo")],
			["later", copy("web.later")],
			["saved", copy("web.bookmark")],
		];
		return `<header id="home-top" class="home-top"><div class="home-heading"><button type="button" class="home-mark" data-action="top" aria-label="${copy("web.home.top")}">Sill</button><button type="button" class="home-account" id="account" data-action="nav" data-extra="settings" aria-label="${copy("web.nav.settings")}"><span class="account-wrap">${this.accountRing()}</span></button></div><div class="home-tabs" role="group" aria-label="${copy("web.home.tabs")}">${tabs.map(([key, label]) => `<button type="button" class="home-tab" data-action="home-tab" data-extra="${key}" aria-pressed="${key === "all"}">${label}</button>`).join("")}</div></header>`;
	},
	homeTabFilter(this: AppController, key: string) {
		return (
			{
				all: { type: "all", status: "all" },
				unread: { type: "all", status: "unread" },
				todo: { type: "todo", status: "all" },
				later: { type: "all", status: "later" },
				saved: { type: "all", status: "saved" },
			} as Record<string, { type: string; status: string }>
		)[key];
	},
	homeTab(this: AppController) {
		const f = this.filter;
		if (f.tag) return "";
		return (
			["all", "unread", "todo", "later", "saved"].find((key) => {
				const t = this.homeTabFilter(key);
				return t.type === f.type && t.status === f.status;
			}) || ""
		);
	},
};
