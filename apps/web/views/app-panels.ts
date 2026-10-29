import type { ReactNode } from "react";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { resetPhoneSearch } from "../interactions/phone-search-motion.ts";
import { armLastTag } from "../interactions/tag-input-motion.ts";
import { deferReadingRefresh } from "../interactions/reading-feedback.ts";
import type { AppController } from "./app.ts";
import type { ViewDialog } from "./app-types.ts";
import { bindPreview, bindSheetChrome, openCard } from "./preview-controller.ts";
import { releaseView, renderContent, renderView } from "./react-renderer.ts";

// Progress changes on nearly every scroll event, and each Store write saves the whole workspace
// (browser storage, or a cloud snapshot and diff). Completion is written at once; progress alone
// is written at most every PROGRESS_WRITE_MS, and before the page is hidden or left.
const PROGRESS_WRITE_MS = 500;
const pendingProgress = new Map<string, number>();
const pagedResults = new WeakSet<HTMLElement>();
const editorLayers = new WeakSet<HTMLElement>();
let editorToken = 0;
let progressTimer = 0;
export function flushReadingProgress() {
	clearTimeout(progressTimer);
	progressTimer = 0;
	const pending = [...pendingProgress];
	pendingProgress.clear();
	for (const [id, value] of pending)
		if (Store.card(id) && value > (Store.item(id).progress || 0))
			Store.patch(id, { progress: value });
}
function queueProgress(id: string, value: number) {
	pendingProgress.set(id, value);
	if (!progressTimer) progressTimer = window.setTimeout(flushReadingProgress, PROGRESS_WRITE_MS);
}

export const appPanelsMethods = {
	openPanel(this: AppController, kind?: string, id: string = "") {
		if (kind === "capture") return;
		if (kind === "search" && location.hash !== "#search") {
			this.navigate("#search");
			return;
		}
		if (kind === "editor") {
			this.openEditor(id);
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
		const narrow = ["confirm", "ai"].includes(kind),
			wide = kind === "settings";
		const html =
			kind === "search"
				? Panels.search(this)
				: kind === "settings"
					? Panels.settings(this, this.settingsGroup)
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
		if (kind === "ai") this.paintAIPage();
		if (kind === "search") {
			this.dialog.querySelector<HTMLElement>("#search-results").scrollTop = this.searchScroll;
			this.bindSearchResults();
			this.revealImages(this.dialog);
		}
	},
	/**
	 * Tags and note float on their own layer over whatever is open: the card, page or photo
	 * underneath keeps its content, scroll and player, and is there again when the layer closes.
	 */
	// @design tag-layer
	openEditor(this: AppController, id: string) {
		const layer = (this.editorLayer ||= document.getElementById("tag-layer") as ViewDialog);
		if (!editorLayers.has(layer)) {
			editorLayers.add(layer);
			layer.addEventListener("cancel", (e) => {
				e.preventDefault();
				this.closeEditor();
			});
			// A phone card drawer underneath traps focus at the document; focus moving inside the
			// layer stops here so the drawer does not pull it back.
			for (const type of ["focusin", "focusout"])
				layer.addEventListener(type, (e) => {
					if (type === "focusout" && (e.target as HTMLElement).id === "tag-new")
						armLastTag(layer.querySelector("#editor-tags"), false);
					e.stopPropagation();
				});
			layer.addEventListener("click", (e) => {
				// A click on the dim, outside the sheet, closes the layer only.
				const r = layer.firstElementChild?.getBoundingClientRect();
				const inside =
					r &&
					e.clientX >= r.left &&
					e.clientX <= r.right &&
					e.clientY >= r.top &&
					e.clientY <= r.bottom;
				if (e.target === layer && !inside) this.closeEditor();
			});
		}
		editorToken++;
		this.editId = id;
		this.editTags = new Set<string>(Store.tags(Store.card(id)));
		MotionEngine.cancelPanel(layer);
		layer.inert = false;
		renderContent(layer, Panels.editor(this, id));
		if (!layer.open) {
			this.editorFocus = document.activeElement as HTMLElement;
			// Opened from the desk, nothing else holds the page still.
			if (!this.dialog.open) this.lockPageScroll();
			layer.showModal();
			// The drawer hid the rest of the page from assistive tech when it opened, this layer included.
			layer.removeAttribute("aria-hidden");
		}
		if (this.desktop() || MotionEngine.keyboard) MotionEngine.openPanel(layer);
		else {
			// On a phone the layer rises from the bottom like the card drawer, its dim with it.
			MotionEngine.dim(layer, 0);
			MotionEngine.dim(layer, 1, MotionEngine.time("dur-sheet"));
			MotionEngine.panelAnimations.set(layer, [
				MotionEngine.animate(
					layer,
					[{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
					{ duration: MotionEngine.time("dur-sheet"), easing: MotionEngine.curve("ease-sheet") },
				),
			]);
		}
		layer.querySelector<HTMLElement>("#tag-new")?.focus({ preventScroll: true });
	},
	closeEditor(this: AppController, animate = true) {
		const layer = this.editorLayer;
		if (!layer?.open) return;
		this.bulkEditIds = null;
		const token = ++editorToken;
		const finish = () => {
			if (editorToken !== token) return;
			MotionEngine.cancelPanel(layer);
			MotionEngine.dim(layer, null);
			layer.inert = false;
			releaseView(layer);
			layer.close();
			if (!this.dialog.open) this.unlockPageScroll();
			const back = this.editorFocus;
			this.editorFocus = null;
			if (back?.isConnected && !back.closest("[inert]")) back.focus({ preventScroll: true });
		};
		if (!animate || MotionEngine.keyboard) return finish();
		// Desktop: the same short fall and fade as any panel. Phone: back down the way it came.
		const phone = !this.desktop();
		const duration = MotionEngine.time(phone ? "dur-sheet" : "dur-close");
		const { opacity, transform } = getComputedStyle(layer);
		layer.inert = true;
		MotionEngine.cancelPanel(layer);
		MotionEngine.dim(layer, 0, duration);
		const animation = MotionEngine.animate(
			layer,
			phone
				? [{ transform }, { transform: "translateY(100%)" }]
				: [
						{ opacity, transform },
						{ opacity: 0, transform: "translateY(10px)" },
					],
			{
				duration,
				fill: "forwards",
				...(phone ? { easing: MotionEngine.curve("ease-sheet") } : {}),
			},
		);
		MotionEngine.panelAnimations.set(layer, [animation]);
		if (animation) animation.finished.then(finish, () => {});
		else finish();
	},
	bindSearchResults(this: AppController) {
		this.bindSearchSelection();
		const results = this.dialog.querySelector<HTMLElement>("#search-results");
		// Repaints keep the same results node; a second listener would page and render twice per scroll.
		if (!results || pagedResults.has(results)) return;
		pagedResults.add(results);
		results.addEventListener(
			"scroll",
			() => {
				if (this.modalKind !== "search" || this.searchBackground) return;
				this.searchScroll = results.scrollTop;
				if (results.scrollTop + results.clientHeight * 2 < results.scrollHeight) return;
				const hits = this.searchAll(this.searchFilter.query.trim());
				if (this.searchLimit >= hits.desk.length + hits.shelved.length) return;
				this.searchLimit += 40;
				renderView(results, Panels.searchResults(this));
				results.scrollTop = this.searchScroll;
				this.revealImages(results);
				this.updateSelection();
			},
			{ passive: true },
		);
	},
	suspendSearch(this: AppController) {
		resetPhoneSearch(this.dialog);
		if (this.searchTimer) {
			clearTimeout(this.searchTimer);
			this.searchTimer = 0;
			const results = this.dialog.querySelector<HTMLElement>("#search-results");
			renderView(results, Panels.searchResults(this));
			this.revealImages(results);
			this.updateSelection();
		}
		this.searchScroll = this.dialog.querySelector<HTMLElement>("#search-results")?.scrollTop || 0;
		this.searchFocus = document.activeElement as HTMLElement as HTMLElement;
		const background = this.dialog;
		background.close();
		background.id = "search-background";
		background.removeAttribute("aria-labelledby");
		background.setAttribute("aria-label", copy("web.search"));
		background.querySelector<HTMLElement>("#modal-title")?.removeAttribute("id");
		// Inert first: show() focuses the first field, and the search field then raised the keyboard
		// and laid its suggestions over the results that the closing card returns to.
		background.inert = true;
		background.show();
		background.querySelector<HTMLElement>("#search-results").scrollTop = this.searchScroll;
		this.searchBackground = background;
		const dialog = document.createElement("dialog");
		dialog.id = "modal";
		dialog.setAttribute("aria-labelledby", "modal-title");
		document.body.append(dialog);
		this.dialog = dialog as ViewDialog;
		this.bindDialog();
	},
	restoreSearch(this: AppController) {
		const background = this.searchBackground;
		if (!background) return;
		releaseView(this.dialog);
		this.dialog.close();
		this.dialog.remove();
		// The page stays open (non-modal) under the card; closing and reopening it made iOS redraw it
		// from scratch, and the search page flashed as the card closed.
		this.dialog = background as ViewDialog;
		this.dialog.id = "modal";
		this.dialog.inert = false;
		this.dialog.removeAttribute("aria-label");
		this.dialog.setAttribute("aria-labelledby", "modal-title");
		this.dialog.querySelector<HTMLElement>("h1").id = "modal-title";
		this.searchBackground = undefined;
		this.modalKind = "search";
		this.panelReturn = null;
		const opened = this.currentId;
		this.currentId = "";
		MotionEngine.dim(this.dialog, null);
		this.dialog.style.translate = "";
		this.dialog.style.transform = "";
		this.dialog.show();
		this.dialog.querySelector<HTMLElement>("#search-results").scrollTop = this.searchScroll;
		this.setNav("search");
		this.updateSelection();
		// On a phone the field raises the keyboard and lays suggestions over the results the card
		// returned to, so focus goes back to the opened card (or the results) instead.
		const field = this.dialog.querySelector<HTMLElement>("#filter-search");
		let focus =
			this.searchFocus?.isConnected && (this.desktop() || this.searchFocus !== field)
				? this.searchFocus
				: this.desktop()
					? field
					: null;
		if (!focus) {
			const results = this.dialog.querySelector<HTMLElement>("#search-results");
			focus =
				results?.querySelector<HTMLElement>(
					`[data-card="${CSS.escape(opened)}"] :is(button, a[href])`,
				) || results;
			if (focus === results && results) results.tabIndex = -1;
		}
		focus?.focus({ preventScroll: true });
	},
	discardSearchBackground(this: AppController) {
		this.searchBackground?.close();
		if (this.searchBackground) releaseView(this.searchBackground);
		this.searchBackground?.remove();
		this.searchBackground = undefined;
	},
	swapPanel(this: AppController, html?: ReactNode, kind?: string, shape: string = "panel") {
		this.modalToken++;
		MotionEngine.cancelPanel(this.dialog);
		this.sheetLeaving = false;
		this.dialog.inert = false;
		this.skipReturnMotion = false;
		MotionEngine.dim(this.dialog, null);
		// Move inside the same sheet without re-animating from a card.
		const toast = document.getElementById("toast");
		if (this.dialog.contains(toast)) document.body.appendChild(toast);
		this.modalKind = kind;
		this.dialog.className = shape;
		renderContent(this.dialog, html);
		if (!this.dialog.open) {
			this.lastFocus = document.activeElement as HTMLElement;
			this.lockPageScroll();
			this.dialog.showModal();
		}
		MotionEngine.enter(this.dialog.firstElementChild);
		const focus = this.dialog.querySelector<HTMLElement>("#modal-title");
		if (focus) {
			focus.tabIndex = -1;
			focus.focus({ preventScroll: true });
		}
	},
	openCard(this: AppController, id?: string, reading = false): undefined {
		return openCard.call(this, id, reading);
	},
	bindPreview(this: AppController, id?: string): undefined {
		return bindPreview.call(this, id);
	},
	bindReading(this: AppController, id: string, scroll: HTMLElement) {
		if (Store.card(id)?.type === "media") return;
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
		// Opening is not completion. A short piece needs an uninterrupted visible dwell.
		let interrupted = false;
		const hidden = () => {
			if (document.hidden) interrupted = true;
		};
		document.addEventListener("visibilitychange", hidden);
		window.setTimeout(() => {
			document.removeEventListener("visibilitychange", hidden);
			if (!interrupted && scroll.scrollHeight - scroll.clientHeight <= 2) update();
		}, 1200);
	},
	bindSheetChrome(this: AppController): undefined {
		return bindSheetChrome.call(this);
	},
	bindReader(this: AppController, id?: string, restoreTop?: number) {
		this.lastActivity = Date.now();
		const scroll = this.dialog.querySelector<HTMLElement>("#reader-scroll");
		if (!scroll) return;
		const token = this.modalToken;
		if (restoreTop !== undefined)
			scroll.scrollTop = Math.min(
				restoreTop,
				Math.max(0, scroll.scrollHeight - scroll.clientHeight),
			);
		requestAnimationFrame(() => {
			if (this.modalToken !== token || !scroll.isConnected) return;
			if (restoreTop === undefined) {
				const saved = Store.item(id).progress;
				scroll.scrollTop =
					(scroll.scrollHeight - scroll.clientHeight) * (saved >= 0.98 ? 0 : saved);
			}
			this.bindReading(id, scroll);
		});
	},
	updateReading(this: AppController, id?: string, scroll?: HTMLElement) {
		const available = scroll.scrollHeight - scroll.clientHeight;
		const end = scroll.querySelector<HTMLElement>("#reader-end");
		const viewport = scroll.getBoundingClientRect();
		const endBox = end?.getBoundingClientRect();
		// The content end precedes trailing actions/padding. Seeing it counts as reaching the end.
		const reachedEnd =
			available <= 2 ||
			available - scroll.scrollTop <= 8 ||
			(viewport.height > 0 &&
				!!endBox &&
				endBox.top >= viewport.top &&
				endBox.bottom <= viewport.bottom + 2);
		const actual = reachedEnd ? 1 : Math.max(0, Math.min(1, scroll.scrollTop / available));
		const before = Store.item(id);
		const stored = Math.max(before.progress || 0, pendingProgress.get(id) || 0);
		const p = Math.max(stored, actual);
		const read = before.read || reachedEnd;
		if (read !== before.read) {
			pendingProgress.delete(id);
			Store.patch(id, { progress: p, read });
		} else if (p > (before.progress || 0) && p !== stored) queueProgress(id, p);
		const bar = document.getElementById("reader-progress");
		if (bar) bar.style.transform = `scaleX(${actual})`;
		document.getElementById("reader-end")?.classList.toggle("is-done", Store.item(id).read);
		this.dialog.querySelectorAll<HTMLElement>(".progress-ring").forEach((n?: HTMLElement) => {
			n.setAttribute("aria-valuenow", String(Math.round(p * 100)));
			n.querySelector<HTMLElement>("circle:last-child").setAttribute(
				"stroke-dashoffset",
				String(50.265 * (1 - p)),
			);
		});
		// Do not replace the feed card and disturb focus/layout for every fractional progress update.
		if (Store.item(id).read !== before.read) {
			if (this.dialog.open) deferReadingRefresh(this, id);
			else this.refreshCard(id);
		}
	},
};
