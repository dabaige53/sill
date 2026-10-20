import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import { action as dispatchAction } from "./actions/index.ts";
import type { AppController } from "./app.ts";
import type { Deck, TargetEvent } from "./app-types.ts";
import { renderContent, renderView } from "./react-renderer.ts";

export const appInputMethods = {
	click(this: AppController, e?: TargetEvent<MouseEvent>) {
		// The end of a sideways drag through a stack is not a tap.
		if (this.stackDragUntil > Date.now() && e.target.closest?.<HTMLElement>("[data-stack]")) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		const picked = e.target.closest?.<HTMLElement>(
			"#feed-grid [data-card], #search-results [data-card]",
		);
		if (
			picked &&
			this.selectionContext().grid?.contains(picked) &&
			!e.target.closest<HTMLElement>(".card-actions, .card-more-menu, .is-editing") &&
			(e.metaKey || e.ctrlKey || e.shiftKey || this.selected.size)
		) {
			e.preventDefault();
			e.stopPropagation();
			this.closeMore();
			this.select(picked.dataset.card, { range: e.shiftKey });
			return;
		}
		const el = e.target.closest?.<HTMLElement & { disabled?: boolean }>("[data-action]");
		if (el?.closest<HTMLElement>(".card-more-menu")) this.closeMore(true);
		else if (
			!el?.matches('[data-action="card-more"]') &&
			!e.target.closest?.<HTMLElement>(".card-more-menu")
		)
			this.closeMore();
		if (this.editingId && !e.target.closest?.<HTMLElement>(".is-editing")) this.finishInlineEdit();
		if (el) {
			if (el.disabled) return;
			e.preventDefault();
			e.stopPropagation();
			this.action(el.dataset.action, el.dataset.id, el.dataset.extra, el, e);
			return;
		}
		if (e.target.closest?.<HTMLElement>(".is-editing")) return;
		const stack = e.target.closest?.<HTMLElement>("[data-stack]");
		if (stack && !e.target.closest<HTMLElement>("button,a,input,textarea")) {
			this.action("stack-open", "", stack.dataset.stack);
			return;
		}
		const card = e.target.closest?.<HTMLElement>("[data-card]");
		if (card && !e.target.closest<HTMLElement>("button,a,input,textarea")) {
			this.navigate("#card/" + card.dataset.card);
			return;
		}
	},
	action(
		this: AppController,
		name?: string,
		id: string = "",
		extra: string = "",
		el: HTMLElement = null,
		event: Event = null,
	): undefined {
		return dispatchAction.call(this, name, id, extra, el, event);
	},
	repaintSearch(this: AppController) {
		clearTimeout(this.searchTimer);
		this.searchScroll = 0;
		this.searchLimit = 40;
		if (this.modalKind !== "search") {
			return;
		}
		const active = document.activeElement as HTMLElement,
			searchFocused = active?.id === "filter-search",
			pos = (active as HTMLInputElement)?.selectionStart;
		const action = (active as HTMLElement)?.dataset.action,
			extra = (active as HTMLElement)?.dataset.extra;
		const liveToast = document.getElementById("toast");
		if (liveToast && this.dialog.contains(liveToast)) document.body.appendChild(liveToast);
		const filterScroll = [...this.dialog.querySelectorAll<HTMLElement>(".search-filter-items")].map(
			(row) => row.scrollLeft,
		);
		renderContent(this.dialog, Panels.search(this));
		this.bindSearchResults();
		this.dialog.querySelectorAll<HTMLElement>(".search-filter-items").forEach((row, index) => {
			row.scrollLeft = filterScroll[index] ?? 0;
		});
		if (searchFocused) {
			const n = document.getElementById("filter-search");
			n.focus();
			try {
				(n as HTMLInputElement).setSelectionRange(pos, pos);
			} catch {}
		} else if (action)
			[...this.dialog.querySelectorAll<HTMLElement>("[data-action]")]
				.find((n?: HTMLElement) => n.dataset.action === action && n.dataset.extra === extra)
				?.focus({ preventScroll: true });
		this.revealImages(this.dialog);
	},
	/** Desktop top bar keys (ADR 0049). Escape steps back one layer: menu, text, token, focus. */
	homeKey(this: AppController, e?: TargetEvent<KeyboardEvent>) {
		if (!this.desktop()) return false;
		const input = document.getElementById("home-search") as HTMLInputElement | null;
		if (!input) return false;
		const menu = document.getElementById("home-menu");
		if (this.homeMenuOpen && menu && !menu.hidden) {
			if (e.key === "Escape") {
				e.preventDefault();
				this.action("home-menu");
				document.getElementById("home-menu-toggle")?.focus({ preventScroll: true });
				return true;
			}
			if (["ArrowDown", "ArrowUp"].includes(e.key)) {
				const items = [...menu.querySelectorAll<HTMLElement>(".home-menu-item")];
				const index = items.indexOf(document.activeElement as HTMLElement);
				const next =
					index < 0
						? e.key === "ArrowDown"
							? 0
							: items.length - 1
						: (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
				e.preventDefault();
				items[next]?.focus();
				return true;
			}
		}
		if (this.dialog.open) return false;
		if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
			e.preventDefault();
			input.focus();
			input.select();
			return true;
		}
		const tabs = ["all", "unread", "todo", "later", "saved"];
		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && /^[1-5]$/.test(e.key)) {
			e.preventDefault();
			this.action("home-tab", "", tabs[Number(e.key) - 1]);
			return true;
		}
		if (e.target !== input) return false;
		if (e.key === "Escape") {
			e.preventDefault();
			if (input.value) {
				input.value = "";
				this.filter = { ...this.filter, query: "" };
				clearTimeout(this.homeSearchTimer);
				this.renderCurrent(false);
			} else if ((this.homeTab() || "all") !== "all") this.action("home-tab", "", "all");
			else input.blur();
			return true;
		}
		if (
			e.key === "Backspace" &&
			!input.value &&
			input.selectionStart === 0 &&
			(this.homeTab() || "all") !== "all"
		) {
			e.preventDefault();
			this.action("home-tab", "", "all");
			return true;
		}
		return false;
	},
	repaintSearchHash(this: AppController) {
		const slot = document.getElementById("search-hash-slot");
		if (slot) renderView(slot, Panels.searchHashList(this));
	},
	input(this: AppController, e?: TargetEvent<Event> & { isComposing?: boolean }) {
		if (e.target.id === "ai-local-draft" || e.target.id === "ai-dock-input") {
			this.aiDraft = (e.target as HTMLTextAreaElement).value;
			return;
		}
		// While an input method is composing (pinyin, kana), the text is not final: wait for compositionend.
		if (e.isComposing) return;
		if (e.target.dataset.input === "home-search") {
			const value = (e.target as HTMLInputElement).value;
			this.filter = { ...this.filter, query: value };
			this.syncHomeSearch();
			clearTimeout(this.homeSearchTimer);
			this.homeSearchTimer = window.setTimeout(() => {
				this.homeSearchTimer = 0;
				this.pageLimit = 40;
				this.renderCurrent(false);
				window.scrollTo({ top: 0, behavior: "instant" });
				this.railHide?.syncPosition();
			}, 140);
			return;
		}
		if (e.target.dataset.input === "search") {
			this.searchFilter.query = e.target.value;
			const clear = document.querySelector<HTMLButtonElement>(".search-clear");
			if (clear) clear.hidden = !e.target.value;
			const chips = document.querySelector<HTMLElement>(".search-chips");
			if (chips) chips.hidden = !this.searchText(e.target.value);
			this.repaintSearchHash();
			this.searchScroll = 0;
			this.searchLimit = 40;
			document.getElementById("filter-result").textContent =
				`${Object.values(this.searchAll(this.searchFilter.query)).flat().length}${copy("web.common.cardCountSuffix")}`;
			clearTimeout(this.searchTimer);
			this.searchTimer = window.setTimeout(() => {
				this.searchTimer = 0;
				const results = document.getElementById("search-results");
				if (results) {
					renderView(results, Panels.searchResults(this));
					results.scrollTop = 0;
					this.revealImages(results);
					this.updateSelection();
				}
			}, 140);
		}
		if (this.editingId && e.target.closest?.<HTMLElement>(".inline-editor")) {
			const state = document.getElementById("inline-state");
			if (state) state.textContent = copy("web.cloudentry.6bdb4435095e");
			clearTimeout(this.inlineTimer);
			this.inlineTimer = window.setTimeout(() => this.saveInlineEdit(), 500);
		}
	},
	paste(this: AppController, e?: TargetEvent<ClipboardEvent>) {
		// Paste a link or a line anywhere on the desk to keep it.
		if (this.dialog.open || e.target.closest?.<HTMLElement>("input,textarea,[contenteditable]"))
			return;
		const text = e.clipboardData?.getData("text/plain");
		if (!text?.trim()) return;
		e.preventDefault();
		this.capture(text);
	},
	key(this: AppController, e?: TargetEvent<KeyboardEvent>) {
		if (e.isComposing) return;
		if (this.homeKey(e)) return;
		if (
			(!this.dialog.open || this.modalKind === "search") &&
			!e.target.closest?.<HTMLElement>("input,textarea,[contenteditable]") &&
			(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
		) {
			if (
				e.target.closest?.<HTMLElement>("#selection-bar, #search-selection-bar") &&
				this.selected.size
			) {
				e.preventDefault();
				this.drag.openMenu([...this.selected], e.target);
				return;
			}
			const card = e.target.closest?.<HTMLElement>("[data-card]");
			if (card) {
				e.preventDefault();
				this.more(card.dataset.card);
				return;
			}
		}
		if (
			e.key === "Escape" &&
			this.modalKind === "search" &&
			this.dialog.querySelector<HTMLElement>(".card-more-menu")
		) {
			e.preventDefault();
			this.closeMore(true);
			return;
		}
		if (e.key === "Escape" && this.modalKind === "search" && this.selected.size) {
			e.preventDefault();
			this.action("clear-selection");
			return;
		}
		// Search selection gets the first Escape; only then does a page return home.
		if (e.key === "Escape" && this.dialog.open && this.dialog.classList.contains("page")) {
			e.preventDefault();
			if (this.searchBackground) this.closeNative();
			else this.goTo("home");
			return;
		}
		if (e.key === "Escape" && this.modalKind === "search") {
			e.preventDefault();
			this.closeModal();
			return;
		}
		const radio = e.target.closest?.<HTMLElement>('[role="radio"]'),
			group = radio?.closest<HTMLElement>('[role="radiogroup"]');
		if (
			group &&
			["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
		) {
			const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')],
				i = radios.indexOf(radio);
			const index =
				e.key === "Home"
					? 0
					: e.key === "End"
						? radios.length - 1
						: (i + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) + radios.length) %
							radios.length;
			e.preventDefault();
			radios[index].focus();
			radios[index].click();
			return;
		}
		const menu = e.target.closest?.<HTMLElement>(".card-more-menu");
		if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
			const items = [...menu.querySelectorAll<HTMLElement>("button")],
				index = items.indexOf(document.activeElement as HTMLElement);
			const next =
				e.key === "Home"
					? 0
					: e.key === "End"
						? items.length - 1
						: (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
			e.preventDefault();
			items[next]?.focus();
			return;
		}
		if (e.key === "Escape" && this.grid.querySelector<HTMLElement>(".card-more-menu")) {
			e.preventDefault();
			this.closeMore(true);
			return;
		}
		if (e.key === "Escape" && this.editingId) {
			e.preventDefault();
			const id = this.editingId;
			this.finishInlineEdit();
			this.grid
				.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"] .card-title-button`)
				?.focus();
			return;
		}
		if (this.modalKind === "lightbox" && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
			e.preventDefault();
			this.action("photo-step", this.currentId, e.key === "ArrowLeft" ? "-1" : "1");
			return;
		}
		if (e.key === "Tab" && this.dialog.open) {
			const page = this.dialog.classList.contains("page");
			const focusable = [
				...this.dialog.querySelectorAll<HTMLElement>(
					'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]',
				),
				...(page ? document.querySelectorAll<HTMLElement>("#nav button") : []),
			].filter(
				(n?: HTMLElement) =>
					n.getClientRects().length && getComputedStyle(n).visibility !== "hidden",
			);
			const first = focusable[0],
				last = focusable[focusable.length - 1],
				active = document.activeElement as HTMLElement;
			if (first && last) {
				if (page) {
					const index = focusable.indexOf(active);
					const next =
						index < 0 ? (e.shiftKey ? focusable.length - 1 : 0) : index + (e.shiftKey ? -1 : 1);
					e.preventDefault();
					focusable[(next + focusable.length) % focusable.length].focus();
					return;
				}
				if (e.shiftKey && (active === first || !focusable.includes(active))) {
					e.preventDefault();
					last.focus();
					return;
				}
				if (!e.shiftKey && active === last) {
					e.preventDefault();
					first.focus();
					return;
				}
			}
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
			e.preventDefault();
			if (this.modalKind !== "search") this.openPanel("search");
			return;
		}
		if (e.target.id === "tag-new" && e.key === "Enter") {
			e.preventDefault();
			this.action("add-tag", this.editId);
			return;
		}
		if (e.target.id === "filter-search" && e.key === "Backspace") {
			const input = e.target as HTMLInputElement;
			const f = this.searchFilter;
			if (!input.value && input.selectionStart === 0 && input.selectionEnd === 0) {
				const last = f.tag ? "tag" : f.status !== "all" ? "status" : f.pinned ? "type" : "";
				if (last) {
					e.preventDefault();
					this.action("search-untoken", "", last);
				}
				return;
			}
		}
		if (e.target.id === "filter-search" && e.key === "Enter") {
			e.preventDefault();
			const option = this.dialog.querySelector<HTMLElement>(".search-hash-option");
			if (option) {
				option.click();
				return;
			}
			const first = this.dialog.querySelector<HTMLElement>(
				'#search-results .card-title-button[data-action="card-open"]',
			);
			if (first) first.click();
			return;
		}
		if (e.target.id === "capture-text" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.action("capture-save");
			return;
		}
		if (e.key === "Escape" && !this.dialog.open) {
			if (this.selected.size) {
				this.selected.clear();
				this.updateSelection();
			}
			return;
		}
		const typing = e.target.closest?.<HTMLElement>("input,textarea,[contenteditable]");
		if (
			Store.pref("singleKeyShortcuts") &&
			!this.dialog.open &&
			!typing &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey
		) {
			if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				this.openPanel("capture");
				return;
			}
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				this.gestures.refresh();
				return;
			}
			if (e.key === "t" || e.key === "T") {
				e.preventDefault();
				this.action("top");
				return;
			}
		}
		if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-card]")) {
			e.preventDefault();
			this.navigate("#card/" + e.target.dataset.card);
		}
		if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-stack]")) {
			e.preventDefault();
			this.action("stack-open", "", e.target.dataset.stack);
		}
		if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.matches("[data-stack]")) {
			const deck = e.target.querySelector<Deck>(".deck");
			if (deck) {
				e.preventDefault();
				deck._cancelGesture?.();
				clearTimeout(deck._wheel?.t);
				deck._wheel = null;
				deck._finish?.();
				this.deckShow(deck, Number(deck.dataset.cur || 0) + (e.key === "ArrowRight" ? 1 : -1));
			}
		}
	},
};
