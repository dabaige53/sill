import { ToastSurface } from "../../../apps/web/atoms/feedback.tsx";
import { SelectionBar } from "../../../apps/web/atoms/selection.tsx";
import { CardView, OpenStackView, StackView } from "../../../apps/web/cards/components.tsx";
import { copy } from "../../../apps/web/copy.ts";
import { Store } from "../../../apps/web/data/store.ts";
import { toolbarTips } from "../../../apps/web/interactions/chrome.ts";
import { DragManager } from "../../../apps/web/interactions/drag.ts";
import { Gestures } from "../../../apps/web/interactions/gestures.ts";
import { FeedLayout } from "../../../apps/web/interactions/layout.ts";
import { MotionEngine } from "../../../apps/web/interactions/motion.ts";
import { toggle } from "../../../apps/web/interactions/panel-primitives.tsx";
import { PanelViews } from "../../../apps/web/interactions/panels-components.tsx";
import { SettingRow } from "../../../apps/web/interactions/setting-row.tsx";
import { animateToggle, captureToggle } from "../../../apps/web/interactions/toggle-motion.ts";
import { FeedPolicy } from "../../../apps/web/services/feed-policy.ts";
import { AppController } from "../../../apps/web/views/app.ts";
import type { TargetEvent } from "../../../apps/web/views/app-types.ts";
import { renderView } from "../../../apps/web/views/react-renderer.ts";
import { AIDock } from "../../../apps/web/views/shell.tsx";
import { type AnimationEntry, t } from "./catalog.ts";
import { ExampleCover } from "./covers.tsx";

export type ExampleRuntime = {
	event: (name: string) => void;
	pending: () => boolean;
	canTrigger: (name: string) => boolean;
};

/** Only local fixture state is adapted. The product still owns rendering, gestures and playback. */
export function mountExample(
	entry: AnimationEntry,
	canvas: HTMLElement,
	cover = false,
): ExampleRuntime {
	const app = new AppController();
	const id = entry.id;
	if (id === "menu.card" || id === "selection.context") {
		canvas.textContent = "此菜单交互已取消";
		return { event() {}, pending: () => false, canTrigger: () => false };
	}
	const card = Store.card("motion-card-1");
	let list = Store.state.cards.slice(0, 3);
	if (id === "feed.first-entry" && !cover) list = [];
	let sort = "priority";
	let request: ((success: boolean) => void) | undefined;
	let serial = 0;
	const island = document.createElement("div");
	island.className = "motion-island";
	canvas.append(island);
	const helpers = document.createElement("div");
	canvas.append(helpers);
	renderView(
		helpers,
		<>
			<dialog id="modal" aria-labelledby="modal-title" />
			{id !== "feedback.toast" && <ToastSurface />}
			<div className="sr-only" id="announcer" aria-live="polite" />
		</>,
	);
	app.dialog = document.getElementById("modal") as typeof app.dialog;
	app.grid = island as typeof app.grid;
	app.feedNow = Date.UTC(2026, 9, 25, 4);
	app.applyPreferences();
	// Do not start the product lifecycle: it loads storage, connects sync and installs global chrome.
	app.checkReminders = () => {};
	app.syncHomeHash = () => {};
	app.setNav = () => {};
	if (id !== "ai.dock-height") app.aiHeightEvent = () => {};
	app.renderCurrent = () => {
		if (id === "menu.scope")
			document.querySelectorAll<HTMLElement>(".home-menu-item").forEach((button) => {
				button.setAttribute("aria-checked", String(button.dataset.extra === app.homeTab()));
			});
		else paintCards();
	};
	app.refreshCard = () => {
		if (id === "task.mark" || id === "control.press") renderView(island, <ExampleCover id={id} />);
		else if (!app.dialog.open) paintCards();
	};
	app.refresh = async () =>
		new Promise<boolean>((resolve) => {
			request = resolve;
		});
	app.navigate = (hash: string) => {
		const match = hash.match(/^#(card|read)\/(.+)$/);
		if (match) app.openCard(match[2], match[1] === "read");
	};
	app.closeModal = () => {
		if (app.sheetLeaving) return;
		if (app.panelReturn && !["preview", "reader", "lightbox"].includes(app.modalKind)) {
			const back = app.panelReturn;
			app.panelReturn = null;
			back();
			return;
		}
		const previous = app.previewTrail.at(-1);
		if (previous) app.openCard(previous);
		else app.closeNative();
	};
	app.closeToDesk = (animate = true) => app.closeNative(animate);
	const modalExamples = [
		"reader.tools",
		"reader.gesture",
		"detail.card-flight",
		"detail.navigate",
		"detail.resize",
		"detail.sheet",
		"reader.outline",
		"media.scroll-collapse",
	];
	const feeds = [
		"feed.reorder",
		"feed.first-entry",
		"feed.arrival",
		"feed.departure",
		"content.fade",
		"refresh.pull",
	];
	const dragging = [
		"drag.selection",
		"drag.ai-target",
		"selection.bar",
		"ai.context-entry",
	].includes(id);
	const dockOnly = id === "ai.dock-collapse" || id === "ai.dock-height";
	const sortingControl = () => (
		<SettingRow
			label={copy("web.settings.floatTimely")}
			side={toggle("floatTimely", Store.pref("floatTimely"), copy("web.settings.floatTimely"))}
		/>
	);
	function paintCards() {
		if (id === "deck.swipe") {
			renderView(
				app.grid,
				app.openStacks.has("motion-stack") ? (
					<OpenStackView stackKey="motion-stack" cards={list} />
				) : (
					<StackView stackKey="motion-stack" cards={list} />
				),
			);
			app.restoreStacks();
			return;
		}
		if (!feeds.includes(id) && !dragging && !modalExamples.includes(id)) return;
		const grid = document.getElementById("feed-grid") || island;
		renderView(
			grid,
			list.map((c) => <CardView key={c.id} card={c} />),
		);
		app.layout?.layout();
	}
	if (feeds.includes(id) || dragging || modalExamples.includes(id)) {
		const selectedCard =
			id === "media.scroll-collapse"
				? Store.card("motion-podcast")
				: id === "detail.navigate"
					? Store.card("motion-related")
					: id === "reader.tools"
						? Store.card("motion-reading")
						: card;
		if (modalExamples.includes(id)) list = [selectedCard];
		if (id === "content.fade" || id === "ai.context-entry") list = [card];
		if (id === "feed.reorder") list = FeedPolicy.sort(list, sort, Store.state.items, app.feedNow);
		renderView(
			island,
			<>
				{id === "feed.reorder" && <div className="motion-sort-control" />}
				<div id="feed-grid" className="motion-feed" />
				{dragging && (
					<div id="dock">
						<SelectionBar />
						<AIDock />
					</div>
				)}
			</>,
		);
		if (id === "feed.reorder")
			renderView(island.querySelector(".motion-sort-control"), sortingControl());
		app.grid = document.getElementById("feed-grid") as typeof app.grid;
		paintCards();
		app.layout = new FeedLayout(app.grid);
		app.layout.layout();
	} else if (id === "deck.swipe") {
		renderView(
			island,
			<div id="feed-grid" className="motion-deck">
				<StackView stackKey="motion-stack" cards={list} />
			</div>,
		);
		app.grid = document.getElementById("feed-grid") as typeof app.grid;
	} else if (dockOnly)
		renderView(
			island,
			<div id="dock">
				<AIDock />
			</div>,
		);
	else renderView(island, <ExampleCover id={id} />);
	if (id === "ai.dock-height") {
		app.aiSessions = [
			{
				id: "motion-session",
				title: t("fixtureSession"),
				updatedAt: app.feedNow,
				running: false,
				messages: [{ id: "motion-message", role: "you", text: t("fixtureMessage") }],
			},
		];
		app.aiSessionId = "motion-session";
		app.bindAI();
	}

	if (cover) {
		document.documentElement.dataset.inputModality = "keyboard";
		if (
			[
				"reader.tools",
				"reader.gesture",
				"reader.outline",
				"detail.resize",
				"media.scroll-collapse",
			].includes(id)
		) {
			app.currentId =
				id === "media.scroll-collapse"
					? "motion-podcast"
					: id === "reader.tools"
						? "motion-reading"
						: card.id;
			const preview =
				id === "media.scroll-collapse" ||
				id === "detail.resize" ||
				(id === "reader.outline" && !app.desktop());
			const component = preview
				? PanelViews.preview(app, Store.card(app.currentId))
				: PanelViews.reader(app, Store.card(app.currentId), false);
			app.openModal(component, preview ? "preview" : "reader");
			app.dialog.inert = true;
		}
		if (id === "menu.scope") document.getElementById("home-menu").hidden = false;
		if (id === "refresh.pull") {
			app.gestures = new Gestures(app);
			const ring = document.getElementById("pull-ring");
			ring.dataset.state = "loading";
			ring.style.opacity = "1";
		}
		island.inert = true;
		if (id === "notice.new-content") {
			app.pendingCards = list.slice(0, 2);
			app.paintPending();
		}
		if (id === "drag.selection" || id === "selection.bar") {
			for (const card of list.slice(0, 2)) app.selected.add(card.id);
			app.updateSelection();
		}
		if (id === "ai.context-entry") {
			app.aiSelectionIds = [card.id];
			app.renderAIDock();
		}
		const shown = island.querySelector<HTMLElement>("#toast,#offline");
		if (shown) {
			shown.hidden = false;
			if (id === "feedback.toast")
				shown.querySelector("#toast-text").textContent = copy("web.bookmark");
		}
		return { event() {}, pending: () => false, canTrigger: () => false };
	}

	app.bindDialog();
	if (modalExamples.includes(id) || id === "feedback.toast" || id === "refresh.pull")
		app.gestures = new Gestures(app);
	if (dragging) app.drag = new DragManager(app);
	if (id === "deck.swipe") app.bindStacks();
	document
		.getElementById("ai-dock-input")
		?.addEventListener("input", (event) => app.input(event as unknown as TargetEvent<Event>));
	toolbarTips(document);
	const toast = document.getElementById("toast");
	for (const [event, hover] of [
		["pointerenter", true],
		["pointerleave", false],
	] as const)
		toast.addEventListener(event, () => {
			app.toastHover = hover;
			app.updateToastClock();
		});
	for (const name of ["focusin", "focusout"])
		toast.addEventListener(name, () => queueMicrotask(() => app.updateToastClock()));
	window.addEventListener("blur", () => app.updateToastClock(true));
	window.addEventListener("focus", () => app.updateToastClock());
	document.addEventListener("visibilitychange", () => app.updateToastClock());

	const closeScope = (focus = false) => {
		const menu = document.getElementById("home-menu");
		if (!menu || !app.homeMenuOpen) return;
		app.action("home-menu");
		if (focus) document.getElementById("home-menu-toggle").focus();
	};
	document.addEventListener("keydown", (event) => {
		if (id === "ai.dock-height" && app.aiKey(event)) return;
		if (event.key === "Escape") {
			closeScope(true);
		}
		if (id === "menu.scope" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
			const menu = document.getElementById("home-menu");
			if (menu.hidden) return;
			event.preventDefault();
			const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button")];
			const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
			const index =
				event.key === "Home"
					? 0
					: event.key === "End"
						? buttons.length - 1
						: current < 0
							? event.key === "ArrowUp"
								? buttons.length - 1
								: 0
							: (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
			buttons[index]?.focus();
		}
	});
	if (id === "search.resize") {
		const field = document.getElementById("home-search-field");
		field.addEventListener("focusin", () => app.openHomeSearch(true));
		field.addEventListener("focusout", (event: FocusEvent) => {
			if (!field.contains(event.relatedTarget as Node)) app.openHomeSearch(false);
		});
		field.querySelector<HTMLInputElement>("input").addEventListener("input", (event) => {
			const value = (event.target as HTMLInputElement).value;
			app.filter.query = value;
			field.classList.toggle("has-text", !!value);
			field.querySelector<HTMLElement>(".home-search-clear").hidden = !value;
		});
	}
	// The router accepts only example actions. No export, sync, login or external navigation is mounted.
	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement;
		if (app.stackDragUntil > Date.now() && target.closest("[data-stack]")) {
			event.preventDefault();
			return;
		}
		if (id === "search.resize" && !target.closest("#home-search-field"))
			(document.activeElement as HTMLElement)?.blur();
		if (!target.closest(".home-brand")) closeScope();
		const node = target.closest<HTMLElement>("[data-action]");
		if (!node || (node as HTMLButtonElement).disabled) return;
		const action = node.dataset.action;
		const cardId = node.dataset.id || card.id;
		if (action === "task") app.toggleTask(cardId, node.dataset.extra);
		else if (action === "pref-toggle") {
			const before = captureToggle(node);
			if (id === "feed.reorder") {
				Store.setPref("floatTimely", !Store.pref("floatTimely"));
				sort = Store.pref("floatTimely") ? "priority" : "time";
				renderView(island.querySelector(".motion-sort-control"), sortingControl());
				animateToggle(island.querySelector(".toggle"), before);
				app.withFeedAnchor(() => {
					list = FeedPolicy.sort(list, sort, Store.state.items, app.feedNow);
				}, true);
			} else {
				Store.setPref("fadeRead", !Store.pref("fadeRead"));
				renderView(island, <ExampleCover id={id} />);
				animateToggle(island.querySelector(".toggle"), before);
			}
		} else if (action === "bookmark" || action === "later") {
			const key = action === "bookmark" ? "bookmarked" : "later";
			app.setFlag(cardId, key, !Store.item(cardId)[key]);
		} else if (
			[
				"toggle-read",
				"select",
				"edit",
				"editor-tag",
				"add-tag",
				"save-note",
				"selected-bookmark",
				"selected-later",
				"selected-tag",
				"selected-ai",
				"selection-menu",
				"ai-context-remove",
				"stack-open",
				"stack-close",
				"ai-open",
				"ai-collapse",
				"ai-full",
				"ai-shrink",
				"ai-sessions",
				"ai-session",
			].includes(action)
		) {
			app.action(action, cardId, node.dataset.extra, node);
		} else if (action === "card-open") {
			if (dragging && (event.metaKey || event.ctrlKey || event.shiftKey || app.selected.size))
				app.select(cardId, { add: event.metaKey || event.ctrlKey, range: event.shiftKey });
			else {
				app.gestures ||= new Gestures(app);
				const reading =
					id === "reader.tools" ||
					id === "reader.gesture" ||
					(id === "reader.outline" && app.desktop());
				app.openCard(cardId, reading);
			}
		} else if (action === "reader") app.openCard(cardId, true);
		else if (action === "preview") app.openCard(cardId);
		else if (action === "close") app.closeModal();
		else if (action === "close-all") app.closeToDesk();
		else if (action === "toast-close") app.hideToast();
		else if (action === "retry") app.setOffline(false);
		else if (action === "show-new") {
			app.pendingCards = [];
			app.paintPending();
		} else if (action === "clear-selection") {
			app.selected.clear();
			app.updateSelection();
		} else if (action === "home-menu") {
			app.action("home-menu");
		} else if (action === "home-tab") {
			app.action("home-tab", cardId, node.dataset.extra, node);
		} else if (action === "home-search-clear") {
			const input = document.getElementById("home-search") as HTMLInputElement;
			input.value = "";
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.focus();
		}
	});
	if (["reader.tools", "reader.outline", "detail.resize"].includes(id)) {
		// Start with the real reading component ready to scroll, without an autoplay entrance.
		const previous = document.documentElement.dataset.inputModality;
		document.documentElement.dataset.inputModality = "keyboard";
		app.openCard(
			id === "reader.tools" ? "motion-reading" : card.id,
			id === "reader.tools" || (id === "reader.outline" && app.desktop()),
		);
		document.documentElement.dataset.inputModality = previous;
	}
	const event = (name: string) => {
		if (name === "context") {
			app.aiSelectionIds = app.aiSelectionIds.length ? [] : [card.id];
			app.renderAIDock();
		} else if (name === "mount") {
			if (list.length) return;
			list = Store.state.cards.slice(0, 3);
			paintCards();
			app.grid.querySelectorAll<HTMLElement>(".feed-item").forEach((node, index) => {
				MotionEngine.enter(node, index * MotionEngine.time("stagger"));
			});
		} else if (name === "receive")
			app.withFeedAnchor(() => {
				const added = {
					...structuredClone(card),
					id: `motion-added-${++serial}`,
					title: `${card.title} ${serial}`,
				};
				Store.state.cards.push(added);
				list = [added, ...list].slice(0, 4);
			}, true);
		else if (name === "remove")
			app.withFeedAnchor(() => {
				list = list.slice(1);
			}, true);
		else if (name === "changeContent")
			app.withFeedAnchor(() => {
				card.summary =
					card.summary === t("fixtureUpdated") ? t("fixtureSummary") : t("fixtureUpdated");
			}, true);
		else if (name === "toast") app.toast(copy("web.bookmark"));
		else if (name === "alert") app.alert(copy("web.bookmark"));
		else if (name === "offline") app.setOffline(true);
		else if (name === "online") app.setOffline(false);
		else if (name === "notify") {
			app.pendingCards = list.slice(0, 2);
			app.paintPending();
		} else if (name === "complete" || name === "fail") {
			const finish = request;
			request = undefined;
			finish?.(name === "complete");
		}
	};
	return {
		event,
		pending: () => !!request,
		canTrigger: (name) =>
			name === "mount"
				? !list.length
				: name === "remove"
					? !!list.length
					: name === "complete" || name === "fail"
						? !!request
						: true,
	};
}
