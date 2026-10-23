import type { ReactNode } from "react";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import type { AppController } from "./app.ts";
import type { ViewDialog } from "./app-types.ts";
import { bindPreview, bindSheetChrome, openCard } from "./preview-controller.ts";
import { releaseView, renderContent, renderView } from "./react-renderer.ts";

export const appPanelsMethods = {
	openPanel(this: AppController, kind?: string, id: string = "") {
		if (kind === "search" && location.hash !== "#search") {
			this.navigate("#search");
			return;
		}
		if (kind === "search") this.panelReturn = null;
		else if (
			["preview", "reader"].includes(this.modalKind) ||
			(this.modalKind === "lightbox" && kind === "editor")
		) {
			const cardId = this.currentId,
				reading = this.modalKind === "reader",
				photoIndex = this.modalKind === "lightbox" ? this.photoIndex : null;
			this.panelReturn = () => {
				this.openCard(cardId, reading);
				if (photoIndex !== null && this.modalKind === "lightbox")
					this.action("photo-go", cardId, String(photoIndex));
			};
		}
		this.editId = id;
		if (["search", "settings", "ai"].includes(kind)) this.setNav(kind);
		if (kind === "editor") this.editTags = new Set<string>(Store.tags(Store.card(id)));
		const narrow = ["editor", "capture", "confirm", "ai"].includes(kind),
			wide = kind === "settings";
		const html =
			kind === "search"
				? Panels.search(this)
				: kind === "editor"
					? Panels.editor(this, id)
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
			this.dialog.querySelector<HTMLElement>("#search-results").scrollTop = this.searchScroll;
			this.bindSearchResults();
			this.revealImages(this.dialog);
		}
	},
	bindSearchResults(this: AppController) {
		this.bindSearchSelection();
		const results = this.dialog.querySelector<HTMLElement>("#search-results");
		results?.addEventListener(
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
		background.show();
		background.inert = true;
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
		background.close();
		this.dialog = background as ViewDialog;
		this.dialog.id = "modal";
		this.dialog.inert = false;
		this.dialog.removeAttribute("aria-label");
		this.dialog.setAttribute("aria-labelledby", "modal-title");
		this.dialog.querySelector<HTMLElement>("h1").id = "modal-title";
		this.searchBackground = undefined;
		this.modalKind = "search";
		this.panelReturn = null;
		this.currentId = "";
		MotionEngine.dim(this.dialog, null);
		this.dialog.style.translate = "";
		this.dialog.style.transform = "";
		this.dialog.show();
		this.dialog.querySelector<HTMLElement>("#search-results").scrollTop = this.searchScroll;
		this.setNav("search");
		this.updateSelection();
		(this.searchFocus?.isConnected
			? this.searchFocus
			: this.dialog.querySelector<HTMLElement>("#filter-search")
		)?.focus({ preventScroll: true });
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
	bindReader(this: AppController, id?: string) {
		this.lastActivity = Date.now();
		const scroll = this.dialog.querySelector<HTMLElement>("#reader-scroll");
		if (!scroll) return;
		const token = this.modalToken;
		requestAnimationFrame(() => {
			if (this.modalToken !== token || !scroll.isConnected) return;
			const saved = Store.item(id).progress;
			scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * (saved >= 0.98 ? 0 : saved);
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
				endBox &&
				endBox.top >= viewport.top &&
				endBox.bottom <= viewport.bottom + 2);
		const actual = reachedEnd ? 1 : Math.max(0, Math.min(1, scroll.scrollTop / available));
		const before = Store.item(id);
		const p = Math.max(before.progress, actual);
		const read = before.read || reachedEnd;
		if (p !== before.progress || read !== before.read) Store.patch(id, { progress: p, read });
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
		if (Store.item(id).read !== before.read) this.refreshCard(id);
	},
};
