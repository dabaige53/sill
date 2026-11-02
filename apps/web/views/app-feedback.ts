import { button } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AgentScope } from "../services/agent-handoff.ts";
import type { AppController } from "./app.ts";

export const appFeedbackMethods = {
	agentScope(this: AppController): AgentScope {
		return { kind: "local" };
	},
	toast(this: AppController, text?: string) {
		this.showToast(text, false);
	},
	alert(this: AppController, text?: string) {
		this.showToast(text, true);
	},
	showToast(this: AppController, text?: string, persistent = false) {
		clearTimeout(this.toastTimer);
		this.toastSeq = (this.toastSeq || 0) + 1;
		const toast = document.getElementById("toast");
		(this.dialog.open ? this.dialog : document.body).appendChild(toast);
		document.getElementById("toast-text").textContent = text;
		document.getElementById("toast-action").innerHTML = persistent
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
		this.toastRemaining = persistent ? 0 : 3200;
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
