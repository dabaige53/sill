import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "./app.ts";

export const appSelectionMethods = {
	selectionAIHTML(this: AppController) {
		return `<button type="button" class="selection-ai-target glass" data-action="selected-ai" aria-label="${copy("web.selection.aiOpen")}"><span class="selection-ai-wave" aria-hidden="true"><i></i><i></i><i></i></span><span data-ai-label>${copy("web.selection.aiDrop")}</span></button>`;
	},
	openSelectionAI(this: AppController, ids: string[]) {
		this.aiSelectionIds = [...new Set(ids)].filter((id) => Store.card(id));
		if (!this.aiSelectionIds.length) return;
		this.openPanel("ai");
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
		const bar = this.dialog.querySelector<HTMLElement>("#search-selection-bar");
		if (bar && !bar.dataset.bound) {
			bar.dataset.bound = "true";
			bar.addEventListener("contextmenu", (e: MouseEvent) => {
				if (!this.searchSelected.size) return;
				e.preventDefault();
				this.drag.openMenu([...this.searchSelected], e.target as HTMLElement, {
					x: e.clientX,
					y: e.clientY,
				});
			});
		}
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
		const entering = selecting && !grid.classList.contains("is-selecting");
		grid.querySelectorAll<HTMLElement>("[data-card]").forEach((n: HTMLElement) => {
			const selected = selection.has(n.dataset.card);
			this.markSelectionCard(n, selection);
			if (entering && !selected) {
				const bounds = n.getBoundingClientRect();
				if (bounds.bottom > 0 && bounds.top < innerHeight)
					MotionEngine.animate(
						n,
						[{ opacity: 1 }, { opacity: 0.88, offset: 0.4 }, { opacity: 1 }],
						{ duration: 240 },
					);
			}
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
		if (state.visible === selecting) return;
		state.visible = selecting;
		if (selecting) {
			this.railHide?.show();
			bar.querySelectorAll<HTMLElement>(".selection-ai-wave i").forEach((wave, index) => {
				MotionEngine.animate(
					wave,
					[
						{ transform: "scaleY(0.4)", opacity: 0.4 },
						{ transform: "scaleY(1)", opacity: 1 },
					],
					{ duration: 260, delay: index * 45 },
				);
			});
		}
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
