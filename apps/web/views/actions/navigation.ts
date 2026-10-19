import { Store } from "../../data/store.ts";
import { MotionEngine } from "../../interactions/motion.ts";
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
	window.scrollTo({ top: 0, behavior: MotionEngine.reduced ? "instant" : "smooth" });
}

function homeTab(this: AppController, { extra }: ActionContext) {
	const tab = this.homeTabFilter(extra);
	if (!tab || this.homeTab() === extra) return;
	this.homePositions[this.homeTab() || "all"] = { scroll: window.scrollY, limit: this.pageLimit };
	const saved = this.homePositions[extra];
	this.pageLimit = saved?.limit || 40;
	this.filter = { ...this.filter, ...tab, tag: "", query: "" };
	this.renderCurrent(false);
	window.scrollTo({ top: saved?.scroll || 0, behavior: "instant" });
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
	this.repaintSearch();
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
		this.searchFilter = { type: "all", status: "all", tag: "", query: "" };
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
	"card-open": cardOpen,
	preview: cardOpen,
	reader: reader,
	close: close,
	"close-all": closeAll,
	"stack-open": stackOpen,
	"stack-close": stackClose,
	"filter-type": filterType,
	"filter-status": filterStatus,
	"filter-tag": filterTag,
	"clear-query": clearQuery,
	"clear-filter": clearFilter,
	"apply-filter": applyFilter,
	"sort-feed": sortFeed,
} satisfies Record<string, ActionHandler>;
