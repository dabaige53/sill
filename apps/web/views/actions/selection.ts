import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function select(this: AppController, { id }: ActionContext) {
	this.select(id);
}

function selectAll(this: AppController) {
	this.selectionContext()
		.grid.querySelectorAll("[data-card]")
		.forEach((n?: any) => {
			this.selected.add(n.dataset.card);
		});
	this.updateSelection();
}

function clearSelection(this: AppController) {
	this.selected.clear();
	this.updateSelection();
}

function selectionMenu(this: AppController, { el }: ActionContext) {
	this.drag.openMenu([...this.selected], el);
}

function selectedAi(this: AppController) {
	this.openSelectionAI([...this.selected]);
}

function selectedBookmark(this: AppController) {
	this.applySelectionAction([...this.selected], "bookmark");
	this.selected.clear();
	this.updateSelection();
}

function selectedLater(this: AppController) {
	this.applySelectionAction([...this.selected], "later");
	this.selected.clear();
	this.updateSelection();
}

function selectedTag(this: AppController) {
	const ids = [...this.selected];
	this.selected.clear();
	this.updateSelection();
	this.applySelectionAction(ids, "tag");
}

export const selectionActions = {
	select: select,
	"select-all": selectAll,
	"clear-selection": clearSelection,
	"selection-menu": selectionMenu,
	"selected-ai": selectedAi,
	"selected-bookmark": selectedBookmark,
	"selected-later": selectedLater,
	"selected-tag": selectedTag,
} satisfies Record<string, ActionHandler>;
