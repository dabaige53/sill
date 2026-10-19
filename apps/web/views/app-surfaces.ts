import { type ReactNode } from "react";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "./app.ts";
import { renderContent } from "./react-renderer.ts";

export const appSurfacesMethods = {
	navigate(this: AppController, hash?: string) {
		if (!this.pageScrollLocked) this.routeScroll[this.mode] = scrollY;
		history.pushState({ glass: true, prev: location.hash }, "", hash);
		this.route(true);
	},
	route(this: AppController, force = false) {
		const hash = location.hash;
		// Back/forward emits both popstate and hashchange; handle one transition only.
		if (!force && this.lastRouteHash === hash) return;
		this.lastRouteHash = hash;
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
		if (leavingSearch || ["preview", "reader", "lightbox", "search"].includes(this.modalKind))
			this.closeNative();
		if (this.mode !== "feed") {
			this.mode = "feed";
			this.baseMode = "feed";
			this.renderCurrent(true);
			window.scrollTo(0, this.routeScroll.feed || 0);
		}
	},
	lockPageScroll(this: AppController) {
		if (this.pageScrollLocked) return;
		this.pageScrollLocked = true;
		this.lockedScroll = scrollY;
		this.pageOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		document.body.style.setProperty("--locked-scroll", `${-this.lockedScroll}px`);
		document.body.classList.add("modal-scroll-locked");
	},
	unlockPageScroll(this: AppController) {
		if (!this.pageScrollLocked) return;
		this.pageScrollLocked = false;
		document.body.classList.remove("modal-scroll-locked");
		document.body.style.removeProperty("--locked-scroll");
		document.documentElement.style.overflow = this.pageOverflow;
		window.scrollTo({ top: this.lockedScroll, behavior: "instant" });
	},
	openModal(
		this: AppController,
		html?: ReactNode,
		kind?: string,
		origin: DOMRect | null = null,
		shape: string = "",
	) {
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
		const pageToPage = page && this.dialog.open;
		if (!this.dialog.open) {
			this.lastFocus = document.activeElement as HTMLElement;
			this.lockPageScroll();
		}
		const liveToast = document.getElementById("toast");
		if (liveToast && this.dialog.contains(liveToast)) document.body.appendChild(liveToast);
		this.modalKind = kind;
		this.dialog.className =
			shape || (["reader", "preview", "lightbox", "search"].includes(kind) ? kind : "panel");
		if (page) this.dialog.classList.add("page");
		const card = kind === "preview" ? Store.card(this.currentId) : null;
		if (
			card &&
			["task", "reminder", "note"].includes(card.type) &&
			(card.body || []).join("\n").length < 500 &&
			(card.summary || "").length < 280
		)
			this.dialog.classList.add("is-short");
		renderContent(this.dialog, html);
		if (!this.dialog.open) {
			if (page && kind !== "search") this.dialog.show();
			else this.dialog.showModal();
		}
		// Pages change in place under the capsule: a short fade, never a rising sheet. Between two pages only
		// the new content fades; the page itself stays opaque so the desk never shows through.
		if (MotionEngine.keyboard) MotionEngine.cancelPanel(this.dialog);
		else if (page)
			for (const target of pageToPage ? [...this.dialog.children] : [this.dialog])
				target.animate([{ opacity: 0 }, { opacity: 1 }], {
					duration: MotionEngine.time("fast"),
					easing: "ease-out",
				});
		else if (kind === "search") MotionEngine.enter(this.dialog);
		else MotionEngine.openPanel(this.dialog, origin);
		const focus = this.dialog.querySelector<HTMLElement>(
			kind === "search"
				? "#filter-search"
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
	},
	cardRect(this: AppController, id?: string) {
		const el = id && this.grid.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
		const r = el?.getBoundingClientRect();
		return r?.width && r.bottom > 0 && r.top < innerHeight ? r : null;
	},
	closeNative(this: AppController, animate = true) {
		if (MotionEngine.keyboard) animate = false;
		if (!this.dialog.open) return;
		// A sheet already dragged off screen closes as it is: no return motion.
		if (this.skipReturnMotion) {
			animate = false;
			this.skipReturnMotion = false;
		}
		// Phone sheet: it slides back down past the bottom edge while the dim fades, then the dialog closes.
		if (this.sheetLeaving) return;
		if (animate && this.modalKind === "preview" && MotionEngine.phoneSheet(this.dialog)) {
			const sheet = this.dialog.querySelector<HTMLElement>(".preview-sheet"),
				token = this.modalToken;
			MotionEngine.cancelPanel(this.dialog);
			this.sheetLeaving = true;
			sheet.classList.remove("is-drag");
			sheet.classList.add("is-off");
			sheet.style.translate = "";
			this.dialog.querySelector<HTMLElement>(":scope > .float-bar")?.classList.add("is-hidden");
			this.dialog.style.setProperty("--backdrop", "0");
			// Read after the class change so CSS has created its actual exit transition.
			void sheet.offsetHeight;
			const animations = sheet.getAnimations();
			Promise.allSettled(animations.map((animation: Animation) => animation.finished)).then(
				() => {
					if (this.modalToken === token && this.sheetLeaving && this.dialog.open) {
						this.sheetLeaving = false;
						this.skipReturnMotion = true;
						this.closeNative();
					}
				},
				() => {},
			);
			return;
		}
		if (animate && !this.isPage(this.modalKind)) {
			const token = this.modalToken,
				sheet = MotionEngine.surface(this.dialog),
				opacity = getComputedStyle(sheet).opacity;
			const transform = getComputedStyle(sheet).transform;
			MotionEngine.cancelPanel(this.dialog);
			this.sheetLeaving = true;
			this.dialog.style.setProperty("--backdrop", "0");
			const animation = MotionEngine.animate(
				sheet,
				[
					{ opacity, transform },
					{ opacity: 0, transform: "translateY(4px)" },
				],
				{ duration: MotionEngine.time("dur-close"), fill: "forwards" },
			);
			const bar = this.dialog.querySelector<HTMLElement>(":scope > .float-bar");
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
		const source = this.grid.querySelector<HTMLElement>(
			`[data-card="${CSS.escape(this.currentId || "")}"]`,
		);
		MotionEngine.cancelPanel(this.dialog);
		this.sheetHide?.destroy();
		this.sheetHide = null;
		this.previewSizeObserver?.disconnect();
		if (this.modalKind === "search")
			this.searchScroll = this.dialog.querySelector<HTMLElement>("#search-results")?.scrollTop || 0;
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
		this.dialog.getAnimations({ subtree: true }).forEach((a) => {
			if ((a.effect as KeyframeEffect)?.pseudoElement === "::backdrop") a.cancel();
		});
		let focus =
			this.lastFocus?.isConnected && this.lastFocus !== document.body
				? (this.lastFocus as HTMLElement)
				: source?.querySelector<HTMLElement>(".card-title-button") || source;
		if (
			focus &&
			(!focus.getClientRects().length || getComputedStyle(focus).visibility === "hidden")
		)
			focus =
				focus
					.closest<HTMLElement>("[data-card]")
					?.querySelector<HTMLElement>(".card-title-button") || document.getElementById("account");
		(focus || document.getElementById("account")).focus({ preventScroll: true });
	},
	closeAll(this: AppController) {
		const depth = this.previewTrail?.length || 0;
		this.previewTrail = [];
		if (depth && history.state?.prev !== undefined && /^#card\//.test(location.hash)) {
			this.closingAll = true;
			history.go(-depth);
		} else this.closeToDesk();
	},
	closeToDesk(this: AppController, animate = true) {
		const destination = this.searchBackground ? "search" : this.baseMode;
		history.replaceState({ glass: true, prev: null }, "", "#" + destination);
		this.lastRouteHash = "#" + destination;
		this.closeNative(animate);
	},
	closeModal(this: AppController) {
		if (["preview", "reader", "lightbox"].includes(this.modalKind)) {
			if (this.closingCardRoute === location.hash || this.sheetLeaving) return;
			this.closingCardRoute = location.hash;
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
	},
};
