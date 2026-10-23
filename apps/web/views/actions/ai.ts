import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

// The AI box and AI page (handbook ai-conversation.md). Nothing here sends to a model.

function aiOpen(this: AppController) {
	this.aiHeightEvent("open");
}

function aiCollapse(this: AppController) {
	this.aiHeightEvent("collapse");
	document.getElementById("ai-dock-input")?.focus({ preventScroll: true });
}

function aiFull(this: AppController) {
	this.aiHeightEvent("full");
}

function aiShrink(this: AppController) {
	this.aiHeightEvent("shrink");
}

function aiSessions(this: AppController) {
	this.aiListOpen = !this.aiListOpen;
	this.renderAIConversation();
}

function aiSession(this: AppController, { id }: ActionContext) {
	this.aiSelectSession(id);
	if (this.modalKind !== "ai") return;
	this.aiHistoryOpen = false;
	this.repaintAIPage();
}

/** A result row opens its card; checking an unknown write is reading the card again. */
function aiResultOpen(this: AppController, { id }: ActionContext) {
	this.navigate("#card/" + id);
}

function aiHistory(this: AppController) {
	this.aiHistoryOpen = !this.aiHistoryOpen;
	this.repaintAIPage();
}

export const aiActions = {
	"ai-open": aiOpen,
	"ai-collapse": aiCollapse,
	"ai-full": aiFull,
	"ai-shrink": aiShrink,
	"ai-sessions": aiSessions,
	"ai-session": aiSession,
	"ai-result-open": aiResultOpen,
	"ai-history": aiHistory,
} satisfies Record<string, ActionHandler>;
