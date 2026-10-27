import { contextMotion, reflowContext } from "../../interactions/ai-context-motion.ts";
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

function selectedAi(this: AppController) {
	this.openSelectionAI([...this.selected]);
}

function selectedBookmark(this: AppController) {
	this.applySelectionAction([...this.selected], "bookmark");
	this.updateSelection();
}

function selectedLater(this: AppController) {
	this.applySelectionAction([...this.selected], "later");
	this.updateSelection();
}

function selectedTag(this: AppController) {
	const ids = [...this.selected];
	this.updateSelection();
	this.applySelectionAction(ids, "tag");
}

function aiContextRemove(this: AppController, { id }: ActionContext) {
	const node = document.querySelector<HTMLElement>(
		`#ai-dock [data-ai-context="${CSS.escape(id)}"]`,
	);
	if (node?.inert) return;
	if (node) node.inert = true;
	const finish = () => {
		if (node && !node.isConnected) return;
		this.aiSelectionIds = this.aiSelectionIds.filter((n) => n !== id);
		const box = document.getElementById("ai-dock-context");
		const positions = new Map(
			[...(box?.querySelectorAll<HTMLElement>("[data-ai-context]") || [])].map((chip) => [
				chip.dataset.aiContext,
				chip.getBoundingClientRect(),
			]),
		);
		this.renderAIDock();
		for (const chip of box?.querySelectorAll<HTMLElement>("[data-ai-context]") || []) {
			const before = positions.get(chip.dataset.aiContext);
			if (before) reflowContext(chip, before);
		}
		document.getElementById("ai-dock-input")?.focus({ preventScroll: true });
	};
	const animation = node && contextMotion(node, false);
	if (animation)
		animation.finished.then(finish, () => {
			if (node.isConnected) node.inert = false;
		});
	else finish();
}

export const selectionActions = {
	select: select,
	"select-all": selectAll,
	"clear-selection": clearSelection,
	"selected-ai": selectedAi,
	"ai-context-remove": aiContextRemove,
	"selected-bookmark": selectedBookmark,
	"selected-later": selectedLater,
	"selected-tag": selectedTag,
} satisfies Record<string, ActionHandler>;
