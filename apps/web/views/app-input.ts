import { internalCardRoute } from "../atoms/markdown.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";
import {
	revealPhoneSearchResults,
	type SearchPose,
	syncPhoneSearchKeyboard,
	transitionPhoneSearch,
} from "../interactions/phone-search-motion.ts";
import { armedTag, armLastTag } from "../interactions/tag-input-motion.ts";
import { action as dispatchAction } from "./actions/index.ts";
import type { AppController } from "./app.ts";
import type { Deck, TargetEvent } from "./app-types.ts";
import { hasNestedViews, renderView } from "./react-renderer.ts";

export const appInputMethods = {
	setSearchEditing(this: AppController, editing: boolean, captured?: SearchPose, typing = editing) {
		if (this.desktop() || this.modalKind !== "search") return;
		// Back in a field that is still searching: only the keyboard returns, so only the tab bar leaves.
		if (editing && this.dialog.classList.contains("search-editing"))
			syncPhoneSearchKeyboard(this.dialog, typing);
		else transitionPhoneSearch(this.dialog, editing, captured, typing);
	},
	click(this: AppController, e?: TargetEvent<MouseEvent>) {
		if (e.defaultPrevented) return;
		const link = e.target.closest?.<HTMLAnchorElement>(".markdown a[href]");
		const route = link && internalCardRoute(link.href, location.href);
		if (route && Store.card(route.slice(route.indexOf("/") + 1))) {
			e.preventDefault();
			e.stopPropagation();
			this.navigate(route);
			return;
		}
		const externalLink = e.target.closest?.<HTMLAnchorElement>("a[href]");
		if (externalLink && window.__SILL_HOST__ && /^(https?:|mailto:)/.test(externalLink.href)) {
			e.preventDefault();
			e.stopPropagation();
			void this.openExternal(undefined, externalLink.href);
			return;
		}
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
			this.aiHeight !== "full" &&
			!e.target.closest<HTMLElement>(".card-actions, .is-editing") &&
			(e.metaKey || e.ctrlKey || e.shiftKey || this.selected.size)
		) {
			e.preventDefault();
			e.stopPropagation();
			this.select(picked.dataset.card, { range: e.shiftKey });
			return;
		}
		const el = e.target.closest?.<HTMLElement & { disabled?: boolean }>("[data-action]");
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
		const wasBrowse = !!this.dialog.querySelector(".search-browse");
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
		// Typing repaints the suggestion and result lists on their own roots; updating the page in
		// place then removed nodes already gone, and a type chip left a blank page. Render afresh.
		renderView(this.dialog, Panels.search(this), hasNestedViews(this.dialog));
		const field = this.dialog.querySelector<HTMLInputElement>("#filter-search");
		if (field && field.value !== this.searchFilter.query) field.value = this.searchFilter.query;
		if (!this.desktop() && wasBrowse && !this.dialog.querySelector(".search-browse"))
			revealPhoneSearchResults(this.dialog);
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
		if (!this.desktop() || this.dialog.open) return false;
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
		if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
			e.preventDefault();
			// Holding ⌘K repeats the key; only the first press focuses, so nothing redraws while held.
			if (e.repeat) return true;
			this.railHide?.show();
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
		// Arrows open the list; active candidates then follow the reference combobox keys.
		const field = document.getElementById("home-search-field");
		const opening =
			!field?.classList.contains("is-open") && ["ArrowDown", "ArrowUp"].includes(e.key);
		if (opening) this.openHomeSearch(true);
		const options = this.homeHashOptions();
		if (options.length && (e.key === "Home" || e.key === "End")) {
			e.preventDefault();
			field?.classList.add("suggestion-engaged");
			this.homeHashIndex = e.key === "Home" ? 0 : options.length - 1;
			this.syncHomeHash(true);
			return true;
		}
		if (e.key === "Escape" && input.getAttribute("aria-expanded") === "true") {
			e.preventDefault();
			this.openHomeSearch(false);
			return true;
		}
		if (e.key === "Tab" && options.length) {
			if (field?.classList.contains("suggestion-engaged"))
				this.action("home-hash", "", options[this.homeHashIndex].extra);
			this.openHomeSearch(false);
			return false;
		}
		if (options.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			field?.classList.add("suggestion-engaged");
			this.homeHashIndex = opening
				? e.key === "ArrowUp"
					? options.length - 1
					: 0
				: (this.homeHashIndex + step + options.length) % options.length;
			this.syncHomeHash(true);
			return true;
		}
		if (options.length && e.key === "Enter" && !e.isComposing) {
			e.preventDefault();
			this.action("home-hash", "", options[Math.min(this.homeHashIndex, options.length - 1)].extra);
			return true;
		}
		const tabbed = (this.homeTab() || "all") !== "all";
		const marked = this.filter.mark !== "all" || !!this.filter.tag;
		if (e.key === "Escape") {
			e.preventDefault();
			if (input.value) {
				input.value = "";
				this.filter = { ...this.filter, query: "", kind: "all" };
				clearTimeout(this.homeSearchTimer);
				this.renderCurrent(false);
			} else if (tabbed || marked) {
				// Only tokens left: all of them go at once, back to everything.
				this.filter = { ...this.filter, mark: "all", tag: "" };
				if (tabbed) this.action("home-tab", "", "all");
				else this.renderCurrent(false);
			} else input.blur();
			return true;
		}
		if (e.key === "Backspace" && !input.value && input.selectionStart === 0 && (tabbed || marked)) {
			// From the end: the # tag, then the # status, then the tab.
			e.preventDefault();
			if (this.filter.tag) this.action("home-untoken", "", "tag");
			else if (this.filter.mark !== "all") this.action("home-untoken", "", "mark");
			else this.action("home-tab", "", "all");
			return true;
		}
		return false;
	},
	repaintSearchHash(this: AppController) {
		const slot = document.getElementById("search-hash-slot");
		if (slot) renderView(slot, this.desktop() ? Panels.searchHashList(this) : null);
	},
	input(this: AppController, e?: TargetEvent<Event> & { isComposing?: boolean }) {
		if (e.target.id === "ai-local-draft" || e.target.id === "ai-dock-input") {
			this.aiDraft = (e.target as HTMLTextAreaElement).value;
			return;
		}
		// While an input method is composing (pinyin, kana), the text is not final: wait for compositionend.
		if (e.isComposing) return;
		if (e.target.id === "tag-new") {
			// Typing disarms the last chip; a phone keyboard's comma arrives here, not as a key.
			armLastTag(document.getElementById("editor-tags"), false);
			if (/[,，]/.test((e.target as HTMLInputElement).value)) this.action("add-tag", this.editId);
			return;
		}
		if (e.target.dataset.input === "home-search") {
			const field = document.getElementById("home-search-field");
			field?.classList.add("is-open", "suggestion-engaged");
			const value = (e.target as HTMLInputElement).value;
			// The type chips leave with the text; a hidden chip never keeps filtering.
			const kind = this.searchText(value) ? this.filter.kind : "all";
			this.homeHashIndex = 0;
			this.filter = { ...this.filter, query: value, kind };
			this.syncHomeSearch();
			clearTimeout(this.homeSearchTimer);
			this.homeSearchTimer = window.setTimeout(() => {
				this.homeSearchTimer = 0;
				this.pageLimit = 40;
				this.withFeedAnchor(() => {}, true);
				window.scrollTo({ top: 0, behavior: "instant" });
				this.railHide?.syncPosition();
			}, 140);
			return;
		}
		if (e.target.dataset.input === "search") {
			this.searchFilter.query = e.target.value;
			const suggest = document.getElementById("search-suggest");
			if (suggest) renderView(suggest, Panels.searchSuggest(this));
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
					const firstResults = !!results.querySelector(".search-browse");
					const shown = new Set(
						[...results.querySelectorAll<HTMLElement>("[data-card]")].map((n) => n.dataset.card),
					);
					renderView(results, Panels.searchResults(this));
					if (!this.desktop() && firstResults && !results.querySelector(".search-browse"))
						revealPhoneSearchResults(this.dialog);
					// Cards that stay keep their place and look; only those the new query adds fade in.
					else
						for (const card of results.querySelectorAll<HTMLElement>("[data-card]"))
							if (!shown.has(card.dataset.card)) MotionEngine.arrive(card);
					results.scrollTop = 0;
					this.revealImages(results);
					this.updateSelection();
				}
			}, 140);
		}
	},
	key(this: AppController, e?: TargetEvent<KeyboardEvent>) {
		if (e.isComposing) return;
		// Over everything else, the tags layer takes Escape: first to let go of a marked chip.
		if (e.key === "Escape" && this.editorLayer?.open) {
			e.preventDefault();
			const list = document.getElementById("editor-tags");
			if (armedTag(list) !== undefined) armLastTag(list, false);
			else this.closeEditor();
			return;
		}
		if (this.homeKey(e)) return;
		if (this.aiKey(e)) return;
		if (e.key === "Escape" && this.modalKind === "search" && this.selected.size) {
			e.preventDefault();
			this.action("clear-selection");
			return;
		}
		if (
			e.key === "Escape" &&
			this.modalKind === "search" &&
			this.dialog.classList.contains("search-editing")
		) {
			e.preventDefault();
			this.action("search-reset");
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
		if (e.target.id === "tag-new") {
			const input = e.target as HTMLInputElement;
			const list = document.getElementById("editor-tags");
			if (e.key === "Enter" || e.key === "," || e.key === "，") {
				e.preventDefault();
				this.action("add-tag", this.editId);
				return;
			}
			// Backspace on an empty field: the first press arms the last chip, the second removes it.
			if (e.key === "Backspace" && !input.value && input.selectionEnd === 0) {
				const armed = armedTag(list);
				if (armed === undefined) armLastTag(list, true);
				else this.action("editor-tag", this.editId, armed);
				e.preventDefault();
				return;
			}
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
			// The phone keyboard's Search key closes the keyboard and leaves the results to browse.
			if (!this.desktop()) {
				(e.target as HTMLElement).blur();
				return;
			}
			const first = this.dialog.querySelector<HTMLElement>(
				'#search-results .card-title-button[data-action="card-open"]',
			);
			if (first) first.click();
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
