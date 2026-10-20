import { createElement } from "react";
import { icon } from "../atoms/icons.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { ChromeAutoHide, toolbarTips } from "../interactions/chrome.ts";
import { DragManager } from "../interactions/drag.ts";
import { Gestures } from "../interactions/gestures.ts";
import { FeedLayout } from "../interactions/layout.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "./app.ts";
import { PAGE_KINDS, type TargetEvent, type ViewDialog, type ViewElement } from "./app-types.ts";
import { renderView } from "./react-renderer.ts";
import { AccountRing, WorkspaceShell } from "./shell.tsx";

export const appLifecycleMethods = {
	init(this: AppController) {
		MotionEngine.bind();
		// Track the input that opened the card; restoring focus must not draw a touch selection box.
		document.addEventListener(
			"pointerdown",
			() => {
				document.documentElement.dataset.inputModality = "pointer";
			},
			{ capture: true },
		);
		document.addEventListener(
			"wheel",
			() => {
				document.documentElement.dataset.inputModality = "pointer";
			},
			{ capture: true, passive: true },
		);
		document.addEventListener(
			"keydown",
			(event) => {
				if (!["Meta", "Control", "Alt", "Shift"].includes(event.key))
					document.documentElement.dataset.inputModality = "keyboard";
			},
			{ capture: true },
		);

		if (window.__QG_RUNTIME__) Store.key = "sill-live-v1";
		Store.load();
		if (window.__QG_RUNTIME__) Store.state.cards = [];
		this.sort = Store.pref("sort");
		renderView(document.body, createElement(WorkspaceShell));
		this.grid = document.getElementById("feed-grid") as ViewElement;
		this.dialog = document.getElementById("modal") as ViewDialog;
		this.setNav("home");
		if (typeof ResizeObserver === "function")
			new ResizeObserver(() => this.setNav(this.navKey)).observe(document.getElementById("nav"));
		this.themeQuery = matchMedia("(prefers-color-scheme: dark)");
		this.applyPreferences();
		this.layout = new FeedLayout(this.grid);
		const searchField = document.getElementById("home-search-field");
		if (searchField && typeof ResizeObserver === "function") {
			let width = searchField.getBoundingClientRect().width;
			new ResizeObserver(() => {
				const next = searchField.getBoundingClientRect().width;
				if (this.desktop()) MotionEngine.searchResize(searchField, width);
				width = next;
			}).observe(searchField);
		}
		this.pageLimit = 40;
		this.drag = new DragManager(this);
		this.gestures = new Gestures(this);
		document.addEventListener("click", (e?: TargetEvent<MouseEvent>) => this.click(e));
		toolbarTips(document);
		this.grid.addEventListener("contextmenu", (e: MouseEvent) => {
			const card = (e.target as Element).closest<HTMLElement>("[data-card]");
			if (!card || this.drag.active || this.drag.pending) return;
			e.preventDefault();
			this.more(card.dataset.card);
		});
		document.getElementById("selection-bar").addEventListener("contextmenu", (e: MouseEvent) => {
			if (!this.selected.size || this.drag.active || this.drag.pending) return;
			e.preventDefault();
			const trigger =
				(e.target as Element).closest<HTMLElement>("button") ||
				document.querySelector<HTMLElement>('[data-action="selected-bookmark"]');
			this.drag.openMenu([...this.selected], trigger, { x: e.clientX, y: e.clientY });
		});
		this.bindStacks();
		document.addEventListener("input", (e?: TargetEvent<Event>) => this.input(e));
		document.addEventListener("compositionend", (e?: TargetEvent<Event>) => this.input(e));
		this.bindKeyboard();
		document.addEventListener("keydown", (e?: TargetEvent<KeyboardEvent>) => this.key(e));
		document.addEventListener("paste", (e?: TargetEvent<ClipboardEvent>) => this.paste(e));
		["pointerdown", "keydown", "wheel", "touchstart"].forEach((type?: string) => {
			document.addEventListener(type, () => (this.lastActivity = Date.now()), { passive: true });
		});
		document.addEventListener("focusin", (e?: TargetEvent<Event>) => {
			const menu = document.querySelector<HTMLElement>(".card-more-menu");
			if (
				menu &&
				!menu.contains(e.target) &&
				!e.target.closest?.<HTMLElement>('[data-action="card-more"]')
			)
				this.closeMore();
			if (this.editingId && !e.target.closest?.<HTMLElement>(".is-editing"))
				this.finishInlineEdit();
		});
		this.bindDialog();
		const toast = document.getElementById("toast");
		toast.addEventListener("pointerenter", () => {
			this.toastHover = true;
			this.updateToastClock();
		});
		toast.addEventListener("pointerleave", () => {
			this.toastHover = false;
			this.updateToastClock();
		});
		toast.addEventListener("focusin", () => this.updateToastClock());
		toast.addEventListener("focusout", () => queueMicrotask(() => this.updateToastClock()));
		window.addEventListener("blur", () => this.updateToastClock(true));
		window.addEventListener("focus", () => this.updateToastClock());
		document.addEventListener("visibilitychange", () => this.updateToastClock());
		const dock = document.getElementById("dock");
		// The rail tucks away while reading on and returns on a pause or a turn back.
		this.railHide = new ChromeAutoHide(
			window,
			() =>
				[dock, document.getElementById("home-top"), document.getElementById("scroll-edge")].filter(
					Boolean,
				),
			() =>
				this.dialog.open ||
				this.drag?.active ||
				this.drag?.menu?.open ||
				(this.desktop() &&
					(this.homeMenuOpen || document.activeElement?.matches("#home-search, #ai-dock-input"))),
		);
		window.addEventListener("popstate", () => this.route());
		window.addEventListener("hashchange", () => this.route());
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				Store.save();
			} else this.checkReminders();
		});
		window.addEventListener("pagehide", () => Store.save());
		window.addEventListener(
			"scroll",
			() => {
				this.paintPending();
				if (
					this.hasMore &&
					!this.dialog.open &&
					scrollY + innerHeight * 2 > document.documentElement.scrollHeight
				) {
					this.pageLimit += 40;
					this.renderCurrent(false);
				}
			},
			{ passive: true },
		);
		this.bindCaptureDrop();
		this.themeQuery.addEventListener?.("change", () => this.applyPreferences());
		this.readTicker = setInterval(() => this.tick(), 1000);
		if (!location.hash) history.replaceState({ glass: true, prev: null }, "", "#" + this.mode);
		this.renderCurrent(true);
		this.route();
		this.checkReminders();
		window.__app = this;
		window.__store = Store; // Deliberate test hooks, no network credentials or private data.
	},
	bindDialog(this: AppController) {
		this.dialog.addEventListener("cancel", (e?: TargetEvent<Event>) => {
			e.preventDefault();
			if (this.modalKind === "search" && this.selected.size) this.action("clear-selection");
			else this.closeModal();
		});
		this.dialog.addEventListener("click", (e?: TargetEvent<MouseEvent>) => {
			if (e.target !== this.dialog) return;
			if (this.modalKind === "lightbox" || this.dialog.classList.contains("page")) return;
			// A click on the dim area, outside the sheet and its toolbar, closes the overlay.
			const inside = [...this.dialog.children].some((n?: HTMLElement) => {
				const r = n.getBoundingClientRect();
				return (
					e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
				);
			});
			// Stacked cards close one at a time, like the close button.
			if (!inside) this.closeModal();
		});
	},
	applyPreferences(this: AppController) {
		const theme = Store.pref("theme"),
			dark = theme === "dark" || (theme === "system" && this.themeQuery?.matches);
		document.documentElement.dataset.theme = dark ? "dark" : "light";
		const canvas = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
		for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
			meta.content = canvas;
		}
		document.body.dataset.density = Store.pref("density");
		this.sort = Store.pref("floatTimely") ? Store.pref("sort") : "time";
	},
	announce(this: AppController, text?: string) {
		document.getElementById("announcer").textContent = text;
	},
	bindKeyboard(this: AppController) {
		const vv = window.visualViewport;
		if (!vv) return;
		let frame = 0;
		const sync = () => {
			frame = 0;
			const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
			document.documentElement.style.setProperty("--kb", `${kb}px`);
			document.body.classList.toggle("keyboard-open", kb > 120);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(sync);
		};
		vv.addEventListener("resize", schedule);
		vv.addEventListener("scroll", schedule);
		window.addEventListener("resize", schedule);
		sync();
	},
	paintAccount(this: AppController) {
		const face = document.querySelector<HTMLElement>("#account .account-wrap");
		if (face) renderView(face, createElement(AccountRing));
	},
	accountRing(this: AppController) {
		return `${icon("person", 22)}<svg class="orb-arc" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" pathLength="100"/></svg><span class="orb-done" aria-hidden="true">${icon("check", 16)}</span>`;
	},
	navHTML(this: AppController) {
		const tab = (key: string, face: string, label: string, aria = label) =>
			`<button type="button" class="nav-tab" data-action="nav" data-extra="${key}" aria-label="${aria}"${key === "home" ? ' aria-current="page"' : ""}><span class="nav-icon">${face}</span></button>`;
		return `<nav class="nav-capsule glass" id="nav" aria-label="${copy("web.nav.label")}"><span class="nav-lens" aria-hidden="true"></span>${tab("home", icon("home", 22), copy("web.nav.home"))}${tab("ai", icon("chat", 22), copy("web.nav.ai"), copy("web.nav.aiLabel"))}${tab("search", icon("search", 22), copy("web.nav.search"))}</nav>`;
	},
	setNav(this: AppController, key: string) {
		const nav = document.getElementById("nav");
		if (!nav) return;
		this.navKey = key;
		const tab = nav.querySelector<HTMLElement>(
			`[data-extra="${key === "settings" ? "home" : key}"]`,
		);
		if (!tab) return;
		nav.querySelectorAll<HTMLElement>(".nav-tab").forEach((n) => {
			if (n === tab) n.setAttribute("aria-current", "page");
			else n.removeAttribute("aria-current");
		});
		nav.style.setProperty("--lens-x", `${tab.offsetLeft}px`);
		nav.style.setProperty("--lens-w", `${tab.offsetWidth}px`);
	},
	isPage(this: AppController, kind: string) {
		return PAGE_KINDS.includes(kind);
	},
	goTo(this: AppController, key: string) {
		clearTimeout(this.navOpenTimer);
		this.navOpenTimer = 0;
		if (key === "home") {
			if (this.searchBackground || this.modalKind === "search") {
				history.replaceState({ glass: true, prev: null }, "", "#feed");
				this.lastRouteHash = "#feed";
			}
			this.discardSearchBackground();
			this.setNav("home");
			if (this.dialog.open) this.closeNative();
			else {
				window.scrollTo({ top: 0, behavior: "instant" });
				this.railHide?.syncPosition();
				this.railHide?.show();
			}
			return;
		}
		if (key === "search" && this.searchBackground) {
			this.closeNative();
			return;
		}
		if (this.modalKind === key && this.dialog.open) {
			this.setNav(key);
			return;
		}
		this.setNav(key);
		const open = () => {
			this.navOpenTimer = 0;
			if (this.navKey !== key) return;
			if (key === "settings") this.settingsGroup = "desk";
			this.openPanel(key);
		};
		open();
	},
};
