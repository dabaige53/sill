import { createElement, Fragment } from "react";
import { esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { cardSourceKind } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { ChromeAutoHide } from "../interactions/chrome.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { agentKey } from "../services/agent-handoff.ts";
import type { AppController } from "./app.ts";

export function openCard(this: AppController, id?: any, reading: any = false) {
	const c = Store.card(id);
	if (!c) return;
	this.closingCardRoute = "";
	const source = (
		this.searchBackground || (this.modalKind === "search" ? this.dialog : this.grid)
	).querySelector(`[data-card="${CSS.escape(id)}"]`);
	const sourceRect = source?.getBoundingClientRect();
	const entryRect = !this.dialog.open || this.modalKind === "search" ? sourceRect : null;
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
	if (!this.dialog.open || this.modalKind !== "preview") this.previewTrail = [];
	else if (!reading && this.currentId && this.currentId !== id) {
		const back = this.previewTrail.lastIndexOf(id);
		if (back >= 0) this.previewTrail = this.previewTrail.slice(0, back);
		else this.previewTrail.push(this.currentId);
	}
	if (this.modalKind === "search") this.suspendSearch();
	this.currentId = id;
	if (!Store.item(id).seen) {
		Store.patch(id, { seen: true });
		this.refreshCard(id);
	}
	if (c.type === "photo" && !reading) {
		this.photoIndex = 0;
		this.openModal(Panels.lightbox(c, 0, this), "lightbox", null, "lightbox");
		Store.patch(id, { read: true, progress: 1 });
		this.refreshCard(id);
		return;
	}
	if (reading) {
		// Bodies are on this device, so the page opens complete. The skeleton is kept for bodies fetched from a source.
		this.openModal(Panels.reader(this, c, false), "reader", entryRect);
		MotionEngine.matchSource(this.dialog, source);
		this.bindReader(id);
		this.gestures.bindPullDown();
		this.bindSheetChrome();
		return;
	}
	// Opened from the desk, the preview grows out of its card; opened from another preview it stacks.
	const origin = entryRect;
	const below = Store.card(this.previewTrail.at(-1));
	this.openModal(
		createElement(
			Fragment,
			null,
			below
				? createElement("button", {
						type: "button",
						className: "sheet-peek",
						"data-action": "close",
						"aria-label": copy("web.peekBack") + below.title,
					})
				: null,
			Panels.preview(this, c),
		),
		"preview",
		origin,
	);
	if (origin)
		MotionEngine.matchSource(
			this.dialog,
			(this.searchBackground || this.grid).querySelector(`[data-card="${CSS.escape(id)}"]`),
		);
	this.bindPreview(id);
	this.gestures.bindPullDown();
	this.bindSheetChrome();
}

export function bindPreview(this: AppController, id?: any) {
	const scroll = this.dialog.querySelector(".preview-sheet .sheet-scroll");
	if (!scroll || !CardTypes[Store.card(id)?.type]?.readable) return;
	this.bindReading(id, scroll);
}

export function bindSheetChrome(this: AppController) {
	this.sheetHide?.destroy();
	this.previewSizeObserver?.disconnect();
	const scroll = this.dialog.querySelector("#reader-scroll, .preview-sheet .sheet-scroll");
	if (!scroll) return;
	this.sheetHide = new ChromeAutoHide(
		scroll,
		() => [
			...this.dialog.querySelectorAll(
				":scope > .float-bar, :scope > .reader-head, :scope > .reader-edge, .sheet-head-tools",
			),
		],
		() => this.sheetLeaving || !!this.dialog.querySelector("[data-card-flight]"),
	);
	// The head floats over the content; once the text has moved under it, a soft edge keeps the two apart.
	const sheet = this.dialog.querySelector(".preview-sheet");
	if (sheet) {
		const placeHead = () => {
			this.dialog.style.setProperty("--preview-height", `${sheet.offsetHeight}px`);
			const title = sheet.querySelector("#modal-title");
			// The disc sits in the source row above the title, so the title keeps the full width.
			const row = sheet.querySelector(
				".preview-body > .preview-sender, .preview-body > .preview-meta",
			);
			const anchor = row || title;
			if (anchor) {
				const top =
					anchor.getBoundingClientRect().top - sheet.getBoundingClientRect().top + scroll.scrollTop;
				const line = row
					? anchor.getBoundingClientRect().height
					: parseFloat(getComputedStyle(anchor).lineHeight) || 28;
				sheet.style.setProperty("--preview-title-top", `${Math.max(4, top + line / 2 - 22)}px`);
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
