import { createElement, Fragment } from "react";
import { esc } from "../atoms/primitives.ts";
import { cardSourceKind } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { ChromeAutoHide } from "../interactions/chrome.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { deferReadingRefresh } from "../interactions/reading-feedback.ts";
import { agentKey } from "../services/agent-handoff.ts";
import type { AppController, DetailPosition } from "./app.ts";

export function openCard(this: AppController, id?: any, reading: any = false) {
	const c = Store.card(id);
	if (!c) return;
	// An open card folds the AI panel back to one line; the full view stays under the card.
	this.aiHeightEvent?.("detail");
	this.closingCardRoute = "";
	const scope = JSON.stringify(this.agentScope());
	const scopeChanged = this.detailScope !== scope;
	if (scopeChanged) {
		this.previewTrail = [];
		this.detailPositions.clear();
		this.detailScope = scope;
	}
	const active =
		!scopeChanged &&
		!this.sheetLeaving &&
		this.dialog.open &&
		["preview", "reader", "lightbox"].includes(this.modalKind);
	const linked = active && this.currentId !== id;
	const phoneLinked = linked && !this.desktop();
	const currentSheet = this.dialog.querySelector<HTMLElement>(".preview-sheet");
	const inheritFull =
		phoneLinked && (this.modalKind === "reader" || currentSheet?.classList.contains("is-full"));
	const inheritHeight = phoneLinked && !inheritFull ? currentSheet?.offsetHeight : 0;
	if (active) {
		const scroll = this.dialog.querySelector<HTMLElement>(
			"#reader-scroll, .preview-sheet .sheet-scroll",
		);
		const focus = document.activeElement as HTMLElement | null;
		this.detailPositions.set(this.currentId, {
			id: this.currentId,
			kind: this.modalKind as DetailPosition["kind"],
			scrollTop: scroll?.scrollTop || 0,
			photoIndex: this.photoIndex,
			focus,
			link:
				focus?.closest("[data-id], [href]")?.getAttribute("data-id") ||
				focus?.closest("[href]")?.getAttribute("href") ||
				null,
		});
	}
	const back = linked ? this.previewTrail.lastIndexOf(id) : -1;
	const returning = back >= 0;
	const restore = active ? this.detailPositions.get(id) : undefined;
	if (returning) reading = restore?.kind === "reader";
	// Phone links keep the current presentation in both directions, including after expansion.
	if (phoneLinked) reading = this.modalKind === "reader";
	const previousId = this.currentId;
	const visual = linked ? MotionEngine.captureDetail(this.dialog, id) : null;
	// The old chrome resolves its tools dynamically; dispose it before the new DOM exists.
	this.sheetHide?.destroy();
	this.sheetHide = null;
	this.previewSizeObserver?.disconnect();
	if (!active) {
		this.previewTrail = [];
		this.detailPositions.clear();
	} else if (linked) {
		if (returning) this.previewTrail = this.previewTrail.slice(0, back);
		else this.previewTrail.push(this.currentId);
	}
	const settle = () => {
		const sheet = this.dialog.querySelector<HTMLElement>(".preview-sheet");
		if (sheet && phoneLinked) {
			sheet.classList.toggle("is-full", !!inheritFull);
			if (inheritHeight) sheet.style.setProperty("--nested-sheet-height", `${inheritHeight}px`);
		}
		const scroll = this.dialog.querySelector<HTMLElement>(
			"#reader-scroll, .preview-sheet .sheet-scroll",
		);
		if (restore && scroll) {
			scroll.scrollTop = Math.min(
				restore.scrollTop,
				Math.max(0, scroll.scrollHeight - scroll.clientHeight),
			);
			scroll.closest(".preview-sheet")?.classList.toggle("is-scrolled", scroll.scrollTop > 8);
		}
		if (returning && restore) {
			const focus = restore.focus?.isConnected
				? restore.focus
				: restore.link
					? [...this.dialog.querySelectorAll<HTMLElement>("[data-id], [href]")].find(
							(node) =>
								node.getAttribute("data-id") === restore.link ||
								node.getAttribute("href") === restore.link,
						)
					: null;
			if (!focus && scroll) scroll.tabIndex = -1;
			(focus || scroll)?.focus({ preventScroll: true });
		}
		if (linked) MotionEngine.navigateDetail(this.dialog, visual, returning, previousId);
	};
	const source = (
		this.searchBackground || (this.modalKind === "search" ? this.dialog : this.grid)
	).querySelector(`[data-card="${CSS.escape(id)}"]`);
	const sourceRect = source?.getBoundingClientRect();
	const resizing =
		this.dialog.open &&
		this.currentId === id &&
		((reading && this.modalKind === "preview") || (!reading && this.modalKind === "reader"));
	this.dialog.dataset.readerResize =
		resizing && ["article", "media"].includes(c.type) ? "true" : "";
	const entryRect = resizing
		? MotionEngine.surface(this.dialog).getBoundingClientRect()
		: !active
			? sourceRect
			: null;
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
	if (this.modalKind === "search") this.suspendSearch();
	this.currentId = id;
	if (!Store.item(id).seen) {
		Store.patch(id, { seen: true });
		deferReadingRefresh(this, id);
	}
	if (c.type === "photo" && !reading) {
		this.photoIndex = restore?.photoIndex || 0;
		this.openModal(Panels.lightbox(c, this.photoIndex, this), "lightbox", null, "lightbox", linked);
		settle();
		Store.patch(id, { read: true, progress: 1 });
		this.refreshCard(id);
		return;
	}
	if (reading) {
		// Bodies are on this device, so the page opens complete. The skeleton is kept for bodies fetched from a source.
		this.openModal(
			createElement(Fragment, null, null, Panels.reader(this, c, false)),
			"reader",
			entryRect,
			"",
			linked,
		);
		if (!linked && !this.previewTrail.length) MotionEngine.matchSource(this.dialog, source);
		settle();
		this.bindReader(id, restore?.scrollTop);
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
				? createElement("div", {
						className: "sheet-peek",
						"aria-hidden": true,
					})
				: null,
			Panels.preview(this, c),
		),
		"preview",
		origin,
		"",
		linked,
	);
	settle();
	if (origin && !this.previewTrail.length)
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
	const completed = this.dialog.querySelector<HTMLElement>("[data-read-complete]");
	if (completed) {
		completed.style.visibility = "";
		delete completed.dataset.readComplete;
	}
	const scroll = this.dialog.querySelector("#reader-scroll, .preview-sheet .sheet-scroll");
	if (!scroll) return;
	// Expanded workspaces reserve a compact header; their controls remain stationary.
	if (scroll.classList.contains("reader-workspace")) return;
	// Checked on every scroll event: a long transcript makes a whole-detail query costly.
	// Detail faces are direct children; the capsule in flight is the first float bar, and the
	// browser keeps that class list live instead of searching the detail again.
	this.sheetHide = new ChromeAutoHide(
		scroll,
		() => [
			...this.dialog.querySelectorAll(
				":scope > .float-bar, :scope > .reader-head, :scope > .reader-edge, .sheet-head-tools",
			),
		],
		() =>
			this.sheetLeaving ||
			this.dialog.hasAttribute("data-sheet-resizing") ||
			this.dialog.getElementsByClassName("float-bar")[0]?.hasAttribute("data-read-complete") ||
			(this.dialog.getElementsByClassName("float-bar")[0] as HTMLElement | undefined)?.dataset
				.cardFlight !== undefined ||
			[...this.dialog.children].some((node) => node.hasAttribute("data-detail-face")),
	);
	// The head floats over the content; once the text has moved under it, a soft edge keeps the two apart.
	const sheet = this.dialog.querySelector(".preview-sheet");
	if (sheet) {
		const token = this.modalToken;
		const placeHead = () => {
			if (token !== this.modalToken || !sheet.isConnected) return;
			const expand = sheet.querySelector<HTMLElement>('[data-action="reader"]');
			const hideExpand = scroll.scrollHeight <= scroll.clientHeight + 2;
			const height = `${sheet.offsetHeight}px`;
			const cover = sheet.querySelector(".sheet-scroll > .gesture-content > .preview-cover");
			const podcast = sheet.querySelector(".is-podcast");
			let titleTop = cover ? "24px" : podcast ? "var(--space-8)" : "";
			const title = sheet.querySelector("#modal-title");
			// The disc sits in the source row above the title, so the title keeps the full width.
			const row = sheet.querySelector(
				".preview-body .preview-sender, .preview-body .preview-meta, .pr-detail .card-head",
			);
			const anchor = row || title;
			if (anchor && !cover && !podcast) {
				// Layout offsets stay stable while the card's opening transform animates.
				let top = 0;
				for (
					let node = anchor as HTMLElement;
					node && node !== sheet;
					node = node.offsetParent as HTMLElement
				)
					top += node.offsetTop;
				const line = row
					? (anchor as HTMLElement).offsetHeight
					: parseFloat(getComputedStyle(anchor).lineHeight) || 28;
				titleTop = `${Math.max(4, top + line / 2 - 22)}px`;
			}
			// Read all geometry before writing; unchanged observations do no style work.
			if (expand && Store.card(this.currentId)?.type !== "media" && expand.hidden !== hideExpand)
				expand.hidden = hideExpand;
			if (this.dialog.style.getPropertyValue("--preview-height") !== height)
				this.dialog.style.setProperty("--preview-height", height);
			if (titleTop && sheet.style.getPropertyValue("--preview-title-top") !== titleTop)
				sheet.style.setProperty("--preview-title-top", titleTop);
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
