import { createElement, Fragment } from "react";
import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "./app.ts";
import { renderView } from "./react-renderer.ts";

export const appSelectionMethods = {
	selectionAIHTML(this: AppController) {
		return `<div class="selection-ai-target glass" hidden role="region" aria-label="${esc(copy("web.ai.dock"))}">${icon("chat", 20)}<input class="selection-ai-input" readonly tabindex="-1" aria-label="${esc(copy("web.ai.dock"))}" placeholder="${esc(copy("web.ai.dockPlaceholder"))}">${icon("up", 20)}</div>`;
	},
	openSelectionAI(this: AppController, ids: string[]) {
		// Desktop: the cards join the bottom AI box as context; nothing is sent (ADR 0049).
		if (this.desktop() && this.modalKind !== "search") {
			const added = ids.filter((id) => Store.card(id));
			if (!added.length) return;
			this.aiSelectionIds = [...new Set([...this.aiSelectionIds, ...added])];
			this.selected.clear();
			this.updateSelection();
			window.dispatchEvent(new Event("sill:expand-ai"));
			this.renderAIDock();
			// The selection bar leaves first (180ms); the AI box can take focus once it is back.
			window.setTimeout(
				() => document.getElementById("ai-dock-input")?.focus({ preventScroll: true }),
				200,
			);
			return;
		}
		this.aiSelectionIds = [...new Set(ids)].filter((id) => Store.card(id));
		if (!this.aiSelectionIds.length) return;
		this.openPanel("ai");
	},
	/** Context cards above the AI box: the card title and a remove button, nothing more. */
	renderAIDock(this: AppController) {
		const box = document.getElementById("ai-dock-context");
		if (!box) return;
		const previousIds = new Set(
			[...box.querySelectorAll<HTMLElement>("[data-ai-context]")].map(
				(node) => node.dataset.aiContext,
			),
		);
		this.aiSelectionIds = this.aiSelectionIds.filter((id) => Store.card(id));
		renderView(
			box,
			createElement(
				Fragment,
				null,
				...this.aiSelectionIds.map((id) =>
					createElement(
						"span",
						{ key: id, className: "ai-dock-chip", "data-ai-context": id },
						createElement("span", { className: "ai-dock-chip-title" }, Store.card(id).title),
						createElement(
							"button",
							{
								type: "button",
								"data-action": "ai-context-remove",
								"data-id": id,
								"aria-label": `${copy("web.ai.removeContext")} ${Store.card(id).title}`,
							},
							createElement(Icon, { name: "x", size: 11 }),
						),
					),
				),
			),
		);
		for (const node of box.querySelectorAll<HTMLElement>("[data-ai-context]")) {
			if (!previousIds.has(node.dataset.aiContext))
				MotionEngine.animate(
					node,
					[
						{ opacity: 0, transform: "translateY(4px)" },
						{ opacity: 1, transform: "none" },
					],
					{ duration: MotionEngine.time("fast") },
				);
		}
		const input = document.getElementById("ai-dock-input") as HTMLInputElement | null;
		if (input && input.value !== this.aiDraft) input.value = this.aiDraft;
	},
	markSelectionCard(this: AppController, node: HTMLElement, selection: Set<string>) {
		const selected = selection.has(node.dataset.card);
		node.classList.toggle("is-selected", selected);
		const title = node.querySelector<HTMLElement>(".card-title-button");
		if (selection.size) title?.setAttribute("aria-pressed", String(selected));
		else title?.removeAttribute("aria-pressed");
	},
	selectionContext(this: AppController) {
		const search = this.modalKind === "search";
		return {
			grid: search ? this.dialog.querySelector<HTMLElement>("#search-results") : this.grid,
			selected: search ? this.searchSelected : this.homeSelected,
			bar: document.getElementById(search ? "search-selection-bar" : "selection-bar"),
			search,
		};
	},
	bindSearchSelection(this: AppController) {
		this.updateSelection();
	},
	select(this: AppController, id?: string, options: { add?: boolean; range?: boolean } = {}) {
		const context = this.selectionContext();
		const order = [...context.grid.querySelectorAll<HTMLElement>("[data-card]")].map(
				(n?: HTMLElement) => n.dataset.card,
			),
			from = order.indexOf(context.search ? this.searchSelectAnchor : this.selectAnchor),
			to = order.indexOf(id);
		if (options.range && from >= 0 && to >= 0) {
			for (const card of order.slice(Math.min(from, to), Math.max(from, to) + 1))
				this.selected.add(card);
		} else if (options.add || !this.selected.has(id)) this.selected.add(id);
		else this.selected.delete(id);
		if (context.search) this.searchSelectAnchor = id;
		else this.selectAnchor = id;
		this.updateSelection();
	},
	updateSelection(this: AppController) {
		const { grid, bar, selected: selection, search } = this.selectionContext();
		if (!grid) return;
		const selecting = selection.size > 0;
		grid.querySelectorAll<HTMLElement>("[data-card]").forEach((n: HTMLElement) => {
			this.markSelectionCard(n, selection);
		});
		grid.classList.add("selection-surface");
		grid.classList.toggle("is-selecting", selecting);
		if (!search) document.body.classList.toggle("is-selecting", selecting);
		if (!bar) return;
		const state = this.selectionBars.get(bar) || { visible: false, animation: null };
		this.selectionBars.set(bar, state);
		bar.inert = !selecting;
		bar.setAttribute("aria-hidden", String(!selecting));
		bar.style.pointerEvents = selecting ? "" : "none";
		if (!selecting && bar.contains(document.activeElement as HTMLElement))
			grid.querySelector<HTMLElement>(".card-title-button")?.focus({ preventScroll: true });
		bar.querySelector<HTMLElement>(".selection-count").textContent = String(this.selected.size);
		const ids = [...selection].filter((id) => Store.card(id));
		const allBookmarked = ids.length > 0 && ids.every((id) => Store.item(id).bookmarked);
		const bookmark = bar.querySelector<HTMLElement>('[data-action="selected-bookmark"]');
		bookmark?.classList.toggle("active", allBookmarked);
		bookmark?.setAttribute("aria-pressed", String(allBookmarked));
		bookmark?.setAttribute(
			"aria-label",
			allBookmarked ? copy("web.preview.removeBookmark") : copy("web.app.87aeb7040c82"),
		);
		const receiver = bar.querySelector<HTMLElement>(".selection-ai-target");
		if (receiver) receiver.hidden = !selecting || !this.drag?.active?.moved;
		if (state.visible === selecting) return;
		state.visible = selecting;
		if (selecting) this.railHide?.show();
		// Selecting folds the AI panel so the bar can take the rail; carrying a card does not.
		if (selecting && !search)
			queueMicrotask(() => !this.drag?.active && this.aiHeightEvent("select"));
		// Resume from the currently drawn frame when selection reverses mid-transition.
		const drawn = state.animation ? getComputedStyle(bar) : null;
		const from = drawn
			? { opacity: drawn.opacity || "1", transform: drawn.transform || "none" }
			: selecting
				? { opacity: 0, transform: "translateY(8px)" }
				: { opacity: 1, transform: "none" };
		state.animation?.cancel();
		bar.hidden = false;
		const animation = MotionEngine.animate(
			bar,
			[
				from,
				selecting
					? { opacity: 1, transform: "none" }
					: { opacity: 0, transform: "translateY(8px)" },
			],
			{ duration: 180 },
		);
		state.animation = animation;
		const finish = () => {
			if (state.animation !== animation || state.visible !== selecting) return;
			bar.hidden = !selecting;
			state.animation = null;
		};
		if (animation) animation.finished.then(finish, () => {});
		else finish();
	},
};
