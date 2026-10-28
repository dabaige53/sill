import type { ReactNode } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { closePhoneDrawer, configurePhoneDrawer } from "../interactions/phone-drawer.tsx";
import { resetPhoneSearch } from "../interactions/phone-search-motion.ts";
import { flushReadingRefresh, flushReadingRefreshLater } from "../interactions/reading-feedback.ts";
import type { AppController } from "./app.ts";
import { flushReadingProgress } from "./app-panels.ts";
import { clearPhonePreviews } from "./phone-preview-stack.ts";
import { renderContent, renderView } from "./react-renderer.ts";

/** Surfaces that show one card; the desktop bars step aside while one is open. */
const CARD_KINDS = ["preview", "reader", "lightbox"];

export const appSurfacesMethods = {
	navigate(this: AppController, hash?: string) {
		if (!this.pageScrollLocked) this.routeScroll[this.mode] = scrollY;
		const current = location.hash.match(/^#(?:card|read)\/(.+)$/)?.[1];
		const target = hash?.match(/^#(?:card|read)\/(.+)$/)?.[1];
		if (current && current === target) history.replaceState(history.state, "", hash);
		else history.pushState({ glass: true, prev: location.hash }, "", hash);
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
		// iOS scrolls a scrolled document when a field in a fixed page takes focus, and the search bar
		// slid down instead of up. The desk keeps its picture while the document rests at the top.
		const desk = document.getElementById("workspace-background");
		const main = desk?.querySelector<HTMLElement>("main");
		if (!this.desktop() && desk && main && this.lockedScroll) {
			this.frozenTranslate = main.style.translate;
			main.style.translate = `0 ${-this.lockedScroll}px`;
			desk.classList.add("is-page-frozen");
		}
	},
	unlockPageScroll(this: AppController) {
		if (!this.pageScrollLocked) return;
		this.pageScrollLocked = false;
		const desk = document.getElementById("workspace-background");
		if (desk?.classList.contains("is-page-frozen")) {
			desk.classList.remove("is-page-frozen");
			const main = desk.querySelector<HTMLElement>("main");
			if (main) main.style.translate = this.frozenTranslate;
		}
		document.documentElement.style.overflow = this.pageOverflow;
		window.scrollTo({ top: this.lockedScroll, behavior: "instant" });
		this.railHide?.syncPosition();
	},
	openModal(
		this: AppController,
		html?: ReactNode,
		kind?: string,
		origin: DOMRect | null = null,
		shape: string = "",
		nested = false,
	) {
		const phoneDrawer = kind === "preview" && !this.desktop();
		const reversing = this.dialog.open && this.sheetLeaving;
		const drawn = reversing ? getComputedStyle(MotionEngine.surface(this.dialog)) : null;
		const resume = drawn ? { opacity: drawn.opacity, transform: drawn.transform } : undefined;
		if (!nested && kind !== "preview" && kind !== "reader") MotionEngine.releaseSource(this.dialog);
		if (this.modalKind === "search" && kind !== "search" && !this.searchBackground)
			this.suspendSearch();
		this.modalToken++;
		MotionEngine.cancelPanel(this.dialog);
		if (nested) {
			MotionEngine.cancel(this.dialog);
			this.dialog.style.transform = "";
		}
		if (reversing) {
			const source = MotionEngine.matchedSources.get(this.dialog)?.source;
			if (source) source.style.visibility = "hidden";
		}
		this.skipReturnMotion = false;
		this.sheetLeaving = false;
		this.dialog.inert = false;
		MotionEngine.dim(this.dialog, null);
		this.dialog.style.translate = "";
		// Card pages also own input: the feed behind them must remain inert.
		const page = this.isPage(kind);
		const modal = !page || CARD_KINDS.includes(kind);
		const wasModal = !this.isPage(this.modalKind) || CARD_KINDS.includes(this.modalKind);
		if (this.dialog.open && (this.dialog.classList.contains("page") !== page || modal !== wasModal))
			this.dialog.close();
		if (!this.dialog.open) {
			this.lastFocus = document.activeElement as HTMLElement;
			if (!phoneDrawer) this.lockPageScroll();
		}
		const liveToast = document.getElementById("toast");
		if (liveToast && this.dialog.contains(liveToast)) document.body.appendChild(liveToast);
		this.modalKind = kind;
		// An open card owns the desktop: the top bar and the AI box step aside until it closes.
		// At the top of the feed they stay; nothing sits under them there.
		if (this.desktop() && CARD_KINDS.includes(kind) && !this.railHide?.atTop())
			this.railHide?.hide(true);
		this.dialog.className =
			shape || (["reader", "preview", "lightbox", "search"].includes(kind) ? kind : "panel");
		if (page) this.dialog.classList.add("page");
		const card = kind === "preview" ? Store.card(this.currentId) : null;
		if (
			card &&
			(["reminder", "suggestion", "media"].includes(card.type) ||
				(card.type === "note" &&
					(card.body || "").length < 160 &&
					!(card.body || "").includes("\n\n") &&
					(card.summary || "").length < 280))
		)
			this.dialog.classList.add("is-short");
		// @design phone-detail-drawer
		configurePhoneDrawer(this, phoneDrawer);
		// Vaul must measure its initial offscreen frame in a visible host. Mounting it
		// inside a closed native dialog consumes the entry transition before showModal.
		if (phoneDrawer && !this.dialog.open) this.dialog.show();
		// Resizing one video changes layout props, not the player's mount lifecycle.
		if (
			this.dialog.dataset.readerResize === "true" &&
			this.dialog.querySelector("[data-video-surface]")
		)
			renderView(this.dialog, html);
		else renderContent(this.dialog, html);
		if (!this.dialog.open) {
			if (modal) this.dialog.showModal();
			else this.dialog.show();
		}
		// Frequent navigation changes in place; only sheets enter over the current page.
		if (!nested && !MotionEngine.keyboard && (!page || (kind === "reader" && this.desktop())))
			MotionEngine.queuePanel(this.dialog, origin, resume);
		const focus = this.dialog.querySelector<HTMLElement>(
			kind === "search" && this.desktop()
				? "#filter-search"
				: kind === "editor"
					? "#tag-new"
					: "#modal-title",
		);
		if (focus && !phoneDrawer) {
			if (!/INPUT|TEXTAREA|BUTTON/.test(focus.tagName)) focus.tabIndex = -1;
			focus.focus({ preventScroll: true });
		}
	},
	cardRect(this: AppController, id?: string) {
		const el =
			id &&
			(this.searchBackground || this.grid).querySelector<HTMLElement>(
				`[data-card="${CSS.escape(id)}"]`,
			);
		const r = el?.getBoundingClientRect();
		return r?.width && r.bottom > 0 && r.top < innerHeight ? r : null;
	},
	closeNative(this: AppController, animate = true) {
		if (MotionEngine.keyboard && !this.dialog.hasAttribute("data-phone-drawer")) animate = false;
		if (!this.dialog.open) return;
		if (this.modalKind === "search") resetPhoneSearch(this.dialog);
		// The card on the desk shows the progress reached in the detail that is leaving.
		flushReadingProgress();
		// A sheet already dragged off screen closes as it is: no return motion.
		if (this.skipReturnMotion) {
			animate = false;
			this.skipReturnMotion = false;
		}
		if (this.sheetLeaving) return;
		if (
			animate &&
			closePhoneDrawer(this.dialog, () => {
				this.sheetLeaving = false;
				this.closeNative(false);
			})
		) {
			this.sheetLeaving = true;
			return;
		}
		if (
			animate &&
			(!this.isPage(this.modalKind) || ["reader", "lightbox"].includes(this.modalKind))
		) {
			// A desktop detail returns into its card, so the card takes its read colour now. A phone
			// sheet slides away instead; the feed redraws only once it has gone.
			if (
				!matchMedia("(max-width:650px)").matches &&
				["preview", "reader"].includes(this.modalKind)
			)
				flushReadingRefresh(this);
			const token = this.modalToken,
				sheet = MotionEngine.surface(this.dialog),
				opacity = getComputedStyle(sheet).opacity;
			const transform = getComputedStyle(sheet).transform;
			const desktop = !matchMedia("(max-width:650px)").matches;
			const details = desktop
				? [
						...MotionEngine.detailTools(this.dialog),
						...this.dialog.querySelectorAll<HTMLElement>(".preview-body, .reader-body"),
					].map((node: HTMLElement) => ({
						node,
						opacity: getComputedStyle(node).opacity,
						body: node.matches(".preview-body, .reader-body"),
					}))
				: [];
			MotionEngine.cancelPanel(this.dialog);
			const returning =
				!matchMedia("(max-width:650px)").matches && ["preview", "reader"].includes(this.modalKind)
					? this.cardRect(
							MotionEngine.matchedSources.get(this.dialog)?.source?.dataset.card || this.currentId,
						)
					: null;
			const destination = returning
				? MotionEngine.cardTransform(returning, sheet.getBoundingClientRect())
				: null;
			const face = destination ? MotionEngine.prepareReturn(this.dialog, sheet) : null;
			const carried = destination
				? MotionEngine.carryCapsule(this.dialog, sheet, transform, destination, false)
				: null;
			const sourceNode = MotionEngine.matchedSources.get(this.dialog)?.source as
				| HTMLElement
				| undefined;
			const radius =
				face && sourceNode ? parseFloat(getComputedStyle(sourceNode).borderTopLeftRadius) || 0 : 0;
			const targetRect = sheet.getBoundingClientRect();
			const endRadius = returning
				? `${(radius * targetRect.width) / returning.width}px / ${(radius * targetRect.height) / returning.height}px`
				: "";
			this.sheetLeaving = true;
			this.dialog.inert = true;
			// The bars come back with the card, from its first frame and on the same spring.
			if (CARD_KINDS.includes(this.modalKind)) this.railHide?.show(true);
			// A phone sheet slides out opaque on the sheet curve, as a downward drag does.
			const phoneSheet = MotionEngine.phoneSheet(this.dialog);
			MotionEngine.dim(
				this.dialog,
				0,
				destination
					? tokens.motion.cardReturn.duration
					: MotionEngine.time(phoneSheet ? "dur-sheet" : "dur-close"),
				!!destination,
			);
			const animation = MotionEngine.animate(
				sheet,
				[
					destination
						? { transform, ...(face ? { borderRadius: getComputedStyle(sheet).borderRadius } : {}) }
						: phoneSheet
							? { transform }
							: { opacity, transform },
					{
						...(destination || phoneSheet ? {} : { opacity: 0 }),
						...(face ? { borderRadius: endRadius } : {}),
						transform: destination || (phoneSheet ? "translateY(100%)" : "translateY(10px)"),
					},
				],
				{
					duration: phoneSheet ? MotionEngine.time("dur-sheet") : MotionEngine.time("dur-close"),
					// The detail returns to its card with the same spring that opened it.
					...(destination
						? { spring: "card" }
						: phoneSheet
							? { easing: MotionEngine.curve("ease-sheet") }
							: {}),
					fill: "forwards",
				},
			);
			const bar = this.dialog.querySelector<HTMLElement>(
				":scope > .phone-drawer > .float-bar, :scope > .float-bar",
			);
			const barAnimation =
				!desktop && bar && !bar.hasAttribute("data-read-complete")
					? MotionEngine.animate(
							bar,
							[{ opacity: getComputedStyle(bar).opacity }, { opacity: 0 }],
							{
								duration: 100,
								fill: "forwards",
							},
						)
					: null;
			MotionEngine.panelAnimations.set(this.dialog, [
				animation,
				barAnimation,
				carried,
				face,
				...(destination && !face
					? [
							MotionEngine.animate(sheet, [{ opacity }, { opacity: 0 }], {
								...tokens.motion.cardHandoff,
								fill: "forwards",
							}),
						]
					: []),
				...details.map(({ node, opacity, body }) =>
					MotionEngine.animate(
						node,
						[{ opacity }, { opacity: destination && body ? opacity : 0 }],
						{
							duration:
								destination && body ? tokens.motion.cardReturn.duration : tokens.motion.detailFade,
							fill: "forwards",
						},
					),
				),
				...(destination && !face ? [MotionEngine.returnSource(this.dialog)] : []),
			]);
			const finish = () => {
				if (this.modalToken === token && this.sheetLeaving) {
					this.sheetLeaving = false;
					this.closeNative(false);
				}
			};
			if (animation)
				animation.finished.then(finish, () => {
					if (this.modalToken !== token || !this.dialog.open) return;
					this.sheetLeaving = false;
					this.dialog.inert = false;
					MotionEngine.dim(this.dialog, null);
					if (bar) bar.style.opacity = "";
				});
			else finish();
			return;
		}
		this.modalToken++;
		this.previewTrail = [];
		this.detailPositions.clear();
		if (CARD_KINDS.includes(this.modalKind)) this.railHide?.show(true);
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
		MotionEngine.cancel(this.dialog, true);
		this.dialog.close();
		if (this.dialog.hasAttribute("data-phone-drawer")) {
			configurePhoneDrawer(this, false);
			renderContent(this.dialog, null);
		}
		clearPhonePreviews(this);
		MotionEngine.releaseSource(this.dialog);
		const settled = () =>
			!this.searchBackground && (!this.dialog.open || this.modalKind === "search");
		if (this.searchBackground) {
			this.restoreSearch();
			flushReadingRefreshLater(this, settled);
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
		// Measure refreshed cards only after the drawer restores normal page geometry.
		flushReadingRefreshLater(this, settled);
		this.modalKind = "";
		this.panelReturn = null;
		this.updateSelection();
		if (this.navKey !== "home") this.setNav("home");
		// Leftovers of a drag or swipe are cleared only now that nothing is on screen.
		MotionEngine.dim(this.dialog, null);
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
		if (depth && history.state?.prev !== undefined && /^#(card|read)\//.test(location.hash)) {
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
