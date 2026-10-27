import type { ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { markdownText } from "../atoms/markdown.ts";
import { copy } from "../copy.ts";
import { cardSource } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";
import { feedView } from "./feed.tsx";
import { HomeHashList, HomeKinds, HomeSearchMarks, homeHashOptions } from "./home-search.tsx";
import { syncSearchHighlight, syncSearchIcon } from "./home-search-motion.ts";
import { renderView } from "./react-renderer.ts";

export const appFeedMethods = {
	refreshFeedOrder(this: AppController) {
		this.feedOrder = null;
		this.feedNow = Date.now();
		this.withFeedAnchor(() => {});
	},
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
		return [c.title, c.summary, cardSource(c), s.note, markdownText(c.body || ""), ...Store.tags(c)]
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
		return (
			f.type !== "all" ||
			f.status !== "all" ||
			(f.kind || "all") !== "all" ||
			(f.mark || "all") !== "all" ||
			!!f.tag ||
			!!f.query
		);
	},
	/** `anyKind` ignores the type chip, to learn which types still have results. */
	filtered(this: AppController, anyKind = false): Card[] {
		const f = this.filter,
			q = this.searchText(f.query),
			kind = f.kind || "all",
			mark = f.mark || "all";
		const statusOnly = ["snoozed", "dismissed", "done"].includes(f.status);
		// Keep one order across saves, pagination and filter changes until an explicit refresh.
		if (!this.feedOrder || this.feedOrderSort !== this.sort) {
			this.feedOrder = new Map();
			this.feedOrderSort = this.sort;
		}
		const ranked = FeedPolicy.sort(Store.state.cards, this.sort, Store.state.items, this.feedNow);
		for (const card of ranked) {
			if (!this.feedOrder.has(card.id)) this.feedOrder.set(card.id, this.feedOrder.size);
		}
		return Store.state.cards
			.filter((c?: Card) => {
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
					(anyKind || kind === "all" || c.type === kind) &&
					(mark === "all" ||
						(mark === "unread" && !s.read) ||
						(mark === "saved" && s.bookmarked) ||
						(mark === "later" && s.later)) &&
					(!f.tag || Store.tags(c).includes(f.tag)) &&
					(!q || this.matches(c, q))
				);
			})
			.sort((a, b) => this.feedOrder.get(a.id) - this.feedOrder.get(b.id));
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
			const initial = this.initializing;
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
				if (!initial)
					MotionEngine.animate(img, [{ opacity: 0 }, { opacity: getComputedStyle(img).opacity }], {
						duration: MotionEngine.time("fast"),
					});
				this.layout.schedule(false);
			};
			if (img.complete && img.naturalWidth) requestAnimationFrame(done);
			else img.addEventListener("load", done, { once: true });
		});
	},
	refreshCard(this: AppController, id?: string, preserve = true) {
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
		this.preserveFeed = preserve;
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
	/** Focus reveals search suggestions without resizing the field. */
	openHomeSearch(this: AppController, open: boolean) {
		const field = document.getElementById("home-search-field");
		if (!field) return;
		if (!open && !field.classList.contains("is-open")) return;
		field.classList.remove("suggestion-engaged");
		if (!open) {
			const query = this.searchText(this.filter.query);
			if (query)
				this.searchHistory = [query, ...this.searchHistory.filter((q) => q !== query)].slice(0, 8);
		}
		field.classList.toggle("is-open", open);
		field.classList.toggle("show-suggestions", open);
		this.syncHomeHash();
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
		const marked = this.filter.mark !== "all" || !!this.filter.tag;
		token.hidden = !label;
		token.textContent = label || "";
		token.setAttribute("aria-label", label ? `${copy("web.home.removeTab")} ${label}` : "");
		input.placeholder = label
			? `${copy("web.home.searchInPrefix")}${label}${copy("web.home.searchInSuffix")}`
			: marked
				? ""
				: copy("web.home.searchPlaceholder");
		if (document.activeElement !== input && input.value !== this.filter.query)
			input.value = this.filter.query;
		const marks = document.getElementById("home-search-marks");
		if (marks) renderView(marks, HomeSearchMarks({ filter: this.filter }));
		this.syncHomeHash();
		this.syncHomeKinds();
		field.classList.toggle("has-token", !!label || marked);
		syncSearchIcon(field, !!label || marked);
		field.classList.toggle("has-text", !!this.filter.query);
		field.querySelector<HTMLElement>(".home-search-clear").hidden = !this.filter.query;
		document.querySelectorAll<HTMLElement>(".home-menu-item").forEach((n) => {
			n.setAttribute("aria-checked", String(n.dataset.extra === tab));
		});
	},
	/** Focus shows session history without clearing the query; # shows condition completions. */
	homeHashOptions(this: AppController) {
		const input = document.getElementById("home-search") as HTMLInputElement | null;
		const frag = this.searchHash(this.filter.query);
		const field = document.getElementById("home-search-field");
		if (!input || !field?.classList.contains("is-open")) return [];
		if (frag !== null)
			return homeHashOptions(frag, this.filter, this.homeTabFilter(this.homeTab() || "all").status);
		if (this.filter.query.trim() && !field.classList.contains("show-suggestions")) return [];
		return [
			...this.searchHistory.map((query) => ({
				extra: `query:${query}`,
				label: query,
				group: "history" as const,
			})),
			...homeHashOptions("", this.filter, "all")
				.filter((option) => option.group === "tag")
				.slice(0, 6),
		];
	},
	syncHomeHash(this: AppController) {
		const slot = document.getElementById("home-hash-slot");
		if (!slot) return;
		const options = this.homeHashOptions();
		this.homeHashIndex = Math.min(this.homeHashIndex, Math.max(0, options.length - 1));
		renderView(
			slot,
			HomeHashList({
				options,
				active: this.homeHashIndex,
				onHighlight: (index) => {
					this.homeHashIndex = index;
					document.getElementById("home-search-field")?.classList.add("suggestion-engaged");
					this.syncHomeHash();
				},
			}),
		);
		const input = document.getElementById("home-search");
		input?.setAttribute("aria-expanded", String(options.length > 0));
		if (options.length)
			input?.setAttribute("aria-activedescendant", `home-option-${this.homeHashIndex}`);
		else input?.removeAttribute("aria-activedescendant");
		const list = slot.querySelector<HTMLElement>("#home-hash");
		if (list)
			syncSearchHighlight(
				list,
				JSON.stringify(options.map((option) => option.extra)),
				this.homeHashIndex,
			);
	},
	/** Type chips appear under the top bar only while there is text to search. */
	syncHomeKinds(this: AppController) {
		const row = document.getElementById("home-kinds");
		if (!row) return;
		const text = this.searchText(this.filter.query);
		row.hidden = !text;
		if (!text) return;
		const kinds = new Set(this.filtered(true).map((c) => c.type));
		renderView(row, HomeKinds({ kinds, active: this.filter.kind }));
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
		return (
			["all", "unread", "todo", "later", "saved"].find((key) => {
				const t = this.homeTabFilter(key);
				return t.type === f.type && t.status === f.status;
			}) || ""
		);
	},
};
