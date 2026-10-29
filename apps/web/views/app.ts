import type { ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { copy } from "../copy.ts";
import type { AIHeight, AISession } from "../data/ai-conversation.ts";
import { FreshCards } from "../data/cards.ts";
import type { Preferences } from "../data/store.ts";
import { Store } from "../data/store.ts";
import type { ChromeAutoHide } from "../interactions/chrome.ts";
import type { DragManager } from "../interactions/drag.ts";
import type { Gestures } from "../interactions/gestures.ts";
import type { FeedLayout } from "../interactions/layout.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { Playback } from "../interactions/motion-playback.ts";
import {
	type AgentCard,
	AgentHandoff,
	type AgentScope,
	agentFailure,
	agentKey,
	agentPayload,
	openCardLink,
} from "../services/agent-handoff.ts";
import { LocalSync } from "../services/local-sync.ts";
import { appAIMethods } from "./app-ai.ts";
import { appCaptureMethods } from "./app-capture.ts";
import { appCardActionsMethods } from "./app-card-actions.ts";
import { appFeedMethods } from "./app-feed.ts";
import { appFeedUpdatesMethods } from "./app-feed-updates.ts";
import { appFeedbackMethods } from "./app-feedback.ts";
import { appInputMethods } from "./app-input.ts";
import { appLifecycleMethods } from "./app-lifecycle.ts";
import { appPanelsMethods } from "./app-panels.ts";
import { appSelectionMethods } from "./app-selection.ts";
import { appStacksMethods } from "./app-stacks.ts";
import { appSurfacesMethods } from "./app-surfaces.ts";
import type { Filter, ViewDialog, ViewElement } from "./app-types.ts";

export type DetailPosition = {
	id: string;
	kind: "preview" | "reader" | "lightbox";
	scrollTop: number;
	photoIndex: number;
	focus: HTMLElement | null;
	link: string | null;
};

class AppController {
	declare setSearchEditing: AppControllerMethods["setSearchEditing"];
	initializing = false;
	declare loadDemo: AppControllerMethods["loadDemo"];
	declare setPref: AppControllerMethods["setPref"];
	declare replacePanelContent: AppControllerMethods["replacePanelContent"];
	declare repaintSettings: AppControllerMethods["repaintSettings"];
	declare exportAll: AppControllerMethods["exportAll"];
	declare download: AppControllerMethods["download"];
	declare tick: AppControllerMethods["tick"];
	declare setFlag: AppControllerMethods["setFlag"];
	declare syncPreviewButtons: AppControllerMethods["syncPreviewButtons"];
	declare toggleTask: AppControllerMethods["toggleTask"];
	declare setOffline: AppControllerMethods["setOffline"];
	declare checkReminders: AppControllerMethods["checkReminders"];
	declare paintPending: AppControllerMethods["paintPending"];
	declare withFeedAnchor: AppControllerMethods["withFeedAnchor"];
	declare showNew: AppControllerMethods["showNew"];
	declare changeReminder: AppControllerMethods["changeReminder"];
	declare applySelectionAction: AppControllerMethods["applySelectionAction"];
	declare shelfOf: AppControllerMethods["shelfOf"];
	declare shelved: AppControllerMethods["shelved"];
	declare matches: AppControllerMethods["matches"];
	declare searchAll: AppControllerMethods["searchAll"];
	declare searchSuggestions: AppControllerMethods["searchSuggestions"];
	declare searchText: AppControllerMethods["searchText"];
	declare searchHash: AppControllerMethods["searchHash"];
	declare repaintSearchHash: AppControllerMethods["repaintSearchHash"];
	declare syncHomeSearch: AppControllerMethods["syncHomeSearch"];
	declare openHomeSearch: AppControllerMethods["openHomeSearch"];
	declare homeHashOptions: AppControllerMethods["homeHashOptions"];
	declare syncHomeHash: AppControllerMethods["syncHomeHash"];
	declare syncHomeKinds: AppControllerMethods["syncHomeKinds"];
	declare renderAIDock: AppControllerMethods["renderAIDock"];
	declare aiSession: AppControllerMethods["aiSession"];
	declare bindAI: AppControllerMethods["bindAI"];
	declare renderAIConversation: AppControllerMethods["renderAIConversation"];
	declare setAIHeight: AppControllerMethods["setAIHeight"];
	declare aiHeightEvent: AppControllerMethods["aiHeightEvent"];
	declare aiKey: AppControllerMethods["aiKey"];
	declare aiSelectSession: AppControllerMethods["aiSelectSession"];
	declare repaintAIPage: AppControllerMethods["repaintAIPage"];
	declare paintAIPage: AppControllerMethods["paintAIPage"];
	declare desktop: AppControllerMethods["desktop"];
	declare homeKey: AppControllerMethods["homeKey"];
	declare filtering: AppControllerMethods["filtering"];
	declare refreshFeedOrder: AppControllerMethods["refreshFeedOrder"];
	declare filtered: AppControllerMethods["filtered"];
	declare deskView: AppControllerMethods["deskView"];
	declare renderCurrent: AppControllerMethods["renderCurrent"];
	declare revealImages: AppControllerMethods["revealImages"];
	declare refreshCard: AppControllerMethods["refreshCard"];
	declare updateFilterIndicator: AppControllerMethods["updateFilterIndicator"];
	declare homeTopHTML: AppControllerMethods["homeTopHTML"];
	declare homeTabFilter: AppControllerMethods["homeTabFilter"];
	declare homeTab: AppControllerMethods["homeTab"];
	declare agentScope: AppControllerMethods["agentScope"];
	declare agentAction: AppControllerMethods["agentAction"];
	declare agentActionView: AppControllerMethods["agentActionView"];
	declare paintAgentActions: AppControllerMethods["paintAgentActions"];
	declare toast: AppControllerMethods["toast"];
	declare alert: AppControllerMethods["alert"];
	declare showToast: AppControllerMethods["showToast"];
	declare updateToastClock: AppControllerMethods["updateToastClock"];
	declare hideToast: AppControllerMethods["hideToast"];
	declare click: AppControllerMethods["click"];
	declare action: AppControllerMethods["action"];
	declare repaintSearch: AppControllerMethods["repaintSearch"];
	declare input: AppControllerMethods["input"];
	declare key: AppControllerMethods["key"];
	declare init: AppControllerMethods["init"];
	declare bindDialog: AppControllerMethods["bindDialog"];
	declare applyPreferences: AppControllerMethods["applyPreferences"];
	declare announce: AppControllerMethods["announce"];
	declare bindKeyboard: AppControllerMethods["bindKeyboard"];
	declare paintAccount: AppControllerMethods["paintAccount"];
	declare accountRing: AppControllerMethods["accountRing"];
	declare navHTML: AppControllerMethods["navHTML"];
	declare setNav: AppControllerMethods["setNav"];
	declare isPage: AppControllerMethods["isPage"];
	declare goTo: AppControllerMethods["goTo"];
	declare openPanel: AppControllerMethods["openPanel"];
	declare bindSearchResults: AppControllerMethods["bindSearchResults"];
	declare suspendSearch: AppControllerMethods["suspendSearch"];
	declare restoreSearch: AppControllerMethods["restoreSearch"];
	declare discardSearchBackground: AppControllerMethods["discardSearchBackground"];
	declare swapPanel: AppControllerMethods["swapPanel"];
	declare openCard: AppControllerMethods["openCard"];
	declare bindPreview: AppControllerMethods["bindPreview"];
	declare bindReading: AppControllerMethods["bindReading"];
	declare bindSheetChrome: AppControllerMethods["bindSheetChrome"];
	declare bindReader: AppControllerMethods["bindReader"];
	declare updateReading: AppControllerMethods["updateReading"];
	declare selectionAIHTML: AppControllerMethods["selectionAIHTML"];
	declare openSelectionAI: AppControllerMethods["openSelectionAI"];
	declare markSelectionCard: AppControllerMethods["markSelectionCard"];
	declare selectionContext: AppControllerMethods["selectionContext"];
	declare bindSearchSelection: AppControllerMethods["bindSearchSelection"];
	declare select: AppControllerMethods["select"];
	declare updateSelection: AppControllerMethods["updateSelection"];
	declare bindStacks: AppControllerMethods["bindStacks"];
	declare deckParts: AppControllerMethods["deckParts"];
	declare deckFollow: AppControllerMethods["deckFollow"];
	declare deckSettle: AppControllerMethods["deckSettle"];
	declare deckShow: AppControllerMethods["deckShow"];
	declare restoreStacks: AppControllerMethods["restoreStacks"];
	declare navigate: AppControllerMethods["navigate"];
	declare route: AppControllerMethods["route"];
	declare lockPageScroll: AppControllerMethods["lockPageScroll"];
	declare unlockPageScroll: AppControllerMethods["unlockPageScroll"];
	declare openModal: AppControllerMethods["openModal"];
	declare cardRect: AppControllerMethods["cardRect"];
	declare closeNative: AppControllerMethods["closeNative"];
	declare closeAll: AppControllerMethods["closeAll"];
	declare closeToDesk: AppControllerMethods["closeToDesk"];
	declare closeModal: AppControllerMethods["closeModal"];

	agentHandoff = new AgentHandoff();
	declare mode: string;
	declare baseMode: string;
	declare filter: Filter;
	searchFilter = { type: "all", status: "all", tag: "", query: "", pinned: false };
	homeMenuOpen = false;
	homeSearchTimer = 0;
	/** Highlighted row of the top-bar # list. */
	homeHashIndex = 0;
	searchScroll = 0;
	searchLimit = 40;
	searchBackground?: HTMLDialogElement;
	searchFocus?: HTMLElement;
	aiSelectionIds: string[] = [];
	aiDraft = "";
	/** The built-in AI is not connected: no sessions arrive, nothing is sent. */
	aiConnected = false;
	aiSessions: AISession[] = [];
	aiSessionId: string | null = null;
	aiHeight: AIHeight = "line";
	aiListOpen = false;
	aiHistoryOpen = false;
	closingCardRoute = "";
	homeSelected = new Set<string>();
	searchSelected = new Set<string>();
	searchSelectAnchor = "";
	selectionBars = new WeakMap<HTMLElement, { visible: boolean; animation: Playback | null }>();
	get selected() {
		return this.modalKind === "search" ? this.searchSelected : this.homeSelected;
	}
	set selected(value: Set<string>) {
		if (this.modalKind === "search") this.searchSelected = value;
		else this.homeSelected = value;
	}
	declare pendingCards: Card[];
	declare pullRefreshFeedback: boolean;
	declare refreshBusy: boolean;
	declare openStacks: Set<string>;
	declare modalKind: string;
	declare currentId: string;
	declare panelReturn: () => void;
	declare lastFocus: Element;
	declare lastActivity: number;
	declare modalToken: number;
	declare routeScroll: Record<string, number>;
	declare photoIndex: number;
	declare sort: Preferences["sort"];
	declare feedNow: number;
	declare pendingReminders: string[];
	declare settingsGroup: string;
	declare navKey: string;
	declare navTimer: number;
	declare navOpenTimer: number;
	declare loadedImages: Set<string>;
	declare grid: ViewElement;
	declare dialog: ViewDialog;
	declare themeQuery: MediaQueryList;
	declare layout: FeedLayout;
	declare pageLimit: number;
	declare drag: DragManager;
	declare gestures: Gestures;
	declare hasMore: boolean;
	declare readTicker: ReturnType<typeof setInterval>;
	declare railHide: ChromeAutoHide;
	declare sheetHide: ChromeAutoHide;
	declare lastRouteHash: string;
	declare skipReturnMotion: boolean;
	declare sheetLeaving: boolean;
	declare lockedScroll: number;
	pageScrollLocked = false;
	pageOverflow = "";
	frozenTranslate = "";
	previewSizeObserver?: ResizeObserver;
	declare editId: string;
	declare editTags: Set<string>;
	declare toastTimer: number;
	toastRemaining = 0;
	toastStarted = 0;
	toastHover = false;
	homePositions: Record<string, { scroll: number; limit: number }> = {};
	declare toastSeq: number;
	declare selectAnchor: string;
	previewTrail: string[] = [];
	detailPositions = new Map<string, DetailPosition>();
	detailScope = "";
	declare closingAll: boolean;
	declare bulkEditIds: string[];
	declare clockMinute: number;
	declare stackIndex: Map<string, number>;
	declare stackDragUntil: number;
	declare searchTimer: number;
	cloudSavedAccount?: boolean;
	cloudSettingsContent?: ReactNode;

	constructor() {
		this.mode = window.__PAGE__ || "feed";
		this.baseMode = this.mode;
		this.filter = { type: "all", status: "all", tag: "", query: "", kind: "all", mark: "all" };
		this.selected = new Set<string>();
		this.pendingCards = [];
		this.refreshBusy = false;
		this.openStacks = new Set<string>();
		this.modalKind = "";
		this.currentId = "";
		this.panelReturn = null;
		this.lastFocus = null;
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
		this.loadedImages = new Set<string>();
	}

	feedSnapshot: { cards: Card[]; stacks: Map<string, Card[]> } | null = null;
	preserveFeed = false;
	feedOrder: Map<string, number> | null = null;
	feedOrderSort = "";
	async readAgentCard(id: string, _scope: AgentScope): Promise<AgentCard> {
		const card = Store.card(id);
		if (!card) throw agentFailure("card_unavailable", copy("web.agent.noCard"));
		return card;
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
	async openExternal(c?: Card, url: string = c?.url) {
		try {
			return await openCardLink(url, window.__SILL_HOST__, (value) =>
				window.open(value, "_blank", "noopener,noreferrer"),
			);
		} catch (error) {
			this.alert(error.message || copy("web.agent.linkUnknown"));
			return false;
		}
	}
	/* ——— Refresh, new content, reminders ——— */
	async refresh({ feedback = "default" } = {}) {
		const quiet = feedback === "pull";
		if (this.refreshBusy) return false;
		this.refreshBusy = true;
		this.pullRefreshFeedback = quiet;
		// Background work shows as a thin arc around the face; success needs no sentence.
		const dock = document.getElementById("dock");
		const feedbackReady = quiet
			? Promise.resolve()
			: new Promise<void>((resolve) =>
					window.setTimeout(resolve, MotionEngine.time("delay-loading")),
				);
		dock.classList.remove("is-done");
		let finished = false;
		if (!quiet) {
			dock.classList.add("is-busy");
			MotionEngine.loading(dock.querySelector(".orb-arc circle"), true, 1100);
		} else {
			dock.classList.remove("is-busy", "is-done");
			MotionEngine.loading(dock.querySelector(".orb-arc circle"), false);
			for (const id of ["offline"]) {
				const notice = document.getElementById(id);
				if (notice) notice.hidden = true;
			}
		}
		try {
			if (window.__QG_LOCAL__) {
				if (quiet) {
					// A changed snapshot renders through LocalSync.adopt; an unchanged read does not.
					this.feedOrder = null;
					this.feedNow = Date.now();
				}
				const result = await LocalSync.refresh(true);
				if (result === false) return false;
				if (!quiet) this.refreshFeedOrder();
				else this.checkReminders?.();
			} else {
				// Demo: the next unseen sample arrives as new content; nothing jumps into the desk.
				const next = FreshCards.find(
					(f) => !Store.card(f.id) && !this.pendingCards.some((p) => p.id === f.id),
				);
				if (next) this.pendingCards.push({ ...next, time: Date.now() });
				this.refreshFeedOrder();
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
			await feedbackReady;
			this.refreshBusy = false;
			this.pullRefreshFeedback = false;
			dock.classList.remove("is-busy");
			MotionEngine.loading(dock.querySelector(".orb-arc circle"), false);
			if (!quiet && finished) {
				dock.classList.add("is-done");
				window.setTimeout(() => dock.classList.remove("is-done"), 900);
			}
		}
	}
}

export { AppController };

type AppControllerMethodImplementations = typeof appLifecycleMethods &
	typeof appFeedMethods &
	typeof appSelectionMethods &
	typeof appSurfacesMethods &
	typeof appPanelsMethods &
	typeof appFeedbackMethods &
	typeof appCardActionsMethods &
	typeof appFeedUpdatesMethods &
	typeof appCaptureMethods &
	typeof appStacksMethods &
	typeof appInputMethods &
	typeof appAIMethods;
type AppControllerMethods = {
	[K in keyof AppControllerMethodImplementations]: OmitThisParameter<
		AppControllerMethodImplementations[K]
	>;
};
for (const methods of [
	appLifecycleMethods,
	appFeedMethods,
	appSelectionMethods,
	appSurfacesMethods,
	appPanelsMethods,
	appFeedbackMethods,
	appCardActionsMethods,
	appFeedUpdatesMethods,
	appCaptureMethods,
	appStacksMethods,
	appInputMethods,
	appAIMethods,
]) {
	for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
		Object.defineProperty(AppController.prototype, name, { ...descriptor, enumerable: false });
	}
}
