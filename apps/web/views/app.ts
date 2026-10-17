import { icon } from "../atoms/icons.ts";
import {
	button,
	checkMark,
	duration,
	emptyState,
	esc,
	eventEnded,
	eventRelative,
	eventTimely,
	minutes,
} from "../atoms/primitives.ts";
import { cardHTML, shelfHTML, stackHTML, stackOpenHTML } from "../cards/templates.ts";
import { copy } from "../copy.ts";
import { cardSource, cardSourceKind } from "../data/card-source.ts";
import { CardTypes, demoBase, FreshCards, SeedCards, SeedItems } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { ChromeAutoHide } from "../interactions/chrome.ts";
import { DragManager } from "../interactions/drag.ts";
import { Gestures } from "../interactions/gestures.ts";
import { FeedLayout } from "../interactions/layout.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { Panels, welcomeHTML } from "../interactions/panels.ts";
import {
	type AgentCard,
	AgentHandoff,
	type AgentScope,
	agentFailure,
	agentKey,
	agentPayload,
	openCardLink,
} from "../services/agent-handoff.ts";
import { Capture } from "../services/capture.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { LocalSync } from "../services/local-sync.ts";

/** The lens leads; the place it names opens just after, so the move is seen before the sheet covers it. */
const NAV_LEAD_MS = 160;

/** On a phone these places are pages under the capsule, not sheets. */
const PAGE_KINDS = ["search", "ai", "settings"];

class AppController {
	agentHandoff = new AgentHandoff();
	declare mode: any;
	declare baseMode: any;
	declare filter: any;
	searchActivated = false;
	searchFilter = { type: "all", status: "all", tag: "", query: "" };
	searchScroll = 0;
	searchLimit = 40;
	searchBackground?: HTMLDialogElement;
	searchFocus?: HTMLElement;
	aiSelectionIds: string[] = [];
	aiDraft = "";
	homeSelected = new Set<string>();
	searchSelected = new Set<string>();
	searchSelectAnchor = "";
	selectionBars = new WeakMap<HTMLElement, { visible: boolean; animation: Animation | null }>();
	get selected() {
		return this.modalKind === "search" ? this.searchSelected : this.homeSelected;
	}
	set selected(value: Set<string>) {
		if (this.modalKind === "search") this.searchSelected = value;
		else this.homeSelected = value;
	}
	declare pendingCards: any;
	declare pullRefreshFeedback: boolean;
	declare refreshBusy: any;
	declare openStacks: any;
	declare modalKind: any;
	declare currentId: any;
	declare panelReturn: any;
	declare lastFocus: any;
	declare mediaIndex: any;
	declare mediaTimer: any;
	declare podcastTimer: any;
	declare lastActivity: any;
	declare modalToken: any;
	declare routeScroll: any;
	declare photoIndex: any;
	declare sort: any;
	declare feedNow: any;
	declare pendingReminders: any;
	declare settingsGroup: any;
	declare navKey: string;
	declare navTimer: number;
	declare navOpenTimer: number;
	declare editingId: any;
	declare loadedImages: any;
	declare grid: any;
	declare dialog: any;
	declare themeQuery: any;
	declare layout: any;
	declare pageLimit: any;
	declare drag: any;
	declare gestures: any;
	declare hasMore: any;
	declare readTicker: any;
	declare railHide: any;
	declare sheetHide: any;
	declare lastRouteHash: any;
	declare skipReturnMotion: any;
	declare sheetLeaving: any;
	declare lockedScroll: any;
	pageScrollLocked = false;
	pageOverflow = "";
	previewSizeObserver?: ResizeObserver;
	declare editId: any;
	declare editTags: any;
	declare toastTimer: any;
	declare toastSeq: any;
	declare selectAnchor: any;
	declare previewTrail: any;
	declare closingAll: any;
	declare undoAction: any;
	declare bulkEditIds: any;
	declare clockMinute: any;
	declare stackIndex: any;
	declare stackDragUntil: any;
	declare searchTimer: any;
	declare inlineTimer: any;

	constructor() {
		this.mode = window.__PAGE__ || "feed";
		this.baseMode = this.mode;
		this.filter = { type: "all", status: "all", tag: "", query: "" };
		this.selected = new Set<any>();
		this.pendingCards = [];
		this.refreshBusy = false;
		this.openStacks = new Set<any>();
		this.modalKind = "";
		this.currentId = "";
		this.panelReturn = null;
		this.lastFocus = null;
		this.mediaIndex = 0;
		this.mediaTimer = null;
		this.podcastTimer = null;
		this.lastActivity = Date.now();
		this.modalToken = 0;
		this.routeScroll = {};
		this.photoIndex = 0;
		this.sort = "priority";
		this.feedNow = Date.now();
		this.pendingReminders = [];
		this.settingsGroup = "desk";
		this.navKey = "home";
		this.navTimer = 0;
		this.editingId = "";
		this.loadedImages = new Set<any>();
	}
	init() {
		// Track the input that opened the card; restoring focus must not draw a touch selection box.
		document.addEventListener(
			"pointerdown",
			() => {
				document.documentElement.dataset.inputModality = "pointer";
			},
			{ capture: true },
		);
		document.addEventListener(
			"keydown",
			(event) => {
				if (!event.metaKey && !event.ctrlKey && !event.altKey)
					document.documentElement.dataset.inputModality = "keyboard";
			},
			{ capture: true },
		);

		if (window.__QG_RUNTIME__) Store.key = "sill-live-v1";
		Store.load();
		if (window.__QG_RUNTIME__) Store.state.cards = [];
		this.sort = Store.pref("sort");
		document.body.innerHTML = `<main aria-label="${copy("web.app.75db60dcb6ad")}"><h1 class="sr-only" id="page-title">${copy("web.panels.f48d334495f6")}</h1><div class="feed-grid" id="feed-grid"></div><div class="feed-end" aria-hidden="true"></div></main>
   <div id="dock"><button type="button" id="offline" class="glass" data-action="retry" hidden>${copy("web.app.3d52574ce150")}</button><button type="button" id="new-count" class="glass" data-action="show-new" hidden aria-label="${copy("web.app.3fa133e511d1")}"></button>
   <div id="selection-bar" class="glass" hidden role="toolbar" aria-label="${copy("web.app.461e085d5ca2")}"><span class="selection-count num"></span>${button("bookmark", copy("web.app.87aeb7040c82"), "selected-bookmark")}${button("glasses", copy("web.app.d108c0a7e2c3"), "selected-later")}${button("tag", copy("web.app.b5816e5fd0be"), "selected-tag")}<span class="toolbar-sep" aria-hidden="true"></span>${button("x", copy("web.app.74966e20df2e"), "clear-selection")}${this.selectionAIHTML()}</div>
   ${this.navHTML()}</div><div class="scroll-edge" id="scroll-edge" aria-hidden="true"></div>
   <div class="drop-hint" id="drop-hint" hidden><span>${copy("web.app.2c8fe7be9774")}</span><small>${copy("web.app.4cb50c8338fe")}</small></div>
   <dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" class="glass" role="status" aria-live="polite" hidden><span id="toast-text"></span><span id="toast-action"></span></div><div class="sr-only" id="announcer" aria-live="polite"></div>`;
		this.grid = document.getElementById("feed-grid");
		this.dialog = document.getElementById("modal");
		this.setNav("home");
		if (typeof ResizeObserver === "function")
			new ResizeObserver(() => this.setNav(this.navKey)).observe(document.getElementById("nav"));
		this.themeQuery = matchMedia("(prefers-color-scheme: dark)");
		this.applyPreferences();
		this.layout = new FeedLayout(this.grid);
		this.pageLimit = 40;
		this.drag = new DragManager(this);
		this.gestures = new Gestures(this);
		document.addEventListener("click", (e?: any) => this.click(e));
		this.grid.addEventListener("contextmenu", (e: MouseEvent) => {
			const card = (e.target as Element).closest<HTMLElement>("[data-card]");
			if (!card || this.drag.active || this.drag.pending) return;
			e.preventDefault();
			this.more(card.dataset.card);
		});
		document.getElementById("selection-bar").addEventListener("contextmenu", (e: MouseEvent) => {
			if (!this.selected.size || this.drag.active || this.drag.pending) return;
			e.preventDefault();
			const trigger =
				(e.target as Element).closest<HTMLElement>("button") ||
				document.querySelector<HTMLElement>('[data-action="selected-bookmark"]');
			this.drag.openMenu([...this.selected], trigger, { x: e.clientX, y: e.clientY });
		});
		this.bindStacks();
		document.addEventListener("input", (e?: any) => this.input(e));
		document.addEventListener("compositionend", (e?: any) => this.input(e));
		this.bindKeyboard();
		document.addEventListener("keydown", (e?: any) => this.key(e));
		document.addEventListener("paste", (e?: any) => this.paste(e));
		["pointerdown", "keydown", "wheel", "touchstart"].forEach((type?: any) => {
			document.addEventListener(type, () => (this.lastActivity = Date.now()), { passive: true });
		});
		document.addEventListener("focusin", (e?: any) => {
			const menu = document.querySelector<HTMLElement>(".card-more-menu");
			if (menu && !menu.contains(e.target) && !e.target.closest?.('[data-action="card-more"]'))
				this.closeMore();
			if (this.editingId && !e.target.closest?.(".is-editing")) this.finishInlineEdit();
		});
		this.dialog.addEventListener("cancel", (e?: any) => {
			e.preventDefault();
			if (this.modalKind === "search" && this.selected.size) this.action("clear-selection");
			else this.closeModal();
		});
		this.dialog.addEventListener("click", (e?: any) => {
			if (e.target !== this.dialog) return;
			if (this.modalKind === "lightbox" || this.dialog.classList.contains("page")) return;
			// A click on the dim area, outside the sheet and its toolbar, closes the overlay.
			const inside = [...this.dialog.children].some((n?: any) => {
				const r = n.getBoundingClientRect();
				return (
					e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
				);
			});
			if (!inside) this.previewTrail?.length ? this.closeAll() : this.closeModal();
		});
		const dock = document.getElementById("dock");
		// The rail tucks away while reading on and returns on a pause or a turn back.
		this.railHide = new ChromeAutoHide(
			window,
			() => [dock, document.getElementById("scroll-edge")],
			() => this.drag?.active || this.drag?.menu?.open,
		);
		window.addEventListener("popstate", () => this.route());
		window.addEventListener("hashchange", () => this.route());
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				Store.save();
				this.pauseMedia();
			} else this.checkReminders();
		});
		window.addEventListener("pagehide", () => Store.save());
		window.addEventListener(
			"scroll",
			() => {
				this.paintPending();
				if (
					this.hasMore &&
					!this.dialog.open &&
					scrollY + innerHeight * 2 > document.documentElement.scrollHeight
				) {
					this.pageLimit += 40;
					this.renderCurrent(false);
				}
			},
			{ passive: true },
		);
		this.bindCaptureDrop();
		this.themeQuery.addEventListener?.("change", () => this.applyPreferences());
		this.readTicker = setInterval(() => this.tick(), 1000);
		if (!location.hash) history.replaceState({ glass: true, prev: null }, "", "#" + this.mode);
		this.renderCurrent(true);
		this.route();
		this.checkReminders();
		window.__app = this;
		window.__store = Store; // Deliberate test hooks, no network credentials or private data.
	}
	applyPreferences() {
		const theme = Store.pref("theme"),
			dark = theme === "dark" || (theme === "system" && this.themeQuery?.matches);
		document.documentElement.dataset.theme = dark ? "dark" : "light";
		document.body.classList.toggle("opaque", !!Store.pref("reduceTransparency"));
		document.body.classList.toggle("reduce-motion", !!Store.pref("reduceMotion"));
		document.body.dataset.density = Store.pref("density");
		this.sort = Store.pref("floatTimely") ? Store.pref("sort") : "time";
	}
	announce(text?: any) {
		document.getElementById("announcer").textContent = text;
	}
	/** On phones the on-screen keyboard covers the bottom: sheets that take typing rise above it, the rail steps away. */
	bindKeyboard() {
		const vv = window.visualViewport;
		if (!vv) return;
		const sync = () => {
			const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
			document.documentElement.style.setProperty("--kb", `${kb}px`);
			document.body.classList.toggle("keyboard-open", kb > 120);
		};
		vv.addEventListener("resize", sync);
		vv.addEventListener("scroll", sync);
		sync();
	}
	paintAccount() {
		const face = document.querySelector("#account .account-wrap");
		if (face) face.innerHTML = this.accountRing();
	}
	accountRing() {
		return `${icon("sill", 22)}<svg class="orb-arc" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" pathLength="100"/></svg><span class="orb-done" aria-hidden="true">${icon("check", 16)}</span>`;
	}
	/**
	 * The navigation capsule: four places, one glass lens that slides to the current one.
	 * Card actions never live here; they stay with the card (preview toolbar, selection menu).
	 */
	navHTML() {
		const tab = (key: string, face: string, label: string, aria = label, id = "") =>
			`<button type="button" class="nav-tab"${id ? ` id="${id}"` : ""} data-action="nav" data-extra="${key}" aria-label="${aria}"${key === "home" ? ' aria-current="page"' : ""}><span class="nav-icon">${face}</span></button>`;
		return `<nav class="nav-capsule glass" id="nav" aria-label="${copy("web.nav.label")}"><span class="nav-lens" aria-hidden="true"></span>${tab("home", icon("home", 22), copy("web.nav.home"))}${tab("search", icon("search", 22), copy("web.nav.search"))}${tab("ai", icon("chat", 22), copy("web.nav.ai"), copy("web.nav.aiLabel"))}${tab("settings", `<span class="account-wrap">${this.accountRing()}</span>`, copy("web.nav.settings"), copy("web.nav.settings"), "account")}</nav>`;
	}
	/** Moves the lens. The lens travels on a spring and stretches a little on the way, like a drop. */
	setNav(key: string) {
		const nav = document.getElementById("nav");
		if (!nav) return;
		const tab = nav.querySelector<HTMLElement>(`[data-extra="${key}"]`);
		if (!tab) return;
		const moved = this.navKey !== key;
		this.navKey = key;
		nav.querySelectorAll(".nav-tab").forEach((n) => {
			if (n === tab) n.setAttribute("aria-current", "page");
			else n.removeAttribute("aria-current");
		});
		nav.style.setProperty("--lens-x", `${tab.offsetLeft}px`);
		nav.style.setProperty("--lens-w", `${tab.offsetWidth}px`);
		if (!moved || MotionEngine.reduced) return;
		nav.classList.remove("is-moving");
		void nav.offsetWidth;
		nav.classList.add("is-moving");
		clearTimeout(this.navTimer);
		this.navTimer = window.setTimeout(() => nav.classList.remove("is-moving"), 420);
	}
	isPage(kind: string) {
		return (
			["search", "ai"].includes(kind) ||
			(PAGE_KINDS.includes(kind) && matchMedia("(max-width:650px)").matches)
		);
	}
	/**
	 * A tab opens its place. On a phone the place is a page and the capsule stays, so the lens
	 * slides while the page changes. On a desktop the place is a panel; the lens moves first.
	 */
	goTo(key: string) {
		clearTimeout(this.navOpenTimer);
		this.navOpenTimer = 0;
		if (key === "home") {
			if (this.searchBackground || ["search", "ai"].includes(this.modalKind)) {
				history.replaceState({ glass: true, prev: null }, "", "#feed");
				this.lastRouteHash = "#feed";
			}
			this.discardSearchBackground();
			this.setNav("home");
			if (this.dialog.open) this.closeNative();
			else window.scrollTo({ top: 0, behavior: MotionEngine.reduced ? "auto" : "smooth" });
			return;
		}
		if (key === "search" && this.searchBackground) {
			if (location.hash !== "#search") {
				this.navigate("#search");
				return;
			}
			this.closeNative();
			return;
		}
		if (this.modalKind === key && this.dialog.open) {
			this.setNav(key);
			return;
		}
		this.setNav(key);
		const open = () => {
			this.navOpenTimer = 0;
			if (this.navKey !== key) return;
			if (key === "settings") this.settingsGroup = "desk";
			this.openPanel(key);
		};
		if (MotionEngine.reduced || this.isPage(key)) open();
		else this.navOpenTimer = window.setTimeout(open, NAV_LEAD_MS);
	}
	/* ——— What is on the desk ——— */
	shelfOf(c?: any) {
		return FeedPolicy.shelf(c, Store.item(c.id), this.feedNow, Store.pref("archiveAfter"));
	}
	shelved(which?: any) {
		return Store.state.cards.filter(
			(c?: any) => this.shelfOf(c) === which && FeedPolicy.visible(c, Store.item(c.id)),
		);
	}
	matches(c?: any, q?: any) {
		const s = Store.item(c.id);
		return [c.title, c.summary, cardSource(c), s.note, ...(c.body || []), ...Store.tags(c)]
			.join(" ")
			.toLocaleLowerCase()
			.includes(q.toLocaleLowerCase());
	}
	searchAll(q?: any) {
		const f = this.searchFilter;
		const all = Store.state.cards.filter((c?: any) => {
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
			desk: all.filter((c?: any) => this.shelfOf(c) === "desk"),
			shelved: all.filter((c?: any) => this.shelfOf(c) !== "desk"),
		};
	}
	filtering() {
		const f = this.filter;
		return f.type !== "all" || f.status !== "all" || !!f.tag || !!f.query;
	}
	filtered() {
		const f = this.filter,
			q = f.query.trim();
		const statusOnly = ["snoozed", "dismissed", "done"].includes(f.status);
		return FeedPolicy.sort(
			Store.state.cards.filter((c?: any) => {
				const s = Store.item(c.id);
				// Searching reaches every shelf; browsing shows only the desk.
				if (!q && !statusOnly && this.shelfOf(c) !== "desk") return false;
				return (
					FeedPolicy.visible(c, s, f.status) &&
					(f.type === "all" || c.type === f.type) &&
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
	}
	deskHTML() {
		if (!Store.state.cards.length && !window.__QG_RUNTIME__) return welcomeHTML();
		const cards = this.filtered();
		if (!cards.length)
			return this.filtering()
				? emptyState(
						this.filter.query
							? `${copy("web.panels.11a8f9879575")}${this.filter.query}」`
							: copy("web.app.4a684ec67af5"),
						"",
						`<button type="button" class="text-link" data-action="clear-filter">${copy("web.app.657d9cbf45ec")}</button>`,
					)
				: emptyState(copy("web.app.a510cac879f0")) +
						shelfHTML(this.shelved("read").length, this.shelved("stale").length);
		const stacks =
			Store.pref("stack") && !this.filtering()
				? FeedPolicy.stacks(cards, Store.state.items)
				: new Map<any, any>();
		const inStack = new Map<any, any>();
		for (const [key, list] of stacks) for (const c of list) inStack.set(c.id, key);
		const html = [],
			done = new Set<any>();
		for (const c of cards) {
			const key = inStack.get(c.id);
			if (!key) {
				html.push(cardHTML(c, { now: this.feedNow }));
				continue;
			}
			if (done.has(key)) continue;
			done.add(key);
			html.push(
				this.openStacks.has(key)
					? stackOpenHTML(key, stacks.get(key))
					: stackHTML(key, stacks.get(key)),
			);
		}
		// A large desk is laid out a screen ahead of the reader, never all at once.
		this.hasMore = html.length > this.pageLimit;
		if (this.hasMore) html.length = this.pageLimit;
		else if (!this.filtering())
			html.push(shelfHTML(this.shelved("read").length, this.shelved("stale").length));
		document.body.classList.toggle("feed-more", this.hasMore);
		return html.join("");
	}
	renderCurrent(animate: any = false) {
		const focused = this.grid.contains(document.activeElement)
			? (document.activeElement as HTMLElement)
			: null;
		const previousCard = focused?.closest<HTMLElement>("[data-card]"),
			focusedCardId = previousCard?.dataset.card;
		const taskPreviewOrder = previousCard?.dataset.taskPreviewLocked
			? [...previousCard.querySelectorAll<HTMLElement>('.checklist [data-action="task"]')].map(
					(node) => node.dataset.extra,
				)
			: [];
		this.closeMore();
		// An anchored reflow may temporarily need extra room below the final row.
		this.grid.style.removeProperty("min-height");
		document.body.dataset.view = this.mode;
		this.grid.innerHTML = this.deskHTML();
		let focusedCard = focusedCardId
			? this.grid.querySelector(`[data-card="${CSS.escape(focusedCardId)}"]`)
			: null;
		if (focusedCard && taskPreviewOrder.length) {
			const temp = document.createElement("div");
			temp.innerHTML = cardHTML(Store.card(focusedCardId), {
				compact: focusedCard.classList.contains("is-compact"),
				now: this.feedNow,
				taskPreviewOrder,
			});
			const held = temp.firstElementChild as HTMLElement;
			held.dataset.taskPreviewLocked = "true";
			held.addEventListener("focusout", () => {
				window.setTimeout(() => {
					if (held.isConnected && !held.contains(document.activeElement))
						this.refreshCard(focusedCardId);
				}, 0);
			});
			focusedCard.replaceWith(held);
			focusedCard = held;
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
					: [...focusedCard.querySelectorAll("[data-action]")].find(
							(node?: any) =>
								node.dataset.action === focused.dataset.action &&
								node.dataset.id === focused.dataset.id &&
								node.dataset.extra === focused.dataset.extra,
						);
			target?.focus({ preventScroll: true });
		}
		// Only the first screen enters; cards below the fold are simply there when scrolled to.
		if (animate)
			[...this.grid.children]
				.filter((n?: any) => n.getBoundingClientRect().top < innerHeight)
				.forEach((n?: any, i?: any) => {
					MotionEngine.enter(n, Math.min(i * 60, 240));
				});
	}
	// Covers sharpen once decoded; a cover seen before appears at once, without replaying the blur.
	revealImages(root?: any) {
		root.querySelectorAll("img.card-image").forEach((img?: any) => {
			if (this.loadedImages.has(img.src)) {
				img.classList.add("is-loaded");
				return;
			}
			const done = () => {
				this.loadedImages.add(img.src);
				img.classList.add("is-loaded");
				this.layout.schedule(false);
			};
			if (img.complete && img.naturalWidth) requestAnimationFrame(done);
			else img.addEventListener("load", done, { once: true });
		});
	}
	refreshCard(id?: any) {
		const searchCard = (
			this.searchBackground || (this.modalKind === "search" ? this.dialog : null)
		)?.querySelector(`[data-card="${CSS.escape(id)}"]`);
		const sharedCard = Store.card(id);
		if (searchCard && sharedCard) {
			const temp = document.createElement("div");
			const active = searchCard.contains(document.activeElement)
				? (document.activeElement as HTMLElement)
				: null;
			const taskPreviewOrder =
				sharedCard.type === "task" && active?.dataset.action === "task"
					? [...searchCard.querySelectorAll('[data-action="task"]')].map(
							(n: HTMLElement) => n.dataset.extra,
						)
					: [];
			temp.innerHTML = Panels.searchCard(sharedCard, this);
			const replacement = temp.firstElementChild;
			this.markSelectionCard(replacement as HTMLElement, this.searchSelected);
			if (searchCard.contains(this.searchFocus))
				this.searchFocus = replacement.querySelector(".card-title-button") as HTMLElement;
			searchCard.replaceWith(replacement);
			if (active)
				[...replacement.querySelectorAll<HTMLElement>("[data-action]")]
					.find(
						(n: HTMLElement) =>
							n.dataset.action === active.dataset.action &&
							n.dataset.extra === active.dataset.extra &&
							n.dataset.id === active.dataset.id,
					)
					?.focus({ preventScroll: true });
			this.revealImages(replacement);
		}
		let old = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
		const c = Store.card(id),
			active = old?.contains(document.activeElement) ? document.activeElement : null;
		const focus = (active as HTMLElement)?.dataset.action,
			focusExtra = (active as HTMLElement)?.dataset.extra,
			focusId = (active as HTMLElement)?.dataset.id;
		const focusTitle = active?.classList.contains("card-title-button");
		const taskPreviewOrder =
			c?.type === "task" &&
			active &&
			(old.dataset.taskPreviewLocked || (focus === "task" && active.matches(":focus-visible")))
				? [...old.querySelectorAll('.checklist [data-action="task"]')].map(
						(n?: any) => n.dataset.extra,
					)
				: [];
		if (this.mode === "feed") {
			const before = [...this.grid.querySelectorAll("[data-card],[data-stack]")]
				.map((n?: any) => n.dataset.card || n.dataset.stack)
				.join(",");
			const probe = document.createElement("div");
			probe.innerHTML = this.deskHTML();
			const after = [...probe.querySelectorAll("[data-card],[data-stack]")]
				.map((n?: any) => n.dataset.card || n.dataset.stack)
				.join(",");
			if (before !== after) {
				this.withFeedAnchor(() => {});
				if (!taskPreviewOrder.length) return;
				old = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
			}
		}
		if (!old || !c) return;
		const temp = document.createElement("div");
		temp.innerHTML = cardHTML(c, {
			compact: old.classList.contains("is-compact"),
			now: this.feedNow,
			taskPreviewOrder,
		});
		const node = temp.firstElementChild;
		if (taskPreviewOrder.length) {
			(node as HTMLElement).dataset.taskPreviewLocked = "true";
			node.addEventListener("focusout", () => {
				window.setTimeout(() => {
					// Let the browser finish moving focus before settling the live card.
					if (node.isConnected && !node.contains(document.activeElement)) this.refreshCard(id);
				}, 0);
			});
		}
		// Start from the old classes so a read/unread change settles as a color transition.
		const nextClass = node.className;
		node.className = old.className;
		(node as HTMLElement).style.cssText = old.style.cssText;
		old.replaceWith(node);
		this.revealImages(node);
		void (node as HTMLElement).offsetWidth;
		node.className = nextClass;
		this.markSelectionCard(node as HTMLElement, this.homeSelected);
		this.layout.schedule(true);
		this.updateSelection();
		if (active) {
			const target = focusTitle
				? node.querySelector(".card-title-button")
				: [...node.querySelectorAll("[data-action]")].find(
						(n?: any) =>
							n.dataset.action === focus &&
							n.dataset.extra === focusExtra &&
							n.dataset.id === focusId,
					);
			(node as HTMLElement).focus({ preventScroll: true });
			((target || node.querySelector(".card-title-button") || node) as HTMLElement).focus({
				preventScroll: true,
			});
		}
	}
	updateFilterIndicator() {
		document.getElementById("dock").classList.toggle("filter-active", this.filtering());
	}
	selectionAIHTML() {
		return `<button type="button" class="selection-ai-target glass" data-action="selected-ai" aria-label="${copy("web.selection.aiOpen")}"><span class="selection-ai-symbol" aria-hidden="true">${icon("chat", 24)}<span class="selection-ai-wave"><i></i><i></i><i></i></span></span></button>`;
	}
	openSelectionAI(ids: string[]) {
		this.aiSelectionIds = [...new Set(ids)].filter((id) => Store.card(id));
		if (!this.aiSelectionIds.length) return;
		this.openPanel("ai");
	}
	markSelectionCard(node: HTMLElement, selection: Set<string>) {
		const selected = selection.has(node.dataset.card);
		node.classList.toggle("is-selected", selected);
		const title = node.querySelector(".card-title-button");
		if (selection.size) title?.setAttribute("aria-pressed", String(selected));
		else title?.removeAttribute("aria-pressed");
	}
	selectionContext() {
		const search = this.modalKind === "search";
		return {
			grid: search ? this.dialog.querySelector("#search-results") : this.grid,
			selected: search ? this.searchSelected : this.homeSelected,
			bar: document.getElementById(search ? "search-selection-bar" : "selection-bar"),
			search,
		};
	}
	bindSearchSelection() {
		if (!this.dialog.querySelector("#search-selection-bar")) {
			const original = document.getElementById("selection-bar");
			if (original) {
				const bar = original.cloneNode(true) as HTMLElement;
				bar.id = "search-selection-bar";
				bar.hidden = true;
				this.dialog.append(bar);
				bar.addEventListener("contextmenu", (e: MouseEvent) => {
					if (!this.searchSelected.size) return;
					e.preventDefault();
					this.drag.openMenu([...this.searchSelected], e.target as HTMLElement, {
						x: e.clientX,
						y: e.clientY,
					});
				});
			}
		}
		this.updateSelection();
	}
	/** Toggle one card, add it, or (Shift) fill the range from the last picked card. */
	select(id?: any, options: any = {}) {
		const context = this.selectionContext();
		const order = [...context.grid.querySelectorAll("[data-card]")].map(
				(n?: any) => n.dataset.card,
			),
			from = order.indexOf(context.search ? this.searchSelectAnchor : this.selectAnchor),
			to = order.indexOf(id);
		if (options.range && from >= 0 && to >= 0) {
			for (const card of order.slice(Math.min(from, to), Math.max(from, to) + 1))
				this.selected.add(card);
		} else if (options.add || !this.selected.has(id)) this.selected.add(id);
		else this.selected.delete(id);
		if (context.search) this.searchSelectAnchor = id;
		else this.selectAnchor = id;
		this.updateSelection();
	}
	updateSelection() {
		const { grid, bar, selected: selection, search } = this.selectionContext();
		if (!grid) return;
		const selecting = selection.size > 0;
		const entering = selecting && !grid.classList.contains("is-selecting");
		grid.querySelectorAll("[data-card]").forEach((n: HTMLElement) => {
			const selected = selection.has(n.dataset.card);
			this.markSelectionCard(n, selection);
			if (entering && !selected && !MotionEngine.reduced) {
				const bounds = n.getBoundingClientRect();
				if (bounds.bottom > 0 && bounds.top < innerHeight)
					MotionEngine.animate(
						n,
						[{ opacity: 1 }, { opacity: 0.88, offset: 0.4 }, { opacity: 1 }],
						{ duration: 240 },
					);
			}
		});
		grid.classList.add("selection-surface");
		grid.classList.toggle("is-selecting", selecting);
		if (!search) document.body.classList.toggle("is-selecting", selecting);
		if (!bar) return;
		const state = this.selectionBars.get(bar) || { visible: false, animation: null };
		this.selectionBars.set(bar, state);
		bar.inert = !selecting;
		bar.setAttribute("aria-hidden", String(!selecting));
		bar.style.pointerEvents = selecting ? "" : "none";
		if (!selecting && bar.contains(document.activeElement))
			grid.querySelector(".card-title-button")?.focus({ preventScroll: true });
		bar.querySelector(".selection-count").textContent = String(this.selected.size);
		if (state.visible === selecting) return;
		state.visible = selecting;
		if (selecting) {
			this.railHide?.show();
			if (!MotionEngine.reduced)
				bar.querySelectorAll(".selection-ai-wave i").forEach((wave, index) => {
					MotionEngine.animate(
						wave,
						[
							{ transform: "scaleY(0.4)", opacity: 0.4 },
							{ transform: "scaleY(1)", opacity: 1 },
						],
						{ duration: 260, delay: index * 45 },
					);
				});
		}
		// Resume from the currently drawn frame when selection reverses mid-transition.
		const drawn = state.animation ? getComputedStyle(bar) : null;
		const from = drawn
			? { opacity: drawn.opacity || "1", transform: drawn.transform || "none" }
			: selecting
				? { opacity: 0, transform: "translateY(8px)" }
				: { opacity: 1, transform: "none" };
		state.animation?.cancel();
		bar.hidden = false;
		const animation = MotionEngine.animate(
			bar,
			[
				from,
				selecting
					? { opacity: 1, transform: "none" }
					: { opacity: 0, transform: "translateY(8px)" },
			],
			{ duration: 180 },
		);
		state.animation = animation;
		const finish = () => {
			if (state.animation !== animation || state.visible !== selecting) return;
			bar.hidden = !selecting;
			state.animation = null;
		};
		if (animation) animation.finished.then(finish, () => {});
		else finish();
	}
	/* ——— Routes: #feed · #card/<id> · #read/<id> ——— */
	navigate(hash?: any) {
		if (!this.pageScrollLocked) this.routeScroll[this.mode] = scrollY;
		history.pushState({ glass: true, prev: location.hash }, "", hash);
		this.route(true);
	}
	route(force: any = false) {
		const hash = location.hash;
		// Back/forward emits both popstate and hashchange; handle one transition only.
		if (!force && this.lastRouteHash === hash) return;
		this.lastRouteHash = hash;
		if (hash === "#ai") {
			if (this.modalKind !== "ai") this.openPanel("ai");
			return;
		}
		if (hash === "#search") {
			if (this.searchBackground) this.closeNative();
			else if (this.modalKind !== "search") this.openPanel("search");
			return;
		}
		if (/^#(card|read)\//.test(hash)) {
			const [, kind, id] = hash.match(/^#(card|read)\/(.+)$/) || [];
			if (!id || !Store.card(id)) {
				history.replaceState({ glass: true, prev: null }, "", "#feed");
				this.route();
				return;
			}
			if (this.closingAll) {
				this.closingAll = false;
				this.closeModal();
				return;
			}
			this.openCard(id, kind === "read");
			return;
		}
		const leavingSearch = !!this.searchBackground;
		this.discardSearchBackground();
		if (leavingSearch || ["preview", "reader", "lightbox", "search", "ai"].includes(this.modalKind))
			this.closeNative();
		if (this.mode !== "feed") {
			this.mode = "feed";
			this.baseMode = "feed";
			this.renderCurrent(true);
			window.scrollTo(0, this.routeScroll.feed || 0);
		}
	}
	lockPageScroll() {
		if (this.pageScrollLocked) return;
		this.pageScrollLocked = true;
		document.querySelector("main")?.setAttribute("inert", "");
		this.lockedScroll = scrollY;
		this.pageOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		document.body.style.setProperty("--locked-scroll", `${-this.lockedScroll}px`);
		document.body.classList.add("modal-scroll-locked");
	}
	unlockPageScroll() {
		if (!this.pageScrollLocked) return;
		this.pageScrollLocked = false;
		document.querySelector("main")?.removeAttribute("inert");
		document.body.classList.remove("modal-scroll-locked");
		document.body.style.removeProperty("--locked-scroll");
		document.documentElement.style.overflow = this.pageOverflow;
		window.scrollTo({ top: this.lockedScroll, behavior: "instant" });
	}
	/* ——— Overlays ——— */
	openModal(html?: any, kind?: any, origin: any = null, shape: any = "") {
		this.closeMore(true);
		if (this.modalKind === "search" && kind !== "search" && !this.searchBackground)
			this.suspendSearch();
		this.modalToken++;
		this.pauseMedia();
		MotionEngine.cancelPanel(this.dialog);
		this.skipReturnMotion = false;
		this.sheetLeaving = false;
		this.dialog.style.removeProperty("--backdrop");
		this.dialog.style.translate = "";
		// A phone page is not a modal: switching between a page and a sheet reopens the dialog in the other mode.
		const page = this.isPage(kind);
		if (this.dialog.open && this.dialog.classList.contains("page") !== page) this.dialog.close();
		if (!this.dialog.open) {
			this.lastFocus = document.activeElement;
			this.lockPageScroll();
		}
		const liveToast = document.getElementById("toast");
		if (liveToast && this.dialog.contains(liveToast)) document.body.appendChild(liveToast);
		this.modalKind = kind;
		this.dialog.className =
			shape || (["reader", "preview", "lightbox", "search"].includes(kind) ? kind : "panel");
		if (page) {
			this.dialog.classList.add("page");
			this.railHide?.show();
		}
		this.dialog.innerHTML = html;
		if (this.searchBackground) this.searchBackground.style.display = page ? "none" : "";
		if (kind === "search") {
			const title = this.dialog.querySelector("#modal-title");
			if (title) { title.tabIndex = -1; title.setAttribute("autofocus", ""); }
		}
		if (!this.dialog.open) {
			if (page) this.dialog.show();
			else this.dialog.showModal();
		}
		// Keep page backgrounds opaque while the persistent navigation changes tabs.
		if (!page) {
			if (kind === "search") MotionEngine.enter(this.dialog);
			else MotionEngine.openPanel(this.dialog, origin);
		}
		const focus = this.dialog.querySelector(
			kind === "search"
				? "#modal-title"
				: kind === "capture"
					? "#capture-text"
					: kind === "editor"
						? "#tag-new"
						: "#modal-title",
		);
		if (focus) {
			if (!/INPUT|TEXTAREA|BUTTON/.test(focus.tagName)) focus.tabIndex = -1;
			focus.focus({ preventScroll: true });
		}
	}
	closeNative(animate: any = true) {
		if (!this.dialog.open) return;
		// A sheet already dragged off screen closes as it is: no return motion.
		if (this.skipReturnMotion) {
			animate = false;
			this.skipReturnMotion = false;
		}
		// Phone sheet: it slides back down past the bottom edge while the dim fades, then the dialog closes.
		if (this.sheetLeaving) return;
		if (
			animate &&
			this.modalKind === "preview" &&
			MotionEngine.phoneSheet(this.dialog) &&
			!MotionEngine.reduced
		) {
			const sheet = this.dialog.querySelector(".preview-sheet"),
				token = this.modalToken;
			MotionEngine.cancelPanel(this.dialog);
			this.sheetLeaving = true;
			sheet.classList.remove("is-drag");
			sheet.classList.add("is-off");
			sheet.style.translate = "";
			this.dialog.querySelector(":scope > .float-bar")?.classList.add("is-hidden");
			this.dialog.style.setProperty("--backdrop", "0");
			window.setTimeout(() => {
				if (this.modalToken === token && this.dialog.open) {
					this.sheetLeaving = false;
					this.skipReturnMotion = true;
					this.closeNative();
				}
			}, 360);
			return;
		}
		if (animate && this.modalKind === "preview") {
			const token = this.modalToken,
				sheet = MotionEngine.surface(this.dialog),
				opacity = getComputedStyle(sheet).opacity;
			MotionEngine.cancelPanel(this.dialog);
			this.sheetLeaving = true;
			this.dialog.style.setProperty("--backdrop", "0");
			const animation = MotionEngine.animate(
				sheet,
				[
					{ opacity, transform: "translateY(0)" },
					{ opacity: 0, transform: "translateY(4px)" },
				],
				{ duration: 140, fill: "forwards" },
			);
			const bar = this.dialog.querySelector(":scope > .float-bar");
			const barAnimation = bar
				? MotionEngine.animate(bar, [{ opacity: 1 }, { opacity: 0 }], {
						duration: 100,
						fill: "forwards",
					})
				: null;
			MotionEngine.panelAnimations.set(this.dialog, [animation, barAnimation]);
			const finish = () => {
				if (this.modalToken === token && this.sheetLeaving) {
					this.sheetLeaving = false;
					this.closeNative(false);
				}
			};
			if (animation) animation.finished.then(finish, () => {});
			else finish();
			return;
		}
		this.modalToken++;
		this.pauseMedia();
		const toast = document.getElementById("toast");
		if (this.dialog.contains(toast)) document.body.appendChild(toast);
		const source = this.grid.querySelector(`[data-card="${CSS.escape(this.currentId || "")}"]`);
		if (animate && ["preview", "reader"].includes(this.modalKind))
			MotionEngine.closePanel(this.dialog, MotionEngine.capture(source), () =>
				MotionEngine.lift(null),
			);
		else {
			MotionEngine.cancelPanel(this.dialog);
			MotionEngine.lift(null);
		}
		this.sheetHide?.destroy();
		this.sheetHide = null;
		this.previewSizeObserver?.disconnect();
		if (this.modalKind === "search")
			this.searchScroll = this.dialog.querySelector("#search-results")?.scrollTop || 0;
		this.dialog.close();
		if (this.searchBackground) {
			this.restoreSearch();
			return;
		}
		if (this.modalKind === "search") {
			clearTimeout(this.searchTimer);
			if (location.hash === "#search") {
				history.replaceState({ glass: true, prev: null }, "", "#feed");
				this.lastRouteHash = "#feed";
			}
		}
		this.unlockPageScroll();
		this.modalKind = "";
		this.panelReturn = null;
		this.updateSelection();
		// The rail is back: the lens slides home from the place that was open.
		if (this.navKey !== "home") requestAnimationFrame(() => this.setNav("home"));
		// Leftovers of a drag or swipe are cleared only now that nothing is on screen.
		this.dialog.style.removeProperty("--backdrop");
		this.dialog.style.transform = "";
		this.dialog.style.translate = "";
		this.dialog.classList.remove("is-drag");
		this.dialog.getAnimations({ subtree: true }).forEach((a?: any) => {
			if (a.effect?.pseudoElement === "::backdrop") a.cancel();
		});
		let focus =
			this.lastFocus?.isConnected && this.lastFocus !== document.body
				? this.lastFocus
				: source?.querySelector(".card-title-button") || source;
		if (
			focus &&
			(!focus.getClientRects().length || getComputedStyle(focus).visibility === "hidden")
		)
			focus =
				focus.closest("[data-card]")?.querySelector(".card-title-button") ||
				document.getElementById("account");
		(focus || document.getElementById("account")).focus({ preventScroll: true });
	}
	// Leave a card for the desk directly, wherever it was opened from.
	/** Close every stacked preview: unwind the cards opened from inside, then close the first. */
	closeAll() {
		const depth = this.previewTrail?.length || 0;
		this.previewTrail = [];
		if (depth && history.state?.prev !== undefined && /^#card\//.test(location.hash)) {
			this.closingAll = true;
			history.go(-depth);
		} else this.closeToDesk();
	}
	closeToDesk(animate: any = true) {
		const destination = this.searchBackground ? "search" : this.baseMode;
		history.replaceState({ glass: true, prev: null }, "", "#" + destination);
		this.lastRouteHash = "#" + destination;
		this.closeNative(animate);
	}
	closeModal() {
		if (["preview", "reader", "lightbox"].includes(this.modalKind)) {
			if (history.state?.prev !== undefined && /^#(card|read)\//.test(location.hash))
				history.back();
			else {
				history.replaceState({ glass: true, prev: null }, "", "#" + this.baseMode);
				this.closeNative();
			}
		} else if (this.panelReturn) {
			const back = this.panelReturn;
			this.panelReturn = null;
			back();
		} else this.closeNative();
	}
	openPanel(kind?: any, id: any = "") {
		if (["search", "ai"].includes(kind) && location.hash !== `#${kind}`) {
			this.navigate(`#${kind}`);
			return;
		}
		if (kind === "search") this.panelReturn = null;
		else if (["preview", "reader"].includes(this.modalKind)) {
			const cardId = this.currentId,
				reading = this.modalKind === "reader";
			this.panelReturn = () => this.openCard(cardId, reading);
		}
		this.editId = id;
		if (["search", "settings", "ai"].includes(kind)) this.setNav(kind);
		if (kind === "editor") this.editTags = new Set<any>(Store.tags(Store.card(id)));
		const narrow = ["editor", "why", "capture", "confirm", "ai"].includes(kind),
			wide = kind === "settings";
		const html =
			kind === "search"
				? Panels.search(this)
				: kind === "editor"
					? Panels.editor(this, id)
					: kind === "why"
						? Panels.why(this, Store.card(id))
						: kind === "settings"
							? Panels.settings(this, this.settingsGroup)
							: kind === "capture"
								? Panels.capture(this)
								: kind === "ai"
									? Panels.ai(this)
									: kind === "archive"
										? Panels.archive(this, id)
										: "";
		this.openModal(
			html,
			kind,
			null,
			kind === "search" ? "search" : `panel${narrow ? " narrow" : wide ? " wide" : ""}`,
		);
		if (kind === "search") {
			this.dialog.querySelector("#search-results").scrollTop = this.searchScroll;
			this.bindSearchResults();
			this.revealImages(this.dialog);
		}
	}
	bindSearchResults() {
		this.bindSearchSelection();
		const results = this.dialog.querySelector("#search-results");
		results?.addEventListener(
			"scroll",
			() => {
				if (this.modalKind !== "search" || this.searchBackground) return;
				this.searchScroll = results.scrollTop;
				if (results.scrollTop + results.clientHeight * 2 < results.scrollHeight) return;
				const hits = this.searchAll(this.searchFilter.query.trim());
				if (this.searchLimit >= hits.desk.length + hits.shelved.length) return;
				this.searchLimit += 40;
				results.innerHTML = Panels.searchResults(this);
				results.scrollTop = this.searchScroll;
				this.revealImages(results);
				this.updateSelection();
			},
			{ passive: true },
		);
	}
	suspendSearch() {
		if (this.searchTimer) {
			clearTimeout(this.searchTimer);
			this.searchTimer = 0;
			const results = this.dialog.querySelector("#search-results");
			results.innerHTML = Panels.searchResults(this);
			this.revealImages(results);
			this.updateSelection();
		}
		this.searchScroll = this.dialog.querySelector("#search-results")?.scrollTop || 0;
		this.searchFocus = document.activeElement as HTMLElement;
		const background = document.createElement("dialog");
		background.id = "search-background";
		background.className = this.dialog.className;
		background.setAttribute("aria-label", copy("web.search"));
		background.append(...this.dialog.childNodes);
		// A second title must not compete with the active card dialog's label.
		background.querySelector("#modal-title")?.removeAttribute("id");
		document.body.append(background);
		this.dialog.close();
		background.show();
		background.inert = true;
		background.querySelector("#search-results").scrollTop = this.searchScroll;
		this.searchBackground = background;
	}
	restoreSearch() {
		const background = this.searchBackground;
		if (!background) return;
		this.dialog.className = background.className;
		this.dialog.replaceChildren(...background.childNodes);
		this.dialog.querySelector("h1").id = "modal-title";
		background.close();
		background.remove();
		this.searchBackground = undefined;
		this.modalKind = "search";
		if (location.hash !== "#search") {
			history.replaceState({ glass: true, prev: null }, "", "#search");
			this.lastRouteHash = "#search";
		}
		this.panelReturn = null;
		this.currentId = "";
		this.dialog.style.removeProperty("--backdrop");
		this.dialog.style.translate = "";
		this.dialog.style.transform = "";
		this.dialog.show();
		this.dialog.querySelector("#search-results").scrollTop = this.searchScroll;
		this.setNav("search");
		this.updateSelection();
		(this.searchFocus?.isConnected
			? this.searchFocus
			: this.dialog.querySelector("#filter-search")
		)?.focus({ preventScroll: true });
	}
	discardSearchBackground() {
		this.searchBackground?.close();
		this.searchBackground?.remove();
		this.searchBackground = undefined;
	}
	swapPanel(html?: any, kind?: any, shape: any = "panel") {
		// Move inside the same sheet without re-animating from a card.
		const toast = document.getElementById("toast");
		if (this.dialog.contains(toast)) document.body.appendChild(toast);
		this.modalKind = kind;
		this.dialog.className = shape;
		this.dialog.innerHTML = html;
		if (!this.dialog.open) {
			this.lastFocus = document.activeElement;
			this.lockPageScroll();
			this.dialog.showModal();
		}
		MotionEngine.enter(this.dialog.firstElementChild);
		const focus = this.dialog.querySelector("#modal-title");
		if (focus) {
			focus.tabIndex = -1;
			focus.focus({ preventScroll: true });
		}
	}
	openCard(id?: any, reading: any = false) {
		const c = Store.card(id);
		if (!c) return;
		const source = (
			this.searchBackground || (this.modalKind === "search" ? this.dialog : this.grid)
		).querySelector(`[data-card="${CSS.escape(id)}"]`);
		// A quick note opens where it is: the card becomes its own editor.
		if (
			!reading &&
			c.type === "note" &&
			cardSourceKind(c) === "capture" &&
			c.form !== "quote" &&
			source &&
			!this.dialog.open
		) {
			history.replaceState({ glass: true, prev: null }, "", "#feed");
			this.lastRouteHash = "#feed";
			this.startInlineEdit(id);
			return;
		}
		if (!this.dialog.open || this.currentId !== id)
			try {
				this.agentHandoff.beginDetail(agentKey(id, this.agentScope()));
			} catch {}
		const origin = MotionEngine.capture(
			this.dialog.open && this.currentId === id && ["preview", "reader"].includes(this.modalKind)
				? MotionEngine.surface(this.dialog)
				: source,
		);
		if (!this.dialog.open || this.modalKind !== "preview") this.previewTrail = [];
		else if (!reading && this.currentId && this.currentId !== id) {
			const back = this.previewTrail.lastIndexOf(id);
			if (back >= 0) this.previewTrail = this.previewTrail.slice(0, back);
			else this.previewTrail.push(this.currentId);
		}
		if (this.modalKind === "search") this.suspendSearch();
		this.currentId = id;
		Store.patch(id, { seen: true });
		this.refreshCard(id);
		if (c.type === "photo" && !reading) {
			this.photoIndex = 0;
			this.openModal(Panels.lightbox(c, 0, this), "lightbox", null, "lightbox");
			Store.patch(id, { read: true, progress: 1 });
			this.refreshCard(id);
			return;
		}
		if (reading) {
			// Bodies are on this device, so the page opens complete. The skeleton is kept for bodies fetched from a source.
			this.openModal(Panels.reader(this, c, false), "reader", origin);
			this.bindReader(id);
			this.gestures.bindPullDown();
			this.bindSheetChrome();
			return;
		}
		this.openModal(Panels.preview(this, c), "preview", origin);
		// The card below shows as an edge behind this one; tapping it goes back one card.
		const below = Store.card(this.previewTrail.at(-1));
		if (below)
			this.dialog.insertAdjacentHTML(
				"afterbegin",
				`<button type="button" class="sheet-peek" data-action="close" aria-label="${esc(copy("web.peekBack") + below.title)}"></button>`,
			);
		this.bindPreview(id);
		this.gestures.bindPullDown();
		this.bindSheetChrome();
		if (c.type === "media" && c.media !== "podcast") {
			this.mediaIndex = Math.min(
				(c.body.length || 1) - 1,
				Math.floor(Store.item(id).progress * (c.body.length || 1)),
			);
			this.paintMedia();
		}
	}
	// Always listen, including when a short sheet later expands or images load.
	bindPreview(id?: any) {
		const scroll = this.dialog.querySelector(".preview-sheet .sheet-scroll");
		if (!scroll || !CardTypes[Store.card(id)?.type]?.readable) return;
		this.bindReading(id, scroll);
	}
	bindReading(id: string, scroll: HTMLElement) {
		const token = this.modalToken;
		const current = () =>
			this.modalToken === token &&
			this.currentId === id &&
			scroll.isConnected &&
			this.dialog.open &&
			!document.hidden;
		const update = () => {
			if (!current()) return;
			this.lastActivity = Date.now();
			this.updateReading(id, scroll);
		};
		// Scroll events are evaluated immediately: completion never waits for the push animation.
		scroll.addEventListener(
			"scroll",
			() => {
				if (scroll.scrollHeight - scroll.clientHeight > 2) update();
			},
			{ passive: true },
		);
		requestAnimationFrame(() => {
			if (!current()) return;
			this.gestures.bindPush(id, scroll);
		});
		// Short cards stay unread until an explicit read action; elapsed time is not intent.
	}

	/** The preview and reader toolbars follow the same tuck-and-return rule as the desk rail. */
	bindSheetChrome() {
		this.sheetHide?.destroy();
		this.previewSizeObserver?.disconnect();
		const scroll = this.dialog.querySelector("#reader-scroll, .preview-sheet .sheet-scroll");
		if (!scroll) return;
		this.sheetHide = new ChromeAutoHide(scroll, () => [
			...this.dialog.querySelectorAll(
				":scope > .float-bar, :scope > .reader-head, :scope > .reader-edge, .sheet-head-tools",
			),
		]);
		// The head floats over the content; once the text has moved under it, a soft edge keeps the two apart.
		const sheet = this.dialog.querySelector(".preview-sheet");
		if (sheet) {
			const placeHead = () => {
				this.dialog.style.setProperty("--preview-height", `${sheet.offsetHeight}px`);
				const title = sheet.querySelector("#modal-title");
				if (title) {
					const top =
						title.getBoundingClientRect().top -
						sheet.getBoundingClientRect().top +
						scroll.scrollTop;
					// Align the disc's centre with the first title line.
					const line = parseFloat(getComputedStyle(title).lineHeight) || 28;
					sheet.style.setProperty("--preview-title-top", `${Math.max(12, top + line / 2 - 22)}px`);
				}
			};
			this.previewSizeObserver = new ResizeObserver(placeHead);
			this.previewSizeObserver.observe(sheet);
			const body = sheet.querySelector(".preview-body, .player");
			if (body) this.previewSizeObserver.observe(body);
			placeHead();
			scroll.addEventListener(
				"scroll",
				() => sheet.classList.toggle("is-scrolled", scroll.scrollTop > 8),
				{ passive: true },
			);
		}
	}
	bindReader(id?: any) {
		this.lastActivity = Date.now();
		const scroll = this.dialog.querySelector("#reader-scroll");
		if (!scroll) return;
		const token = this.modalToken;
		requestAnimationFrame(() => {
			if (this.modalToken !== token || !scroll.isConnected) return;
			const saved = Store.item(id).progress;
			scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * (saved >= 0.98 ? 0 : saved);
			this.bindReading(id, scroll);
		});
	}
	updateReading(id?: any, scroll?: any) {
		const available = scroll.scrollHeight - scroll.clientHeight;
		const end = scroll.querySelector("#reader-end");
		const viewport = scroll.getBoundingClientRect();
		const endBox = end?.getBoundingClientRect();
		// The content end precedes trailing actions/padding. Seeing it counts as reaching the end.
		const reachedEnd =
			available <= 2 ||
			available - scroll.scrollTop <= 8 ||
			(viewport.height > 0 &&
				endBox &&
				endBox.top >= viewport.top &&
				endBox.bottom <= viewport.bottom + 2);
		const actual = reachedEnd ? 1 : Math.max(0, Math.min(1, scroll.scrollTop / available));
		const before = Store.item(id);
		const p = Math.max(before.progress, actual);
		const read = before.read || reachedEnd;
		if (p !== before.progress || read !== before.read) Store.patch(id, { progress: p, read });
		const bar = document.getElementById("reader-progress");
		if (bar) bar.style.width = Math.round(actual * 100) + "%";
		document.getElementById("reader-end")?.classList.toggle("is-done", Store.item(id).read);
		this.dialog.querySelectorAll(".progress-ring").forEach((n?: any) => {
			n.setAttribute("aria-valuenow", String(Math.round(p * 100)));
			n.querySelector("circle:last-child").setAttribute(
				"stroke-dashoffset",
				String(50.265 * (1 - p)),
			);
		});
		// Do not replace the feed card and disturb focus/layout for every fractional progress update.
		if (Store.item(id).read !== before.read) this.refreshCard(id);
	}

	agentScope(): AgentScope {
		return { kind: "local" };
	}
	async readAgentCard(id: string, _scope: AgentScope): Promise<AgentCard> {
		const card = Store.card(id);
		if (!card) throw agentFailure("card_unavailable", copy("web.agent.noCard"));
		return card;
	}
	agentAction(card: AgentCard) {
		if (!window.__SILL_HOST__?.canDiscuss?.()) return "";
		let scope: AgentScope;
		try {
			scope = this.agentScope();
		} catch {
			return "";
		}
		const state = this.agentHandoff.state(agentKey(card.id, scope), window.__SILL_HOST__);
		if (state === "unavailable") return "";
		const labels = {
			unknown: copy("web.agent.unknownLabel"),
			discuss: copy("web.agent.discuss"),
			sending: copy("web.agent.sending"),
			sent: copy("web.agent.sentLabel"),
		};
		const busy = state === "sending";
		return `<button type="button" class="text-button" data-action="agent-handoff" data-id="${esc(card.id)}"${busy || state === "sent" || state === "unknown" ? " disabled" : ""} aria-busy="${busy}">${labels[state]}</button>`;
	}
	paintAgentActions() {
		this.dialog.querySelectorAll('[data-action="agent-handoff"]').forEach((button: HTMLElement) => {
			const card = Store.card(button.dataset.id);
			if (!card) return;
			const template = document.createElement("template");
			template.innerHTML = this.agentAction(card);
			const next = template.content.querySelector("button");
			if (!next) {
				button.remove();
				return;
			}
			button.textContent = next.textContent;
			(button as HTMLButtonElement).disabled = next.disabled;
			button.setAttribute("aria-busy", next.getAttribute("aria-busy"));
		});
	}
	async handoffCard(id: string) {
		try {
			const scope = this.agentScope();
			const key = agentKey(id, scope);
			const current = () => {
				try {
					return key === agentKey(id, this.agentScope());
				} catch {
					return false;
				}
			};
			const handoff = this.agentHandoff.run(
				key,
				async () => agentPayload(await this.readAgentCard(id, scope), scope),
				window.__SILL_HOST__,
				current,
			);
			this.paintAgentActions();
			const result = await handoff;
			if (result && current()) {
				document.getElementById("announcer").textContent = copy("web.agent.sent");
			}
		} catch (error) {
			this.alert(error.message || copy("web.agent.unavailable"));
		} finally {
			this.paintAgentActions();
		}
	}
	async openExternal(c?: any, url: string = c?.url) {
		try {
			return await openCardLink(url, window.__SILL_HOST__, (value) =>
				window.open(value, "_blank", "noopener,noreferrer"),
			);
		} catch (error) {
			this.alert(error.message || copy("web.agent.linkUnknown"));
			return false;
		}
	}
	/** Toast is for undo and short facts; it sits one row above the bottom rail. */
	toast(text?: any, undo: any = null, actionLabel: any = copy("web.app.926a50b98ece")) {
		this.showToast(text, undo, actionLabel, false);
	}
	/** A failure or a step the person must take stays until it is closed. */
	alert(text?: any) {
		this.showToast(text, null, "", true);
	}
	showToast(text?: any, undo?: any, actionLabel?: any, persistent?: any) {
		clearTimeout(this.toastTimer);
		this.toastSeq = (this.toastSeq || 0) + 1;
		this.undoAction = undo;
		const toast = document.getElementById("toast");
		(this.dialog.open ? this.dialog : document.body).appendChild(toast);
		document.getElementById("toast-text").textContent = text;
		document.getElementById("toast-action").innerHTML = undo
			? `<button type="button" class="text-link" data-action="undo" aria-label="${actionLabel === copy("web.app.926a50b98ece") ? copy("web.app.493c9056731b") : esc(actionLabel)}">${esc(actionLabel)}</button>`
			: persistent
				? button("x", copy("web.close"), "toast-close")
				: "";
		toast.classList.toggle("is-alert", !!persistent);
		toast.setAttribute("role", persistent ? "alert" : "status");
		toast.hidden = false;
		MotionEngine.enter(toast);
		if (!persistent)
			this.toastTimer = window.setTimeout(() => this.hideToast(), undo ? 5500 : 3200);
	}
	hideToast() {
		clearTimeout(this.toastTimer);
		const toast = document.getElementById("toast"),
			seq = this.toastSeq;
		if (!toast || toast.hidden) return;
		const done = () => {
			if (seq === this.toastSeq) toast.hidden = true;
		};
		const leave = MotionEngine.animate(
			toast,
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "translateY(4px)" },
			],
			{ duration: 140 },
		);
		leave ? leave.finished.then(done, done) : done();
	}
	/** A single flag shows its result on the card and in the preview; no toast. */
	setFlag(id?: any, key?: any, value?: any) {
		Store.patch(id, { [key]: value });
		this.refreshCard(id);
		this.syncPreviewButtons(id);
	}
	syncPreviewButtons(id?: any) {
		const s = Store.item(id);
		this.dialog
			.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="bookmark"]`)
			.forEach((n?: any) => {
				n.classList.toggle("active", s.bookmarked);
				n.setAttribute(
					"aria-label",
					s.bookmarked ? copy("web.panels.dca60869e7d2") : copy("web.bookmark"),
				);
			});
		this.dialog
			.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="later"]`)
			.forEach((n?: any) => {
				n.classList.toggle("active", s.later);
				n.setAttribute("aria-label", s.later ? copy("web.panels.c4d2d1edba13") : copy("web.later"));
			});
	}
	toggleTask(id?: any, taskId?: any) {
		const c = Store.card(id),
			before = Store.tasks(c)
				.filter((t?: any) => t.done)
				.map((t?: any) => t.id);
		const after = before.includes(taskId)
			? before.filter((t?: any) => t !== taskId)
			: [...before, taskId];
		Store.patch(id, { taskDone: after });
		this.refreshCard(id);
		if (this.dialog.open && this.currentId === id && this.modalKind === "preview") {
			const holder = this.dialog.querySelector(".detail-task-list");
			if (holder)
				for (const t of Store.tasks(c)) {
					const node = [...holder.querySelectorAll("[data-extra]")].find(
						(n?: any) => n.dataset.extra === t.id,
					);
					if (node) {
						node.classList.toggle("is-done", t.done);
						node.setAttribute("aria-checked", String(t.done));
						node.querySelector(".check-dot").outerHTML = checkMark(t.done);
					}
				}
		}
		if (after.length === c.tasks.length)
			this.toast(copy("web.app.58d2aeefaa41"), () => {
				Store.patch(id, { taskDone: before });
				this.refreshCard(id);
			});
	}
	closeMore(restoreFocus: any = false) {
		const menu = document.querySelector<HTMLElement>(".card-more-menu");
		if (!menu) return;
		const card = menu.closest("[data-card]"),
			trigger = card?.querySelector<HTMLElement>(".card-title-button");
		if (restoreFocus) trigger?.focus({ preventScroll: true });
		// The menu leaves faster than it came, toward its anchor.
		menu.classList.replace("card-more-menu", "card-more-leaving");
		menu.removeAttribute("id");
		menu.inert = true;
		const out = MotionEngine.animate(
			menu,
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "translateY(-4px)" },
			],
			{ duration: 120, easing: "ease-in" },
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
	}
	more(id?: any) {
		const c = (this.modalKind === "search" ? this.dialog : this.grid).querySelector(
				`[data-card="${CSS.escape(id)}"]`,
			),
			card = Store.card(id);
		if (!c || !card) return;
		if (c.querySelector(".card-more-menu")) {
			this.closeMore(true);
			return;
		}
		this.closeMore();
		c.classList.add("tools-open");
		const menu = document.createElement("div");
		menu.className = "card-more-menu";
		menu.setAttribute("role", "group");
		menu.setAttribute("aria-label", copy("web.templates.ee9430845e26"));
		menu.id = "card-menu-" + id;
		const s = Store.item(id),
			items = [
				...(card.why ? [["info", copy("web.panels.fdc032965548"), "why"]] : []),
				[
					"bookmark",
					s.bookmarked ? copy("web.panels.dca60869e7d2") : copy("web.bookmark"),
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
					this.selected.has(id) ? copy("web.app.74966e20df2e") : copy("web.app.c11330b85234"),
					"select",
				],
			];
		menu.innerHTML = items
			.map(
				([symbol, label, action]: any) =>
					`<button type="button" class="card-menu-item" data-action="${action}" data-id="${esc(id)}"><span>${label}</span></button>`,
			)
			.join("");
		c.appendChild(menu);
		const trigger = c.querySelector(".card-title-button");
		trigger?.setAttribute("aria-expanded", "true");
		trigger?.setAttribute("aria-controls", menu.id);
		MotionEngine.animate(
			menu,
			[
				{ opacity: 0, transform: "translateY(-4px)" },
				{ opacity: 1, transform: "none" },
			],
			{ duration: 180 },
		);
		menu.querySelector("button")?.focus({ preventScroll: true });
	}
	/* ——— Refresh, new content, reminders ——— */
	async refresh({ feedback = "default" } = {}) {
		const quiet = feedback === "pull";
		if (this.refreshBusy) return false;
		this.refreshBusy = true;
		this.pullRefreshFeedback = quiet;
		// Background work shows as a thin arc around the face; success needs no sentence.
		const dock = document.getElementById("dock"),
			started = Date.now();
		let finished = false;
		if (!quiet) dock.classList.add("is-busy");
		else {
			dock.classList.remove("is-busy", "is-done");
			for (const id of ["offline"]) {
				const notice = document.getElementById(id);
				if (notice) notice.hidden = true;
			}
		}
		try {
			if (window.__QG_LOCAL__) {
				const result = await LocalSync.refresh(true);
				if (result === false) return false;
			} else {
				// Demo: the next unseen sample arrives as new content; nothing jumps into the desk.
				const next = FreshCards.find(
					(f?: any) => !Store.card(f.id) && !this.pendingCards.some((p?: any) => p.id === f.id),
				);
				if (next) this.pendingCards.push({ ...next, time: Date.now() });
				this.feedNow = Date.now();
				this.withFeedAnchor(() => {});
				if (
					scrollY < 40 &&
					Store.pref("newHint") !== "off" &&
					!this.dialog.open &&
					this.pendingCards.length &&
					!this.pendingReminders.length
				)
					this.showNew(true);
			}
			this.paintPending();
			if (!quiet) this.announce(copy("web.app.2a004d94219c"));
			finished = true;
			return true;
		} catch (error) {
			if (!quiet) {
				this.setOffline(true);
				this.alert(copy("web.app.281583251761") + error.message);
			}
			return false;
		} finally {
			this.refreshBusy = false;
			this.pullRefreshFeedback = false;
			// The arc closes into a check for a moment: the refresh ran, with no sentence.
			if (!quiet)
				window.setTimeout(
					() => {
						dock.classList.remove("is-busy");
						if (!finished) return;
						dock.classList.add("is-done");
						window.setTimeout(() => dock.classList.remove("is-done"), 900);
					},
					Math.max(0, 600 - (Date.now() - started)),
				);
		}
	}
	setOffline(on?: any) {
		const n = document.getElementById("offline");
		MotionEngine.visibility(n, !!on);
		n.classList.remove("is-retrying");
	}
	checkReminders(now: any = Date.now()) {
		const next = Store.state.cards
			.filter((c?: any) => FeedPolicy.eligible(c, Store.item(c.id), now))
			.map((c?: any) => c.id);
		const added = next.some((id?: any) => !this.pendingReminders.includes(id));
		this.pendingReminders = next;
		this.paintPending();
		if (added)
			this.announce(`${copy("web.app.a6815db95ff5")}${next.length}${copy("web.app.46f0aa3f3a96")}`);
	}
	paintPending() {
		const count = this.pendingCards.length + this.pendingReminders.length,
			n = document.getElementById("new-count");
		const hide = !count || (Store.pref("newHint") === "off" && !this.pendingReminders.length);
		const signature = `${count}|${this.pendingReminders.length}|${hide}`;
		if (n.dataset.pending === signature) return;
		n.dataset.pending = signature;
		MotionEngine.visibility(n, !hide);
		n.innerHTML = this.pendingReminders.length
			? `${icon("bell", 14)}<span class="num">${count}</span>${copy("web.app.e57ff9e28a4b")}`
			: `${icon("up", 14)}<span class="num">${count}</span>${copy("web.app.b50caa663fcf")}`;
		n.setAttribute(
			"aria-label",
			`${copy("web.app.9ae8f7e3040d")}${this.pendingCards.length}${copy("web.app.5b2f6ba24e42")}${this.pendingReminders.length}${copy("web.app.099a1047b74a")}`,
		);
	}
	withFeedAnchor(change?: any, animate: any = false) {
		const nodes = [...this.grid.querySelectorAll("[data-card]")];
		const positions = animate
			? new Map<any, any>(nodes.map((n?: any) => [n.dataset.card, n.getBoundingClientRect()]))
			: null;
		const anchors = nodes
			.filter((n?: any) => n.getBoundingClientRect().bottom > 0)
			.map((n?: any) => ({ id: n.dataset.card, top: n.getBoundingClientRect().top }));
		const oldY = scrollY,
			focus = document.activeElement;
		const focusCard = (focus?.closest("[data-card]") as HTMLElement)?.dataset.card,
			focusAction = (focus as HTMLElement)?.dataset.action,
			focusExtra = (focus as HTMLElement)?.dataset.extra,
			focusId = (focus as HTMLElement)?.dataset.id;
		change();
		this.renderCurrent(false);
		if (oldY > 0) {
			const anchor = anchors.find((a?: any) =>
				this.grid.querySelector(`[data-card="${CSS.escape(a.id)}"]`),
			);
			if (anchor) {
				const node = this.grid.querySelector(`[data-card="${CSS.escape(anchor.id)}"]`);
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
			const card = this.grid.querySelector(`[data-card="${CSS.escape(focusCard)}"]`);
			const target =
				card &&
				[...card.querySelectorAll("[data-action]")].find(
					(n?: any) =>
						n.dataset.action === focusAction &&
						n.dataset.extra === focusExtra &&
						n.dataset.id === focusId,
				);
			card?.focus({ preventScroll: true });
			(
				target ||
				card?.querySelector(".card-title-button") ||
				card ||
				document.getElementById("account")
			).focus({ preventScroll: true });
		}
		if (positions)
			this.grid.querySelectorAll("[data-card]").forEach((node?: any) => {
				const rect = positions.get(node.dataset.card);
				if (rect) MotionEngine.flip(node, rect);
				else MotionEngine.drop(node);
			});
	}
	showNew(quiet: any = false) {
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
	}
	changeReminder(id?: any, action?: any) {
		const c = Store.card(id);
		if (!c || !FeedPolicy.supports(c)) return;
		const item = Store.item(id),
			keys = ["snoozedUntil", "dismissed", "reminderDone", "lastReminderKey", "lastNotifiedAt"];
		const before = Object.fromEntries(keys.map((k?: any) => [k, item[k]]));
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
		this.withFeedAnchor(() => {}, true);
		this.checkReminders();
		const card = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
		(
			card?.querySelector(".card-title-button") ||
			this.grid.querySelector(".card-title-button") ||
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
			this.withFeedAnchor(() => {}, true);
			this.checkReminders();
			const back = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
			(
				back?.querySelector(".card-title-button") ||
				back ||
				document.getElementById("account")
			).focus({
				preventScroll: true,
			});
		});
	}
	applySelectionAction(ids?: any, target?: any) {
		if (!ids?.length || !["tag", "bookmark", "later"].includes(target)) return;
		if (target === "tag") {
			this.bulkEditIds = ids;
			this.openPanel("editor", ids[0]);
			return;
		}
		const key = target === "bookmark" ? "bookmarked" : "later",
			old = ids.map((id?: any) => [id, Store.item(id)[key]]);
		ids.forEach((id?: any) => {
			Store.patch(id, { [key]: true });
			this.refreshCard(id);
		});
		this.toast(
			target === "bookmark"
				? `${copy("web.app.96e7ee93f3ba")}${ids.length}${copy("web.panels.e9e0fdc242b4")}`
				: `${ids.length}${copy("web.app.34d0636b70c8")}`,
			() =>
				old.forEach(([id, v]: any) => {
					Store.patch(id, { [key]: v });
					this.refreshCard(id);
				}),
		);
	}
	/* ——— Media ——— */
	paintMedia() {
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
		el.innerHTML = `<b>${labels[this.mediaIndex] || copy("web.app.c8e19ce87856") + (this.mediaIndex + 1)}</b><span>${esc(c.body[this.mediaIndex] || "")}</span>`;
		document.getElementById("media-step").textContent = `${this.mediaIndex + 1} / ${total}`;
		MotionEngine.enter(el);
	}
	pauseMedia() {
		clearInterval(this.mediaTimer);
		this.mediaTimer = null;
		clearInterval(this.podcastTimer);
		this.podcastTimer = null;
		const b = this.dialog?.querySelector('[data-action="media-play"]');
		if (b) {
			b.innerHTML = icon("play");
			b.setAttribute("aria-label", copy("web.panels.105587569775"));
		}
		const p = this.dialog?.querySelector('[data-action="podcast-play"]');
		if (p) {
			p.innerHTML = icon("play", 22);
			p.setAttribute("aria-label", copy("web.panels.c3396195e91c"));
		}
	}
	playMedia() {
		if (this.mediaTimer) {
			this.pauseMedia();
			return;
		}
		const c = Store.card(this.currentId),
			last = (c.body.length || 1) - 1;
		if (this.mediaIndex === last) this.mediaIndex = 0;
		this.paintMedia();
		const b = this.dialog.querySelector('[data-action="media-play"]');
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
	}
	podcast(id?: any, seek: any = 0) {
		const c = Store.card(id);
		if (!c) return;
		const total = c.duration || 1,
			paint = () => {
				const p = Store.item(id).progress,
					bar = document.getElementById("podcast-bar"),
					t = document.getElementById("podcast-played");
				if (bar) bar.style.width = Math.round(p * 100) + "%";
				if (t) t.textContent = duration(p * total);
			};
		if (seek) {
			Store.patch(id, {
				progress: Math.max(0, Math.min(1, Store.item(id).progress + seek / total)),
			});
			paint();
			this.refreshCard(id);
			return;
		}
		if (this.podcastTimer) {
			this.pauseMedia();
			return;
		}
		const b = this.dialog.querySelector('[data-action="podcast-play"]');
		b.innerHTML = icon("pause", 22);
		b.setAttribute("aria-label", copy("web.panels.8d12fc0d4eb2"));
		this.podcastTimer = setInterval(() => {
			const p = Math.min(1, Store.item(id).progress + 1 / total);
			Store.patch(id, { progress: p, read: p >= 0.985 || Store.item(id).read });
			paint();
			if (p >= 1) this.pauseMedia();
		}, 1000);
	}
	/* ——— Inline note editing ——— */
	startInlineEdit(id?: any) {
		this.finishInlineEdit();
		const node = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`),
			c = Store.card(id);
		if (!node || !c) return;
		this.editingId = id;
		Store.patch(id, { seen: true, read: true });
		node.classList.add("is-editing");
		node.querySelector(".card-body").outerHTML =
			`<div class="inline-editor"><span class="card-head">${icon("note", 16)}<span class="card-src">${copy("web.app.5d7845b38bf2")}${esc(c.meta || copy("web.cards.de6785d99e02"))}</span></span><input id="inline-title" aria-label="${copy("web.title")}" value="${esc(c.title)}" maxlength="200"><textarea id="inline-body" aria-label="${copy("web.app.7a688306423b")}" maxlength="4000">${esc((c.body?.length ? c.body.join("\n") : c.summary) || "")}</textarea><small id="inline-state">${copy("web.app.f2db3712a685")}</small></div>`;
		this.layout.schedule(false);
		const area = node.querySelector("#inline-body");
		area.focus();
		area.setSelectionRange(area.value.length, area.value.length);
	}
	saveInlineEdit() {
		const id = this.editingId,
			c = Store.card(id);
		if (!c) return;
		const title =
				(document.getElementById("inline-title") as HTMLInputElement)?.value.trim() || c.title,
			text = (document.getElementById("inline-body") as HTMLInputElement)?.value || "";
		const body = text
			.split("\n")
			.map((s?: any) => s.trim())
			.filter(Boolean);
		Object.assign(c, {
			title: title.slice(0, 200),
			body: body.length ? body : [title],
			summary: body.join("").slice(0, 300),
			meta: copy("web.cards.de6785d99e02"),
		});
		Store.save();
		const state = document.getElementById("inline-state");
		if (state)
			state.textContent = window.__QG_LOCAL__
				? copy("web.app.5fa0ce52b47e")
				: copy("web.cloudentry.1bd91a7d0c53");
	}
	finishInlineEdit() {
		if (!this.editingId) return;
		const id = this.editingId;
		this.saveInlineEdit();
		this.editingId = "";
		const node = this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
		node?.classList.remove("is-editing");
		this.refreshCard(id);
		this.layout.schedule(false);
	}
	/* ——— Capture ——— */
	capture(text?: any, toast: any = true) {
		const card = Capture.capture(text);
		if (!card) return null;
		const { fresh } = Capture.dedupe([card]);
		if (!fresh.length) {
			this.toast(copy("web.app.17ebeb500554"));
			return null;
		}
		this.withFeedAnchor(() => {
			Store.insert(fresh);
		});
		if (toast)
			this.toast(copy("web.app.4f060a8371c3"), () => {
				Store.remove([card.id]);
				this.withFeedAnchor(() => {});
			});
		return card;
	}
	bindCaptureDrop() {
		let depth = 0;
		const hint = document.getElementById("drop-hint");
		const isCapture = (e?: any) =>
			!e.dataTransfer?.types?.includes("Files") &&
			[...(e.dataTransfer?.types || [])].some(
				(t?: any) => t === "text/uri-list" || t === "text/plain",
			);
		document.addEventListener("dragenter", (e?: any) => {
			if (!isCapture(e) || this.drag.active) return;
			depth++;
			document.body.classList.add("is-dropping");
			hint.hidden = false;
		});
		document.addEventListener("dragleave", () => {
			depth = Math.max(0, depth - 1);
			if (!depth) {
				document.body.classList.remove("is-dropping");
				hint.hidden = true;
			}
		});
		document.addEventListener("dragover", (e?: any) => {
			if (isCapture(e)) e.preventDefault();
		});
		document.addEventListener("drop", (e?: any) => {
			if (!isCapture(e)) return;
			e.preventDefault();
			depth = 0;
			document.body.classList.remove("is-dropping");
			hint.hidden = true;
			const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
			if (text) this.capture(text);
		});
	}

	/* ——— First run ——— */
	loadDemo() {
		const before = Store.state.cards.length;
		Store.state.preferences.onboarded = true;
		const demo = SeedCards.map((c?: any) => ({
			...c,
			tasks: c.tasks?.map((t?: any) => ({ ...t })),
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
		if (!before)
			this.toast(
				copy("web.app.7c8adb347efd"),
				() => {
					Store.remove(demo.map((c?: any) => c.id));
					this.withFeedAnchor(() => {});
				},
				copy("web.app.309edeceecd6"),
			);
	}
	/* ——— Settings ——— */
	setPref(key?: any, value?: any) {
		const before = Store.pref(key);
		Store.setPref(key, value);
		this.applyPreferences();
		if (["stack", "fadeRead", "archiveAfter", "floatTimely", "density"].includes(key))
			this.withFeedAnchor(() => {});
		if (this.modalKind === "settings") this.repaintSettings();
		return before;
	}
	replacePanelContent(html?: any) {
		const active = document.activeElement;
		const key = (n?: any) => [n.id, n.dataset.action, n.dataset.id, n.dataset.extra].join("|");
		const focused = this.dialog.contains(active) ? key(active) : null;
		const selectors = [".sheet-scroll", ".settings-main", ".settings-nav", ".sheet"];
		const positions = selectors.map((selector?: any) => {
			const node = this.dialog.querySelector(selector);
			return { selector, x: node?.scrollLeft || 0, y: node?.scrollTop || 0 };
		});
		const full = this.dialog.querySelector(".preview-sheet")?.classList.contains("is-full");
		const toast = document.getElementById("toast");
		if (toast && this.dialog.contains(toast)) document.body.appendChild(toast);
		this.dialog.innerHTML = html;
		if (full) this.dialog.querySelector(".preview-sheet")?.classList.add("is-full");
		if (focused) {
			const target = [...this.dialog.querySelectorAll("button,input,textarea,a,[tabindex]")].find(
				(n?: any) => key(n) === focused,
			);
			const focus = target || this.dialog.querySelector("#modal-title");
			if (focus) {
				if (!focus.matches("button,input,textarea,a,[tabindex]")) focus.tabIndex = -1;
				focus.focus({ preventScroll: true });
			}
		}
		for (const { selector, x, y } of positions) {
			const node = this.dialog.querySelector(selector);
			if (node) {
				node.scrollLeft = x;
				node.scrollTop = y;
			}
		}
	}
	repaintSettings() {
		const main = this.dialog.querySelector(".settings-main"),
			y = main?.scrollTop || 0,
			active = document.activeElement,
			key = [
				(active as HTMLElement)?.dataset.action,
				(active as HTMLElement)?.dataset.id,
				(active as HTMLElement)?.dataset.extra,
			].join("|");
		this.replacePanelContent(Panels.settings(this, this.settingsGroup));
		const next = this.dialog.querySelector(".settings-main");
		if (next) next.scrollTop = y;
		[...this.dialog.querySelectorAll("[data-action]")]
			.find((n?: any) => [n.dataset.action, n.dataset.id, n.dataset.extra].join("|") === key)
			?.focus({ preventScroll: true });
	}
	exportAll() {
		const data: Record<string, any> = {
			app: "Sill",
			exportedAt: new Date().toISOString(),
			...Store.serialized(),
		};
		this.download(
			`sill-${new Date().toISOString().slice(0, 10)}.json`,
			JSON.stringify(data, null, 2),
			"application/json",
		);
	}
	download(name?: any, text?: any, type: any = "text/plain") {
		const blob = new Blob([text], { type }),
			url = URL.createObjectURL(blob),
			a = document.createElement("a");
		a.href = url;
		a.download = name;
		a.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	/* ——— Clock ——— */
	tick() {
		if (!document.hidden) {
			this.checkReminders();
			const minute = Math.floor(Date.now() / 60000);
			if (this.clockMinute !== minute) {
				this.clockMinute = minute;
				this.grid.querySelectorAll("[data-card]").forEach((node?: any) => {
					const c = Store.card(node.dataset.card);
					if (!c) return;
					if (c.type === "event") {
						const label = node.querySelector(".event-relative");
						if (label) label.textContent = eventRelative(c);
						// The join button appears only once the meeting is near; an ended meeting fades.
						if (
							!!node.querySelector('[data-action="join"]') !== (eventTimely(c) && !!c.meeting) ||
							node.classList.contains("is-ended") !== eventEnded(c)
						)
							this.refreshCard(c.id);
					} else if (c.type === "reminder") {
						const label = node.querySelector(".reminder-label");
						if (label) label.textContent = FeedPolicy.label(c, Store.item(c.id), Date.now());
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
			document.querySelectorAll("[data-live-time]").forEach((n?: any) => {
				n.textContent = minutes(Store.state.seconds);
			});
			if (Store.state.seconds % 5 === 0) Store.save();
		}
	}
	/* ——— Input ——— */
	/* Stacks are decks: the top card moves with the hand (finger, mouse or a sideways trackpad swipe) and leaves whole;
    the next card rises from beneath. Swiping right brings the previous card back over the top. */
	bindStacks() {
		this.stackIndex = new Map<any, any>();
		let g = null;
		this.grid.addEventListener("pointerdown", (e?: any) => {
			const deck = e.target.closest?.(".deck");
			if (!deck || e.button !== 0 || e.isPrimary === false) return;
			// A new hand gesture owns the deck, including while the previous card settles.
			deck._finish?.();
			clearTimeout(deck._wheel?.t);
			deck._wheel = null;
			deck._hold = 0;
			this.stackDragUntil = 0;
			g = { deck, id: e.pointerId, x: e.clientX, y: e.clientY, at: Date.now(), live: false, dx: 0 };
		});
		document.addEventListener("pointermove", (e?: any) => {
			if (!g || e.pointerId !== g.id) return;
			const dx = e.clientX - g.x,
				dy = e.clientY - g.y;
			if (!g.live) {
				if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
				if (Math.abs(dy) > Math.abs(dx) * 1.2) {
					g = null;
					return;
				}
				if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
				g.live = true;
				g.deck.classList.add("is-dragging");
				try {
					g.deck.setPointerCapture(e.pointerId);
				} catch {}
			}
			if (e.cancelable) e.preventDefault();
			g.dx = dx;
			this.deckFollow(g.deck, dx);
		});
		const release = (e?: any, cancelled?: any) => {
			if (!g || e.pointerId !== g.id) return;
			const d = g;
			g = null;
			if (!d.live) return;
			d.deck.classList.remove("is-dragging");
			this.stackDragUntil = Date.now() + 350;
			const w = d.deck.offsetWidth,
				v = d.dx / Math.max(1, Date.now() - d.at);
			const go =
				!cancelled && (Math.abs(d.dx) > w * 0.3 || (Math.abs(v) > 0.45 && Math.abs(d.dx) > 30));
			this.deckSettle(d.deck, go ? (d.dx < 0 ? 1 : -1) : 0);
		};
		document.addEventListener("pointerup", (e?: any) => release(e, false));
		document.addEventListener("pointercancel", (e?: any) => release(e, true));
		this.grid.addEventListener("lostpointercapture", (e?: any) => {
			if (g && e.target === g.deck) release(e, true);
		});
		window.addEventListener("blur", () => {
			if (g) release({ pointerId: g.id }, true);
		});
		// Trackpad: a sideways swipe drags the top card too. Its coasting momentum is ignored until the hand stops.
		this.grid.addEventListener(
			"wheel",
			(e?: any) => {
				const deck = e.target.closest?.(".deck");
				if (!deck || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
				e.preventDefault();
				const now = Date.now();
				const direction = Math.sign(e.deltaX);
				if (deck._hold && direction === deck._wheelDirection && now - deck._hold < 160) {
					deck._hold = now;
					return;
				}
				deck._hold = 0;
				deck._wheelDirection = direction;
				deck._finish?.();
				deck._wheel ||= { dx: 0 };
				const s = deck._wheel,
					w = deck.offsetWidth;
				clearTimeout(s.t);
				s.dx = Math.max(
					-w,
					Math.min(w, s.dx - e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? w : 1)),
				);
				this.deckFollow(deck, s.dx);
				if (Math.abs(s.dx) > w * 0.35) {
					deck._wheel = null;
					deck._hold = now;
					this.deckSettle(deck, s.dx < 0 ? 1 : -1);
					return;
				}
				s.t = window.setTimeout(() => {
					deck._wheel = null;
					this.deckSettle(deck, 0);
				}, 140);
			},
			{ passive: false },
		);
	}
	deckParts(deck?: any) {
		const cards = [...deck.children],
			i = Number(deck.dataset.cur || 0);
		return {
			cards,
			i,
			top: cards[i],
			next: cards[i + 1],
			prev: cards[i - 1],
			w: deck.offsetWidth || 1,
		};
	}
	deckFollow(deck?: any, dx?: any) {
		const { top, next, prev, w } = this.deckParts(deck);
		if (dx <= 0 || !prev) {
			// Toward the next card; with nothing beyond, the top card only gives a little.
			const x = dx < 0 && next ? dx : dx * 0.25,
				f = next ? Math.min(1, -Math.min(0, dx) / w) : 0;
			top.style.transform = `translateX(${x}px) rotate(${(x / w) * 6}deg)`;
			if (next) next.style.transform = `translateY(${6 * (1 - f)}px) scale(${0.97 + 0.03 * f})`;
			if (prev) {
				prev.classList.remove("is-prev");
				prev.style.transform = "";
			}
		} else {
			// Back: the previous card slides in from the left, over the top one.
			top.style.transform = "";
			prev.classList.add("is-prev");
			prev.style.visibility = "visible";
			const x = -w - 24 + dx;
			prev.style.transform = `translateX(${x}px) rotate(${(x / w) * 6}deg)`;
		}
	}
	deckSettle(deck?: any, dir?: any) {
		deck._finish?.();
		const { cards, i, top, next, prev, w } = this.deckParts(deck);
		if (!top) return;
		if ((dir === 1 && !next) || (dir === -1 && !prev)) dir = 0;
		const t: Record<string, any> = {
				duration: MotionEngine.reduced ? 1 : 260,
				easing: "cubic-bezier(.2,.75,.25,1)",
			},
			anims = [];
		const run = (el?: any, to?: any) => {
			if (!el) return;
			const from = el.style.transform || "none";
			anims.push(el.animate([{ transform: from }, { transform: to }], t));
			el.style.transform = to;
		};
		if (dir === 1) {
			run(top, `translateX(${-w * 1.15}px) rotate(-8deg)`);
			run(next, "none");
		} else if (dir === -1) {
			if (!prev.classList.contains("is-prev")) this.deckFollow(deck, 1);
			run(prev, "none");
		} else {
			run(top, "none");
			if (next) run(next, "translateY(6px) scale(.97)");
			if (prev?.classList.contains("is-prev")) run(prev, `translateX(${-w - 24}px) rotate(-6deg)`);
		}
		deck.dataset.busy = "1";
		let finished = false;
		const done = () => {
			if (finished) return;
			finished = true;
			anims.forEach((a?: any) => {
				a.cancel();
			});
			delete deck.dataset.busy;
			deck._finish = null;
			this.deckShow(deck, i + dir);
		};
		deck._finish = done;
		Promise.all(anims.map((a?: any) => a.finished)).then(done, done);
	}
	deckShow(deck?: any, i?: any) {
		const cards = [...deck.children];
		i = Math.max(0, Math.min(cards.length - 1, i));
		const stack = deck.closest("[data-stack]");
		if (!stack) return;
		const key = stack.dataset.stack;
		cards.forEach((c?: any, k?: any) => {
			c.classList.toggle("is-top", k === i);
			c.classList.toggle("is-next", k === i + 1);
			c.classList.remove("is-prev");
			c.style.transform = "";
			c.style.visibility = "";
			c.setAttribute("aria-hidden", String(k !== i));
		});
		// The one button that spreads the pile out always sits on the card you can see.
		const button = deck.querySelector(".card-title-button"),
			h = cards[i].querySelector(".card-title");
		if (button && h && !h.contains(button)) {
			const old = button.parentElement;
			old.textContent = button.textContent;
			button.textContent = h.textContent;
			h.textContent = "";
			h.appendChild(button);
		}
		deck.dataset.cur = i;
		this.stackIndex.set(key, i);
	}
	restoreStacks() {
		this.grid.querySelectorAll("[data-stack] .deck").forEach((deck?: any) => {
			const i = this.stackIndex.get(deck.closest("[data-stack]").dataset.stack) || 0;
			if (i) this.deckShow(deck, i);
		});
	}
	click(e?: any) {
		// The end of a sideways drag through a stack is not a tap.
		if (this.stackDragUntil > Date.now() && e.target.closest?.("[data-stack]")) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		const picked = e.target.closest?.("#feed-grid [data-card], #search-results [data-card]");
		if (
			picked &&
			this.selectionContext().grid?.contains(picked) &&
			!e.target.closest(".card-actions, .card-more-menu, .is-editing") &&
			(e.metaKey || e.ctrlKey || e.shiftKey || this.selected.size)
		) {
			e.preventDefault();
			e.stopPropagation();
			this.closeMore();
			this.select(picked.dataset.card, { range: e.shiftKey });
			return;
		}
		const el = e.target.closest?.("[data-action]");
		if (el?.closest(".card-more-menu")) this.closeMore(true);
		else if (!el?.matches('[data-action="card-more"]') && !e.target.closest?.(".card-more-menu"))
			this.closeMore();
		if (this.editingId && !e.target.closest?.(".is-editing")) this.finishInlineEdit();
		if (el) {
			if (el.disabled) return;
			e.preventDefault();
			e.stopPropagation();
			this.action(el.dataset.action, el.dataset.id, el.dataset.extra, el, e);
			return;
		}
		if (e.target.closest?.(".is-editing")) return;
		const stack = e.target.closest?.("[data-stack]");
		if (stack && !e.target.closest("button,a,input,textarea")) {
			this.action("stack-open", "", stack.dataset.stack);
			return;
		}
		const card = e.target.closest?.("[data-card]");
		if (card && !e.target.closest("button,a,input,textarea")) {
			this.navigate("#card/" + card.dataset.card);
			return;
		}
	}
	action(name?: any, id: any = "", extra: any = "", el: any = null, event: any = null) {
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
					if (this.modalKind === "archive")
						this.dialog.innerHTML = Panels.archive(this, this.editId);
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
				this.searchActivated = true;
				this.searchFilter.type = extra;
				this.repaintSearch();
				break;
			case "filter-status":
				this.searchActivated = true;
				this.searchFilter.status = this.searchFilter.status === extra ? "all" : extra;
				this.repaintSearch();
				break;
			case "filter-tag":
				this.searchActivated = true;
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
					this.searchActivated = false;
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
	repaintSearch() {
		clearTimeout(this.searchTimer);
		this.searchScroll = 0;
		this.searchLimit = 40;
		if (this.modalKind !== "search") {
			return;
		}
		const active = document.activeElement,
			searchFocused = active?.id === "filter-search",
			pos = (active as HTMLInputElement)?.selectionStart;
		const action = (active as HTMLElement)?.dataset.action,
			extra = (active as HTMLElement)?.dataset.extra;
		const liveToast = document.getElementById("toast");
		if (liveToast && this.dialog.contains(liveToast)) document.body.appendChild(liveToast);
		this.dialog.innerHTML = Panels.search(this);
		this.bindSearchResults();
		if (searchFocused) {
			const n = document.getElementById("filter-search");
			n.focus();
			try {
				(n as HTMLInputElement).setSelectionRange(pos, pos);
			} catch {}
		} else if (action)
			[...this.dialog.querySelectorAll("[data-action]")]
				.find((n?: any) => n.dataset.action === action && n.dataset.extra === extra)
				?.focus({ preventScroll: true });
		this.revealImages(this.dialog);
	}
	input(e?: any) {
		if (e.target.id === "ai-local-draft") {
			this.aiDraft = e.target.value;
			return;
		}
		// While an input method is composing (pinyin, kana), the text is not final: wait for compositionend.
		if (e.isComposing) return;
		if (e.target.dataset.input === "search") {
			this.searchFilter.query = e.target.value;
			this.searchScroll = 0;
			this.searchLimit = 40;
			document.getElementById("filter-result").textContent =
				`${this.searchActivated || this.searchFilter.query.trim() || this.searchFilter.type !== "all" || this.searchFilter.status !== "all" || this.searchFilter.tag ? Object.values(this.searchAll(this.searchFilter.query)).flat().length : 0}${copy("web.panels.e9e0fdc242b4")}`;
			clearTimeout(this.searchTimer);
			this.searchTimer = window.setTimeout(() => {
				this.searchTimer = 0;
				const results = document.getElementById("search-results");
				if (results) {
					results.innerHTML = Panels.searchResults(this);
					results.scrollTop = 0;
					this.revealImages(results);
					this.updateSelection();
				}
			}, 140);
		}
		if (this.editingId && e.target.closest?.(".inline-editor")) {
			const state = document.getElementById("inline-state");
			if (state) state.textContent = copy("web.cloudentry.6bdb4435095e");
			clearTimeout(this.inlineTimer);
			this.inlineTimer = window.setTimeout(() => this.saveInlineEdit(), 500);
		}
	}
	paste(e?: any) {
		// Paste a link or a line anywhere on the desk to keep it.
		if (this.dialog.open || e.target.closest?.("input,textarea,[contenteditable]")) return;
		const text = e.clipboardData?.getData("text/plain");
		if (!text?.trim()) return;
		e.preventDefault();
		this.capture(text);
	}
	key(e?: any) {
		if (e.isComposing) return;
		if (
			(!this.dialog.open || this.modalKind === "search") &&
			!e.target.closest?.("input,textarea,[contenteditable]") &&
			(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
		) {
			if (e.target.closest?.("#selection-bar, #search-selection-bar") && this.selected.size) {
				e.preventDefault();
				this.drag.openMenu([...this.selected], e.target);
				return;
			}
			const card = e.target.closest?.("[data-card]");
			if (card) {
				e.preventDefault();
				this.more(card.dataset.card);
				return;
			}
		}
		if (
			e.key === "Escape" &&
			this.modalKind === "search" &&
			this.dialog.querySelector(".card-more-menu")
		) {
			e.preventDefault();
			this.closeMore(true);
			return;
		}
		if (e.key === "Escape" && this.modalKind === "search" && this.selected.size) {
			e.preventDefault();
			this.action("clear-selection");
			return;
		}
		// Search selection gets the first Escape; only then does a page return home.
		if (e.key === "Escape" && this.dialog.open && this.dialog.classList.contains("page")) {
			e.preventDefault();
			if (this.searchBackground) this.closeNative();
			else this.goTo("home");
			return;
		}
		if (e.key === "Escape" && this.modalKind === "search") {
			e.preventDefault();
			this.closeModal();
			return;
		}
		const radio = e.target.closest?.('[role="radio"]'),
			group = radio?.closest('[role="radiogroup"]');
		if (
			group &&
			["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
		) {
			const radios = [...group.querySelectorAll('[role="radio"]')],
				i = radios.indexOf(radio);
			const index =
				e.key === "Home"
					? 0
					: e.key === "End"
						? radios.length - 1
						: (i + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) + radios.length) %
							radios.length;
			e.preventDefault();
			radios[index].focus();
			radios[index].click();
			return;
		}
		const menu = e.target.closest?.(".card-more-menu");
		if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
			const items = [...menu.querySelectorAll("button")],
				index = items.indexOf(document.activeElement);
			const next =
				e.key === "Home"
					? 0
					: e.key === "End"
						? items.length - 1
						: (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
			e.preventDefault();
			items[next]?.focus();
			return;
		}
		if (e.key === "Escape" && this.grid.querySelector(".card-more-menu")) {
			e.preventDefault();
			this.closeMore(true);
			return;
		}
		if (e.key === "Escape" && this.editingId) {
			e.preventDefault();
			const id = this.editingId;
			this.finishInlineEdit();
			this.grid.querySelector(`[data-card="${CSS.escape(id)}"] .card-title-button`)?.focus();
			return;
		}
		if (this.modalKind === "lightbox" && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
			e.preventDefault();
			this.action("photo-step", this.currentId, e.key === "ArrowLeft" ? "-1" : "1");
			return;
		}
		if (e.key === "Tab" && this.dialog.open && !this.dialog.classList.contains("page")) {
			const focusable = [
				...this.dialog.querySelectorAll(
					'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
				),
			].filter(
				(n?: any) => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden",
			);
			const first = focusable[0],
				last = focusable[focusable.length - 1],
				active = document.activeElement;
			if (first && last) {
				if (e.shiftKey && (active === first || !focusable.includes(active))) {
					e.preventDefault();
					last.focus();
					return;
				}
				if (!e.shiftKey && active === last) {
					e.preventDefault();
					first.focus();
					return;
				}
			}
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
			e.preventDefault();
			if (this.modalKind !== "search") this.openPanel("search");
			return;
		}
		if (e.target.id === "tag-new" && e.key === "Enter") {
			e.preventDefault();
			this.action("add-tag", this.editId);
			return;
		}
		if (e.target.id === "filter-search" && e.key === "Enter") {
			e.preventDefault();
			const first = this.dialog.querySelector(
				'#search-results .card-title-button[data-action="card-open"]',
			);
			if (first) first.click();
			return;
		}
		if (e.target.id === "capture-text" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.action("capture-save");
			return;
		}
		if (e.key === "Escape" && !this.dialog.open) {
			if (this.selected.size) {
				this.selected.clear();
				this.updateSelection();
			}
			return;
		}
		const typing = e.target.closest?.("input,textarea,[contenteditable]");
		if (
			Store.pref("singleKeyShortcuts") &&
			!this.dialog.open &&
			!typing &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey
		) {
			if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				this.openPanel("capture");
				return;
			}
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				this.gestures.refresh();
				return;
			}
			if (e.key === "t" || e.key === "T") {
				e.preventDefault();
				this.action("top");
				return;
			}
		}
		if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-card]")) {
			e.preventDefault();
			this.navigate("#card/" + e.target.dataset.card);
		}
		if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-stack]")) {
			e.preventDefault();
			this.action("stack-open", "", e.target.dataset.stack);
		}
		if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.matches("[data-stack]")) {
			const deck = e.target.querySelector(".deck");
			if (deck && !deck.dataset.busy) {
				e.preventDefault();
				this.deckSettle(deck, e.key === "ArrowRight" ? 1 : -1);
			}
		}
	}
}

export { AppController };
