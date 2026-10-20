import { Store } from "../../data/store.ts";
import { FeedPolicy } from "../../services/feed-policy.ts";
import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function filter(this: AppController) {
	this.openPanel("search");
}

function nav(this: AppController, { extra }: ActionContext) {
	this.goTo(extra);
}

function capture(this: AppController) {
	this.openPanel("capture");
}

function captureSave(this: AppController) {
	const text = (document.getElementById("capture-text") as HTMLInputElement)?.value;
	if (!text?.trim()) return;
	this.closeNative();
	this.capture(text);
}

function top(this: AppController) {
	window.scrollTo({ top: 0, behavior: "instant" });
	this.railHide?.syncPosition();
	this.railHide?.show();
}

function closeHomeMenu(this: AppController, focusToggle = false) {
	const menu = document.getElementById("home-menu");
	const toggle = document.getElementById("home-menu-toggle");
	if (!menu || menu.hidden) return;
	menu.hidden = true;
	toggle?.setAttribute("aria-expanded", "false");
	this.homeMenuOpen = false;
	if (focusToggle) toggle?.focus({ preventScroll: true });
}

/** The ⌄ after Sill opens the tab menu; Escape or a click outside closes it without a change. */
function homeMenu(this: AppController) {
	const menu = document.getElementById("home-menu");
	const toggle = document.getElementById("home-menu-toggle");
	if (!menu) return;
	if (!menu.hidden) {
		closeHomeMenu.call(this);
		return;
	}
	menu.hidden = false;
	toggle?.setAttribute("aria-expanded", "true");
	this.homeMenuOpen = true;
	const outside = (e: PointerEvent) => {
		if (menu.contains(e.target as Node) || toggle?.contains(e.target as Node)) return;
		document.removeEventListener("pointerdown", outside, true);
		closeHomeMenu.call(this);
	};
	document.addEventListener("pointerdown", outside, true);
}

function homeTab(this: AppController, { extra }: ActionContext) {
	const tab = this.homeTabFilter(extra);
	const fromMenu = !document.getElementById("home-menu")?.hidden;
	closeHomeMenu.call(this, fromMenu);
	if (!tab || this.homeTab() === extra) return;
	this.homePositions[this.homeTab() || "all"] = { scroll: window.scrollY, limit: this.pageLimit };
	const saved = this.homePositions[extra];
	this.pageLimit = saved?.limit || 40;
	// Desktop keeps the typed text: the tab is a token beside it (ADR 0049).
	this.filter = { ...this.filter, ...tab, tag: "", query: this.desktop() ? this.filter.query : "" };
	this.renderCurrent(false);
	window.scrollTo({ top: saved?.scroll || 0, behavior: "instant" });
	this.railHide?.syncPosition();
}

function homeSearchClear(this: AppController) {
	const input = document.getElementById("home-search") as HTMLInputElement | null;
	if (input) input.value = "";
	this.filter = { ...this.filter, query: "" };
	this.renderCurrent(false);
	input?.focus({ preventScroll: true });
}

function cardOpen(this: AppController, { id }: ActionContext) {
	this.navigate("#card/" + id);
}

function reader(this: AppController, { id }: ActionContext) {
	this.navigate("#read/" + id);
}

function close(this: AppController) {
	this.closeModal();
}

function closeAll(this: AppController) {
	this.closeToDesk();
}

function stackOpen(this: AppController, { extra }: ActionContext) {
	this.openStacks.add(extra);
	this.withFeedAnchor(() => {}, true);
	this.grid
		.querySelector(`[data-stack-open="${CSS.escape(extra)}"] .card-title-button`)
		?.focus({ preventScroll: true });
}

function stackClose(this: AppController, { extra }: ActionContext) {
	this.openStacks.delete(extra);
	this.withFeedAnchor(() => {}, true);
	this.grid.querySelector(`[data-stack="${CSS.escape(extra)}"]`)?.focus({ preventScroll: true });
}

function filterType(this: AppController, { extra }: ActionContext) {
	this.searchFilter.type = extra;
	this.searchFilter.pinned = false;
	this.repaintSearch();
}

/** A category card becomes an ink token in the search bar (ADR 0048). */
function searchCategory(this: AppController, { extra }: ActionContext) {
	this.searchFilter.type = extra;
	this.searchFilter.pinned = true;
	this.repaintSearch();
}

function focusSearchInput() {
	const input = document.getElementById("filter-search") as HTMLInputElement | null;
	if (!input) return;
	input.focus({ preventScroll: true });
	input.setSelectionRange(input.value.length, input.value.length);
}

/** A picked # option becomes an accent token; the typed #fragment leaves the text. */
function searchHash(this: AppController, { extra }: ActionContext) {
	const at = extra.indexOf(":");
	const kind = extra.slice(0, at),
		value = extra.slice(at + 1);
	if (kind === "status") this.searchFilter.status = value;
	else if (kind === "tag") this.searchFilter.tag = value;
	else return;
	this.searchFilter.query = this.searchFilter.query.replace(/(^|\s)#\S*$/, "$1").trimEnd();
	this.repaintSearch();
	focusSearchInput();
}

function searchUntoken(this: AppController, { extra }: ActionContext) {
	if (extra === "type") {
		this.searchFilter.type = "all";
		this.searchFilter.pinned = false;
	} else if (extra === "status") this.searchFilter.status = "all";
	else if (extra === "tag") this.searchFilter.tag = "";
	this.repaintSearch();
	focusSearchInput();
}

/** The results page's close returns to the search home with no conditions. */
function searchReset(this: AppController) {
	this.searchFilter = { type: "all", status: "all", tag: "", query: "", pinned: false };
	this.repaintSearch();
	(document.activeElement as HTMLElement)?.blur?.();
}

function filterStatus(this: AppController, { extra }: ActionContext) {
	this.searchFilter.status = this.searchFilter.status === extra ? "all" : extra;
	this.repaintSearch();
}

function filterTag(this: AppController, { extra }: ActionContext) {
	this.searchFilter.tag = this.searchFilter.tag === extra ? "" : extra;
	this.repaintSearch();
}

function clearQuery(this: AppController) {
	this.searchFilter.query = "";
	this.repaintSearch();
	document.getElementById("filter-search")?.focus();
}

function clearFilter(this: AppController) {
	if (this.modalKind === "search") {
		this.searchFilter = { type: "all", status: "all", tag: "", query: "", pinned: false };
		this.repaintSearch();
	} else {
		this.filter = { type: "all", status: "all", tag: "", query: "" };
		this.withFeedAnchor(() => {}, true);
	}
}

function applyFilter(this: AppController) {
	this.closeNative();
	window.scrollTo(0, 0);
}

function sortFeed(this: AppController, { extra }: ActionContext) {
	if (FeedPolicy.sorts.includes(extra)) {
		Store.setPref("sort", extra);
		this.applyPreferences();
		this.feedNow = Date.now();
		this.withFeedAnchor(() => {}, true);
	}
}

export const navigationActions = {
	filter: filter,
	search: filter,
	nav: nav,
	capture: capture,
	"capture-save": captureSave,
	top: top,
	"home-tab": homeTab,
	"home-menu": homeMenu,
	"home-search-clear": homeSearchClear,
	"card-open": cardOpen,
	preview: cardOpen,
	reader: reader,
	close: close,
	"close-all": closeAll,
	"stack-open": stackOpen,
	"stack-close": stackClose,
	"filter-type": filterType,
	"search-category": searchCategory,
	"search-hash": searchHash,
	"search-untoken": searchUntoken,
	"search-reset": searchReset,
	"filter-status": filterStatus,
	"filter-tag": filterTag,
	"clear-query": clearQuery,
	"clear-filter": clearFilter,
	"apply-filter": applyFilter,
	"sort-feed": sortFeed,
} satisfies Record<string, ActionHandler>;
