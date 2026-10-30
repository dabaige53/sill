import { animate, motionValue } from "motion";
import tokens from "../../../../design-system/tokens.json" with { type: "json" };
import { Store } from "../../data/store.ts";
import { MotionEngine } from "../../interactions/motion.ts";
import { capturePhoneSearch } from "../../interactions/phone-search-motion.ts";
import { FeedPolicy } from "../../services/feed-policy.ts";
import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

type HomeReturn = { tappedAt: number | null; refresh: boolean; cancel?: () => void };
const homeReturns = new WeakMap<AppController, HomeReturn>();

/** Keep one journey to the top; the second tap adds refresh without restarting the scroll. */
function returnHomeTop(app: AppController, state: HomeReturn) {
	if (state.cancel) return;
	app.railHide?.show();
	const finish = () => {
		app.railHide?.syncPosition();
		app.railHide?.show();
		const refresh = state.refresh;
		state.refresh = false;
		if (refresh && !app.dialog.open && app.navKey === "home" && window.scrollY <= 1)
			void app.gestures.refresh();
	};
	const distance = Math.max(0, window.scrollY);
	if (distance <= 1) {
		window.scrollTo({ top: 0, behavior: "instant" });
		finish();
		return;
	}
	const config = tokens.motion.homeReturn;
	const position = motionValue(distance);
	let active = true;
	let playback: ReturnType<typeof animate> | undefined;
	const cleanup = () => {
		unsubscribe();
		position.destroy();
		state.cancel = undefined;
		for (const type of ["pointerdown", "touchstart", "wheel", "keydown", "popstate", "pagehide"])
			window.removeEventListener(type, interrupt, true);
	};
	const cancel = () => {
		if (!active) return;
		active = false;
		playback?.stop();
		state.refresh = false;
		state.tappedAt = null;
		cleanup();
	};
	const interrupt = (event: Event) => {
		// The second tap belongs to this journey; other input immediately returns control to the user.
		if (
			(event.type === "pointerdown" || event.type === "touchstart") &&
			(event.target as Element)?.closest?.('#nav [data-extra="home"]')
		)
			return;
		cancel();
	};
	const unsubscribe = position.on("change", (top) => {
		if (app.dialog.open || app.navKey !== "home") return cancel();
		window.scrollTo({ top, behavior: "instant" });
	});
	state.cancel = cancel;
	for (const type of ["pointerdown", "touchstart", "wheel", "keydown", "popstate", "pagehide"])
		window.addEventListener(type, interrupt, { capture: true, passive: true });
	playback = animate(position, 0, {
		duration:
			Math.min(
				config.maxDurationMs,
				config.durationMs + (distance / innerHeight) * config.perScreenMs,
			) / 1000,
		ease: config.easing as [number, number, number, number],
		onComplete: () => {
			if (!active) return;
			active = false;
			cleanup();
			finish();
		},
	});
}

function filter(this: AppController) {
	this.openPanel("search");
}

function nav(this: AppController, { extra, el, event }: ActionContext) {
	let state = homeReturns.get(this);
	const phoneHome =
		extra === "home" &&
		!this.desktop() &&
		el?.closest("#nav") &&
		event instanceof MouseEvent &&
		event.detail > 0;
	if (!phoneHome) {
		state?.cancel?.();
		if (state) state.tappedAt = null;
		this.goTo(extra);
		return;
	}
	if (!state) {
		state = { tappedAt: null, refresh: false };
		homeReturns.set(this, state);
	}
	const now = event.timeStamp;
	const double =
		state.tappedAt !== null && now - state.tappedAt <= tokens.motion.homeReturn.doubleTapMs;
	state.tappedAt = double ? null : now;
	state.refresh ||= double;
	if (this.dialog.open) this.goTo("home");
	else {
		this.setNav("home");
		returnHomeTop(this, state);
	}
}

function top(this: AppController) {
	homeReturns.get(this)?.cancel?.();
	window.scrollTo({
		top: 0,
		behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
	});
	this.railHide?.syncPosition();
	this.railHide?.show();
}

function closeHomeMenu(this: AppController, focusToggle = false) {
	const menu = document.getElementById("home-menu");
	const toggle = document.getElementById("home-menu-toggle");
	if (!menu || !this.homeMenuOpen) return;
	MotionEngine.popover(menu, false);
	toggle?.setAttribute("aria-expanded", "false");
	this.homeMenuOpen = false;
	if (focusToggle) toggle?.focus({ preventScroll: true });
}

/** The ⌄ after Sill opens the tab menu; Escape or a click outside closes it without a change. */
function homeMenu(this: AppController) {
	const menu = document.getElementById("home-menu");
	const toggle = document.getElementById("home-menu-toggle");
	if (!menu) return;
	if (this.homeMenuOpen) {
		closeHomeMenu.call(this);
		return;
	}
	MotionEngine.popover(menu, true);
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
	// # conditions and the type chip stay with the text; the phone tab row starts clean.
	this.filter = this.desktop()
		? { ...this.filter, ...tab }
		: { ...this.filter, ...tab, tag: "", query: "", kind: "all", mark: "all" };
	if (this.filter.mark === this.filter.status) this.filter.mark = "all";
	this.withFeedAnchor(() => {}, true);
	window.scrollTo({ top: saved?.scroll || 0, behavior: "instant" });
	this.railHide?.syncPosition();
}

function homeSearchClear(this: AppController) {
	const input = document.getElementById("home-search") as HTMLInputElement | null;
	if (input) input.value = "";
	this.filter = { ...this.filter, query: "", kind: "all" };
	this.renderCurrent(false);
	input?.focus({ preventScroll: true });
	this.openHomeSearch(true);
}

/** Desktop search conditions change the card area in place, from the top. */
function renderHomeSearch(this: AppController) {
	this.pageLimit = 40;
	this.withFeedAnchor(() => {}, true);
	window.scrollTo({ top: 0, behavior: "instant" });
	this.railHide?.syncPosition();
}

function focusHomeSearch() {
	const input = document.getElementById("home-search") as HTMLInputElement | null;
	if (!input) return;
	input.focus({ preventScroll: true });
	input.setSelectionRange(input.value.length, input.value.length);
}

/** A type chip under the top bar narrows the results to one card type. */
function homeKind(this: AppController, { extra }: ActionContext) {
	if (this.filter.kind === extra) return;
	this.filter = { ...this.filter, kind: extra };
	renderHomeSearch.call(this);
}

/** A picked # option becomes an accent token; the typed #fragment leaves the text. */
/** A card suggestion opens that card; a # option becomes an accent token and leaves the text. */
function homeHash(this: AppController, { extra }: ActionContext) {
	const at = extra.indexOf(":");
	const kind = extra.slice(0, at),
		value = extra.slice(at + 1);
	if (kind === "card") {
		this.openHomeSearch(false);
		this.navigate("#card/" + value);
		return;
	}
	if (kind !== "status" && kind !== "tag") return;
	const query = this.filter.query.replace(/#[^\s#]*$/, "").trimEnd();
	this.filter = {
		...this.filter,
		query,
		...(kind === "status"
			? { mark: value === this.filter.status ? "all" : value }
			: { tag: value }),
	};
	const input = document.getElementById("home-search") as HTMLInputElement | null;
	if (input) input.value = query;
	this.homeHashIndex = 0;
	this.openHomeSearch(false);
	renderHomeSearch.call(this);
	focusHomeSearch();
}

function homeUntoken(this: AppController, { extra }: ActionContext) {
	if (extra === "mark") this.filter = { ...this.filter, mark: "all" };
	else if (extra === "tag") this.filter = { ...this.filter, tag: "" };
	else return;
	renderHomeSearch.call(this);
	focusHomeSearch();
}

function cardOpen(this: AppController, { id }: ActionContext) {
	this.navigate("#card/" + id);
}

function reader(this: AppController, { id }: ActionContext) {
	this.navigate("#read/" + id);
}

function close(this: AppController) {
	// The tags layer sits over the card; its × closes only the layer.
	if (this.editorLayer?.open) this.closeEditor();
	else this.closeModal();
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
	if (this.searchFilter.type === extra && !this.searchFilter.pinned) return;
	this.searchFilter.type = extra;
	this.searchFilter.pinned = false;
	this.repaintSearch();
}

/** A category card becomes an ink token in the search bar (ADR 0048); the bar moves up like typing, without the keyboard. */
function searchCategory(this: AppController, { extra }: ActionContext) {
	const pose = !this.desktop() ? capturePhoneSearch(this.dialog, true) : undefined;
	this.searchFilter.type = extra;
	this.searchFilter.pinned = true;
	this.repaintSearch();
	this.setSearchEditing(true, pose, false);
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
	this.searchFilter.query = this.searchFilter.query.replace(/#[^\s#]*$/, "").trimEnd();
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
	const pose = !this.desktop() ? capturePhoneSearch(this.dialog, true) : undefined;
	(document.activeElement as HTMLElement)?.blur?.();
	this.searchFilter = { type: "all", status: "all", tag: "", query: "", pinned: false };
	this.repaintSearch();
	this.setSearchEditing(false, pose);
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
		this.filter = { type: "all", status: "all", tag: "", query: "", kind: "all", mark: "all" };
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
	top: top,
	"home-tab": homeTab,
	"home-menu": homeMenu,
	"home-search-clear": homeSearchClear,
	"home-kind": homeKind,
	"home-hash": homeHash,
	"home-untoken": homeUntoken,
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
