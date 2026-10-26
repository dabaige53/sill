import { createElement } from "react";
import { copy } from "../copy.ts";
import {
	type AIHeight,
	type AIHeightEvent,
	nextHeight,
	othersRunning,
} from "../data/ai-conversation.ts";
import { previewSessions } from "../data/ai-preview.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { PanelViews } from "../interactions/panels-components.tsx";
import { AIDockSessionButton, AIDockSessions, AIDockThread } from "./ai-dock.tsx";
import type { AppController } from "./app.ts";
import { renderView } from "./react-renderer.ts";

// @design ai-conversation
export const appAIMethods = {
	aiSession(this: AppController) {
		const sessions = this.aiSessions || [];
		return sessions.find((s) => s.id === this.aiSessionId) || sessions[0] || null;
	},
	bindAI(this: AppController) {
		// Sample sessions only on the dev server with `?ai-preview`; the check stays inline so
		// production builds drop the branch and the samples with it.
		if (
			(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV &&
			new URLSearchParams(location.search).has("ai-preview")
		) {
			this.aiSessions = previewSessions(Store.state.cards);
			this.aiSessionId = this.aiSessions[0]?.id || null;
		}
		// A press on the feed folds the panel back to one line; the full view stays.
		document.addEventListener(
			"click",
			(e: MouseEvent) => {
				if (this.aiHeight !== "panel" || this.drag?.active) return;
				if ((this.drag?.suppressedClick?.until || 0) > Date.now()) return;
				const target = e.target as Element;
				if (target.closest?.("#ai-dock, dialog, #home-menu, [popover]")) return;
				this.aiHeightEvent("outside");
			},
			true,
		);
		this.renderAIConversation();
	},
	/** Paint the session button, the thread and the session list for the current height. */
	renderAIConversation(this: AppController) {
		const dock = document.getElementById("ai-dock");
		if (!dock) return;
		const session = this.aiSession();
		if (!session) {
			this.aiHeight = "line";
			this.aiListOpen = false;
		}
		const grown = this.aiHeight !== "line";
		dock.dataset.height = this.aiHeight;
		document.body.classList.toggle("ai-full", this.aiHeight === "full");
		const slot = document.getElementById("ai-dock-session");
		if (slot) renderView(slot, session ? createElement(AIDockSessionButton, { session }) : null);
		const thread = document.getElementById("ai-dock-thread");
		if (thread) {
			thread.hidden = !grown;
			renderView(
				thread,
				grown
					? createElement(AIDockThread, {
							session,
							height: this.aiHeight,
							others: othersRunning(this.aiSessions, session.id),
							listOpen: this.aiListOpen,
							connected: this.aiConnected,
						})
					: null,
			);
		}
		const list = document.getElementById("ai-dock-sessions");
		if (list) {
			const shown = grown && (this.aiHeight === "full" || this.aiListOpen);
			list.hidden = !shown;
			renderView(
				list,
				shown
					? createElement(AIDockSessions, {
							sessions: this.aiSessions,
							currentId: session.id,
							connected: this.aiConnected,
						})
					: null,
			);
		}
		const input = document.getElementById("ai-dock-input") as HTMLInputElement | null;
		if (input && !this.drag?.active)
			input.placeholder = session
				? copy("ai.continue").replace("{title}", session.title)
				: copy("web.ai.dockPlaceholder");
		// While the session runs, send turns into stop; both wait for the built-in AI.
		const send = dock.querySelector<HTMLButtonElement>(".ai-dock-send");
		if (send) {
			const stop = Boolean(session?.running);
			send.classList.toggle("is-stop", stop);
			send.setAttribute("aria-label", copy(stop ? "ai.stopUnavailable" : "web.ai.sendUnavailable"));
		}
		for (const ring of dock.querySelectorAll<HTMLElement>(".ai-spin"))
			MotionEngine.loading(ring, true, 1100);
		if (grown) {
			const scroll = document.getElementById("ai-thread-scroll");
			if (scroll) scroll.scrollTop = scroll.scrollHeight;
		}
	},
	/** Grow or shrink the one box with the card spring; keyboard changes land at once. */
	setAIHeight(this: AppController, height: AIHeight) {
		const dock = document.getElementById("ai-dock");
		if (!dock || height === this.aiHeight) return;
		const from = dock.getBoundingClientRect();
		const wasLine = this.aiHeight === "line";
		this.aiHeight = height;
		if (height !== "panel") this.aiListOpen = false;
		this.renderAIConversation();
		if (height !== "line") this.railHide?.show();
		const to = dock.getBoundingClientRect();
		if (!from.width || !to.width) return;
		// The bottom edge stays put while the panel grows; the full view moves to the middle.
		const dx = from.left + from.width / 2 - (to.left + to.width / 2);
		const dy = from.bottom - to.bottom;
		const fill = getComputedStyle(dock).backgroundColor;
		MotionEngine.animate(
			dock,
			[
				{
					width: `${from.width}px`,
					height: `${from.height}px`,
					transform: `translate(${dx}px, ${dy}px)`,
				},
				{ width: `${to.width}px`, height: `${to.height}px`, transform: "translate(0px, 0px)" },
			],
			{ duration: MotionEngine.time("dur-open"), spring: "card" },
		);
		// Glass turns into the solid card surface (and back) as the box changes height.
		if (wasLine !== (height === "line")) {
			const glass = getComputedStyle(document.documentElement).getPropertyValue("--glass").trim();
			MotionEngine.animate(
				dock,
				[{ backgroundColor: wasLine ? glass : fill }, { backgroundColor: fill }],
				{ duration: MotionEngine.time("dur-state") },
			);
		}
	},
	aiHeightEvent(this: AppController, event: AIHeightEvent) {
		if (!this.aiSession()) return;
		this.setAIHeight(nextHeight(this.aiHeight, event, Boolean(this.aiSession())));
	},
	/** Escape steps back one level: the history drawer, the session list, then full → panel → line. */
	aiKey(this: AppController, e: KeyboardEvent) {
		if (e.key !== "Escape") return false;
		if (this.modalKind === "ai" && this.aiHistoryOpen) {
			e.preventDefault();
			this.aiHistoryOpen = false;
			this.repaintAIPage();
			return true;
		}
		if (this.dialog.open || !this.desktop()) return false;
		if (this.aiListOpen) {
			e.preventDefault();
			this.aiListOpen = false;
			this.renderAIConversation();
			document.querySelector<HTMLElement>(".ai-thread-switch")?.focus({ preventScroll: true });
			return true;
		}
		if (this.aiHeight === "line") return false;
		e.preventDefault();
		this.aiHeightEvent("escape");
		return true;
	},
	aiSelectSession(this: AppController, id: string) {
		if (!this.aiSessions.some((s) => s.id === id)) return;
		this.aiSessionId = id;
		this.aiSessions = this.aiSessions.map((s) => (s.id === id ? { ...s, unseen: false } : s));
		this.aiListOpen = false;
		this.renderAIConversation();
	},
	/** The phone AI page after its session, list or drawer changed. */
	repaintAIPage(this: AppController) {
		if (this.modalKind !== "ai") return;
		this.replacePanelContent(PanelViews.ai(this));
		this.paintAIPage();
	},
	/** Turn the running rings and keep the newest line in view. */
	paintAIPage(this: AppController) {
		for (const ring of this.dialog.querySelectorAll<HTMLElement>(".ai-spin"))
			MotionEngine.loading(ring, true, 1100);
		const thread = this.dialog.querySelector<HTMLElement>("#ai-page-thread");
		if (thread) thread.scrollTop = thread.scrollHeight;
	},
};
