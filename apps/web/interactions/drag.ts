import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "./motion.ts";

/** Drag sources are immutable references. Drops trigger explicit application actions. */
class DragManager {
	declare app: any;
	declare pending: any;
	declare active: any;
	declare timer: any;
	declare suppressUntil: any;
	declare ghost: any;

	constructor(app?: any) {
		this.app = app;
		this.pending = null;
		this.active = null;
		this.timer = 0;
		this.suppressUntil = 0;
		this.ghost = null;
		document.addEventListener("pointerdown", (e?: any) => {
			if (e.pointerType === "touch" || e.button !== 0 || app.dialog.open) return;
			const card = this.source(e.target);
			if (!card) return;
			this.pending = {
				id: (card as HTMLElement).dataset.card,
				x: e.clientX,
				y: e.clientY,
				element: card,
			};
		});
		document.addEventListener("pointermove", (e?: any) => {
			if (e.pointerType === "touch") return;
			if (
				this.pending &&
				!this.active &&
				Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y) > 8
			)
				this.start(this.pending);
			if (this.active) {
				e.preventDefault();
				this.move(e.clientX, e.clientY);
			}
		});
		document.addEventListener("pointerup", (e?: any) => {
			if (e.pointerType === "touch") return;
			if (this.active) this.finish(e.clientX, e.clientY);
			this.pending = null;
		});
		document.addEventListener("pointercancel", (e?: any) => {
			// Touch has its own non-passive lifecycle below. A browser may cancel the
			// compatibility pointer stream before touchmove can prevent panning.
			if (e.pointerType === "touch") return;
			if (this.active) this.cancel();
			this.pending = null;
		});
		document.addEventListener("dragstart", (e?: any) => {
			if (e.target.closest?.("[data-card]")) e.preventDefault();
		});
		document.addEventListener(
			"touchstart",
			(e?: any) => {
				if (e.touches.length !== 1 || app.dialog.open) return;
				const card = this.source(e.target);
				if (!card) return;
				const t = e.touches[0];
				this.pending = {
					id: (card as HTMLElement).dataset.card,
					x: t.clientX,
					y: t.clientY,
					element: card,
				};
				clearTimeout(this.timer);
				this.timer = window.setTimeout(() => {
					if (this.pending) this.start(this.pending);
				}, 380);
			},
			{ passive: true },
		);
		document.addEventListener(
			"touchmove",
			(e?: any) => {
				const t = e.touches[0];
				if (!t) return;
				if (this.active) {
					e.preventDefault();
					this.move(t.clientX, t.clientY);
				} else if (
					this.pending &&
					Math.hypot(t.clientX - this.pending.x, t.clientY - this.pending.y) > 8
				) {
					clearTimeout(this.timer);
					this.pending = null;
				}
			},
			{ passive: false },
		);
		document.addEventListener(
			"touchend",
			(e?: any) => {
				clearTimeout(this.timer);
				if (this.active) {
					e.preventDefault();
					const t = e.changedTouches[0];
					this.finish(t.clientX, t.clientY);
				}
				this.pending = null;
			},
			{ passive: false },
		);
		document.addEventListener(
			"touchcancel",
			() => {
				clearTimeout(this.timer);
				this.cancel();
				this.pending = null;
			},
			{ passive: true },
		);
		document.addEventListener(
			"keydown",
			(e?: any) => {
				if (e.key === "Escape" && this.active) {
					e.preventDefault();
					e.stopImmediatePropagation();
					this.cancel();
				}
			},
			true,
		);
		window.addEventListener("blur", () => this.cancel());
	}
	source(target?: any) {
		if (
			!(target instanceof Element) ||
			target.closest("button,input,textarea,a,dialog,.card-actions")
		)
			return null;
		return target.closest("[data-card]");
	}
	start(p?: any) {
		if (this.active) return;
		const ids = this.app.selected.has(p.id) ? [...this.app.selected] : [p.id],
			c = Store.card(p.id);
		if (!c) return;
		this.active = { ...p, ids, hot: null };
		this.suppressUntil = Date.now() + 1000;
		document.body.classList.add("is-dragging");
		document.querySelectorAll("[data-card]").forEach((n?: any) => {
			if (ids.includes(n.dataset.card)) n.classList.add("is-drag-source");
		});
		document.getElementById("drop-targets").hidden = false;
		this.ghost = document.createElement("div");
		this.ghost.className = "drag-ghost";
		this.ghost.innerHTML = `${c.image ? `<img src="${Assets[c.image]}" alt="">` : `<span class="ghost-icon">${icon(CardTypes[c.type].icon, 23)}</span>`}<strong>${esc(c.title)}</strong>${ids.length > 1 ? `<span class="drag-count">${ids.length}</span>` : ""}`;
		document.body.appendChild(this.ghost);
		this.move(p.x, p.y);
		MotionEngine.enter(this.ghost);
		this.app.announce(
			`${copy("web.drag.6b72fb801b9d")}${ids.length}${copy("web.drag.4808181ef801")}`,
		);
	}
	hit(x?: any, y?: any) {
		return (
			[...document.querySelectorAll("[data-drop]")]
				.filter((n?: any) => !n.hidden && n.getClientRects().length)
				.find((n?: any) => {
					const r = n.getBoundingClientRect(),
						pad = n.id === "orb" ? 20 : 10;
					return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
				}) || null
		);
	}
	move(x?: any, y?: any) {
		if (!this.active || !this.ghost) return;
		this.ghost.style.left = Math.max(8, Math.min(innerWidth - 252, x - 120)) + "px";
		this.ghost.style.top = Math.max(8, y - 45) + "px";
		const hot = this.hit(x, y);
		if (hot !== this.active.hot) {
			this.active.hot?.classList.remove("drop-hot");
			hot?.classList.add("drop-hot");
			this.active.hot = hot;
		}
	}
	finish(x?: any, y?: any) {
		if (!this.active) return;
		const active = this.active,
			target = this.hit(x, y),
			ghost = this.ghost;
		this.cleanup();
		if (target) {
			const rect = target.getBoundingClientRect(),
				r = ghost.getBoundingClientRect();
			MotionEngine.animate(
				ghost,
				[
					{ opacity: 1, transform: "rotate(-3deg) scale(1)" },
					{
						opacity: 0,
						transform: `translate(${rect.left + rect.width / 2 - r.left - r.width / 2}px,${rect.top + rect.height / 2 - r.top - r.height / 2}px) scale(.28)`,
					},
				],
				{ duration: 250 },
			);
			window.setTimeout(() => ghost.remove(), 260);
			this.app.drop(active.ids, (target as HTMLElement).dataset.drop);
		} else {
			const rect = active.element.getBoundingClientRect(),
				r = ghost.getBoundingClientRect();
			MotionEngine.animate(
				ghost,
				[
					{ opacity: 1, transform: "rotate(-3deg)" },
					{
						opacity: 0,
						transform: `translate(${rect.left + rect.width / 2 - r.left - r.width / 2}px,${rect.top + rect.height / 2 - r.top - r.height / 2}px) scale(.8)`,
					},
				],
				{ duration: 220 },
			);
			window.setTimeout(() => ghost.remove(), 230);
			this.app.announce(copy("web.drag.9688bf41283d"));
		}
	}
	cancel() {
		if (this.active) this.finish(-1000, -1000);
	}
	cleanup() {
		this.active?.hot?.classList.remove("drop-hot");
		document.body.classList.remove("is-dragging");
		document.querySelectorAll(".is-drag-source").forEach((n?: any) => {
			n.classList.remove("is-drag-source");
		});
		document.getElementById("drop-targets").hidden = true;
		this.active = null;
		this.pending = null;
		this.ghost = null;
		this.suppressUntil = Date.now() + 400;
	}
}

export { DragManager };
