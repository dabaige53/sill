import { createElement, type ReactNode } from "react";
import { button, esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { type AgentCard, type AgentScope, agentKey } from "../services/agent-handoff.ts";
import type { AppController } from "./app.ts";

export const appFeedbackMethods = {
	agentScope(this: AppController): AgentScope {
		return { kind: "local" };
	},
	agentAction(this: AppController, card: AgentCard) {
		if (!window.__SILL_HOST__?.canDiscuss?.()) return "";
		let scope: AgentScope;
		try {
			scope = this.agentScope();
		} catch {
			return "";
		}
		const state = this.agentHandoff.state(agentKey(card.id, scope), window.__SILL_HOST__);
		if (state === "unavailable") return "";
		const labels = {
			unknown: copy("web.agent.unknownLabel"),
			discuss: copy("web.agent.discuss"),
			sending: copy("web.agent.sending"),
			sent: copy("web.agent.sentLabel"),
		};
		const busy = state === "sending";
		return `<button type="button" class="text-button" data-action="agent-handoff" data-id="${esc(card.id)}"${busy || state === "sent" || state === "unknown" ? " disabled" : ""} aria-busy="${busy}">${labels[state]}</button>`;
	},
	agentActionView(this: AppController, card: AgentCard): ReactNode {
		if (!window.__SILL_HOST__?.canDiscuss?.()) return null;
		let scope: AgentScope;
		try {
			scope = this.agentScope();
		} catch {
			return null;
		}
		const state = this.agentHandoff.state(agentKey(card.id, scope), window.__SILL_HOST__);
		if (state === "unavailable") return null;
		const labels = {
			unknown: copy("web.agent.unknownLabel"),
			discuss: copy("web.agent.discuss"),
			sending: copy("web.agent.sending"),
			sent: copy("web.agent.sentLabel"),
		};
		return createElement(
			"button",
			{
				type: "button",
				className: "text-button",
				"data-action": "agent-handoff",
				"data-id": card.id,
				disabled: state !== "discuss",
				"aria-busy": state === "sending",
			},
			labels[state],
		);
	},
	paintAgentActions(this: AppController) {
		this.dialog
			.querySelectorAll<HTMLElement>('[data-action="agent-handoff"]')
			.forEach((button: HTMLElement) => {
				const card = Store.card(button.dataset.id);
				if (!card) return;
				const template = document.createElement("template");
				template.innerHTML = this.agentAction(card);
				const next = template.content.querySelector<HTMLButtonElement>("button");
				if (!next) {
					button.remove();
					return;
				}
				button.textContent = next.textContent;
				(button as HTMLButtonElement).disabled = next.disabled;
				button.setAttribute("aria-busy", next.getAttribute("aria-busy"));
			});
	},
	toast(
		this: AppController,
		text?: string,
		undo: () => void = null,
		actionLabel = copy("web.app.926a50b98ece"),
	) {
		this.showToast(text, undo, actionLabel, false);
	},
	alert(this: AppController, text?: string) {
		this.showToast(text, null, "", true);
	},
	showToast(
		this: AppController,
		text?: string,
		undo?: () => void,
		actionLabel?: string,
		persistent?: boolean,
	) {
		clearTimeout(this.toastTimer);
		this.toastSeq = (this.toastSeq || 0) + 1;
		this.undoAction = undo;
		const toast = document.getElementById("toast");
		(this.dialog.open ? this.dialog : document.body).appendChild(toast);
		document.getElementById("toast-text").textContent = text;
		document.getElementById("toast-action").innerHTML = undo
			? `<button type="button" class="text-link" data-action="undo" aria-label="${actionLabel === copy("web.app.926a50b98ece") ? copy("web.app.493c9056731b") : esc(actionLabel)}">${esc(actionLabel)}</button>`
			: persistent
				? button("x", copy("web.close"), "toast-close")
				: "";
		toast.classList.toggle("is-alert", !!persistent);
		toast.setAttribute("role", persistent ? "alert" : "status");
		const drawnToast = toast.hidden
			? { opacity: 0, transform: "translateY(8px)" }
			: { opacity: getComputedStyle(toast).opacity, transform: getComputedStyle(toast).transform };
		MotionEngine.cancel(toast);
		toast.hidden = false;
		toast.inert = false;
		MotionEngine.animate(toast, [drawnToast, { opacity: 1, transform: "none" }], {
			duration: MotionEngine.time("dur-menu"),
		});
		this.toastRemaining = persistent ? 0 : undo ? 5500 : 3200;
		this.toastStarted = 0;
		this.toastTimer = 0;
		this.updateToastClock();
	},
	updateToastClock(this: AppController, forcePause = false) {
		if (this.toastTimer) {
			clearTimeout(this.toastTimer);
			this.toastRemaining = Math.max(
				0,
				this.toastRemaining - (performance.now() - this.toastStarted),
			);
			this.toastTimer = 0;
		}
		const toast = document.getElementById("toast");
		if (!toast || toast.hidden || toast.inert || toast.classList.contains("is-alert")) return;
		if (
			forcePause ||
			document.hidden ||
			!document.hasFocus() ||
			this.toastHover ||
			toast.contains(document.activeElement)
		)
			return;
		this.toastStarted = performance.now();
		this.toastTimer = window.setTimeout(() => this.hideToast(), this.toastRemaining);
	},
	hideToast(this: AppController) {
		clearTimeout(this.toastTimer);
		this.toastTimer = 0;
		this.toastRemaining = 0;
		const toast = document.getElementById("toast"),
			seq = this.toastSeq;
		if (!toast || toast.hidden) return;
		toast.inert = true;
		const done = () => {
			if (seq === this.toastSeq) toast.hidden = true;
		};
		const drawnToast = {
			opacity: getComputedStyle(toast).opacity,
			transform: getComputedStyle(toast).transform,
		};
		MotionEngine.cancel(toast);
		const leave = MotionEngine.animate(
			toast,
			[drawnToast, { opacity: 0, transform: "translateY(8px)" }],
			{ duration: 140 },
		);
		leave ? leave.finished.then(done, done) : done();
	},
};
