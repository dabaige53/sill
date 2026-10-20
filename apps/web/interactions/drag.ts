import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "./motion.ts";

/** A stationary hold selects in place; only an explicit toolbar action changes data. */
class DragManager {
	declare app: any;
	declare pending: any;
	declare active: any;
	declare timer: any;
	declare suppressedClick: { element: HTMLElement; until: number } | null;
	declare ghost: HTMLElement | null;
	declare menu: HTMLDialogElement;
	declare returnFocus: HTMLElement | null;
	declare menuIds: string[];

	constructor(app?: any) {
		this.app = app;
		this.pending = null;
		this.active = null;
		this.timer = 0;
		this.suppressedClick = null;
		this.ghost = null;
		this.menuIds = [];
		this.menu = document.createElement("dialog");
		this.menu.id = "selection-menu";
		this.menu.setAttribute("aria-labelledby", "selection-menu-title");
		document.body.appendChild(this.menu);
		this.menu.addEventListener("cancel", (e) => {
			e.preventDefault();
			this.closeMenu();
		});
		this.menu.addEventListener("click", (e) => {
			e.stopPropagation();
			const button = (e.target as Element).closest<HTMLButtonElement>("[data-selection-action]");
			if (button) {
				const action = button.dataset.selectionAction;
				const ids = this.menuIds.filter((id) => Store.card(id));
				this.closeMenu();
				if (action !== "cancel" && ids.length) {
					this.app.selected = new Set(ids);
					this.app.action(`selected-${action}`);
				}
			} else if (e.target === this.menu) this.closeMenu();
		});
		document.addEventListener(
			"click",
			(e) => {
				const suppressed = this.suppressedClick;
				if (
					this.active ||
					(suppressed &&
						Date.now() < suppressed.until &&
						e.target instanceof Node &&
						suppressed.element.contains(e.target))
				) {
					e.preventDefault();
					e.stopImmediatePropagation();
				}
				this.suppressedClick = null;
			},
			true,
		);
		document.addEventListener("pointerdown", (e) => {
			if (e.pointerType !== "touch" && e.button === 0) {
				this.prepare(e.target, e.clientX, e.clientY);
				if (this.pending) {
					this.pending.mouse = true;
					// Keep browser text/image dragging from taking this card gesture.
					e.preventDefault();
				}
			}
		});
		document.addEventListener("pointermove", (e) => {
			if (e.pointerType === "touch") return;
			this.track(e.clientX, e.clientY);
			if (this.active) e.preventDefault();
		});
		document.addEventListener("pointerup", (e) => {
			if (e.pointerType !== "touch") this.finish({ x: e.clientX, y: e.clientY });
		});
		document.addEventListener("pointercancel", (e) => {
			// Touch owns its non-passive stream; browser panning may cancel its pointer stream.
			if (e.pointerType !== "touch") this.cancel();
		});
		document.addEventListener("dragstart", (e) => {
			if ((e.target as Element).closest?.("[data-card]")) e.preventDefault();
		});
		document.addEventListener("contextmenu", (e) => {
			if (this.active || this.pending) e.preventDefault();
		});
		document.addEventListener(
			"touchstart",
			(e) => {
				if (e.touches.length !== 1) {
					this.cancel();
					return;
				}
				const t = e.touches[0];
				this.prepare(e.target, t.clientX, t.clientY);
			},
			{ passive: true },
		);
		document.addEventListener(
			"touchmove",
			(e) => {
				if (e.touches.length !== 1) {
					this.cancel();
					return;
				}
				const t = e.touches[0];
				this.track(t.clientX, t.clientY);
				if (this.active && e.cancelable) e.preventDefault();
			},
			{ passive: false },
		);
		document.addEventListener(
			"touchend",
			(e) => {
				if (this.active && e.cancelable) e.preventDefault();
				const t = e.changedTouches[0];
				this.finish(t ? { x: t.clientX, y: t.clientY } : undefined);
			},
			{ passive: false },
		);
		document.addEventListener("touchcancel", () => this.cancel(), { passive: true });
		document.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Escape" && (this.active || this.pending || this.menu.open)) {
					e.preventDefault();
					e.stopImmediatePropagation();
					this.cancel();
					return;
				}
				if (!this.menu.open) return;
				// Keep global app shortcuts out of this modal, while preserving native activation.
				e.stopImmediatePropagation();
				const buttons = [
					...this.menu.querySelectorAll<HTMLButtonElement>(".selection-options button"),
				];
				const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
				if (["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(e.key)) {
					e.preventDefault();
					const next =
						e.key === "Home"
							? 0
							: e.key === "End"
								? buttons.length - 1
								: (index +
										(e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1) +
										buttons.length) %
									buttons.length;
					buttons[next]?.focus();
				}
			},
			true,
		);
		window.addEventListener("blur", () => this.cancel());
		window.addEventListener("resize", () => this.cancel());
		window.visualViewport?.addEventListener("resize", () => this.cancel());
		window.addEventListener("pagehide", () => this.cancel());
		window.addEventListener("popstate", () => this.cancel());
		window.addEventListener("hashchange", () => this.cancel());
	}
	prepare(target: EventTarget | null, x: number, y: number) {
		this.clearPending();
		// A new press is a new gesture, even within the compatibility-click window.
		this.suppressedClick = null;
		if (
			(this.app.dialog.open && this.app.modalKind !== "search") ||
			this.menu.open ||
			this.active ||
			!(target instanceof Element)
		)
			return;
		if (
			target.closest(
				"input,textarea,a,.card-actions,.card-more-menu,.deck,button:not(.card-title-button)",
			)
		)
			return;
		const element = target.closest<HTMLElement>(
			"#feed-grid [data-card], #search-results [data-card]",
		);
		if (!element || !this.app.selectionContext().grid?.contains(element)) return;
		this.pending = { id: element.dataset.card, x, y, element };
		this.timer = window.setTimeout(() => {
			if (this.pending) this.start(this.pending);
		}, 380);
	}
	clearPending() {
		clearTimeout(this.timer);
		this.pending = null;
	}
	start(p: any) {
		if (this.active || !p.element.isConnected || !Store.card(p.id)) return;
		this.app.closeMore();
		this.app.select(p.id, { add: true });
		const ids = [...this.app.selected].filter((id) => Store.card(id));
		this.active = {
			...p,
			ids,
			moved: false,
			target:
				this.app.desktop() && !this.app.selectionContext().search
					? document.getElementById("ai-dock")
					: this.app.selectionContext().bar?.querySelector(".selection-ai-target"),
		};
		// Desktop: the AI box takes the rail back while a card is carried to it.
		document
			.getElementById("dock")
			?.classList.toggle("is-ai-drag", this.active.target?.id === "ai-dock");
		this.app.railHide?.show();
		this.clearPending();
		this.app.announce(
			`${copy("web.selection.countPrefix")}${ids.length}${copy("web.selection.countSuffix")}`,
		);
	}
	/** A real, inert copy of a card, scaled to thumbnail width. */
	thumbnail(id: string, width: number) {
		const face = document.createElement("div");
		face.className = "selection-stack-face";
		const source = [
			...(this.app.selectionContext().grid as HTMLElement).querySelectorAll<HTMLElement>(
				"[data-card]",
			),
		].find((node) => node.dataset.card === id);
		if (!source) {
			const card = Store.card(id);
			face.innerHTML = `<div class="selection-thumbnail-fallback"><strong>${esc(card?.title || "")}</strong><p>${esc(card?.summary || card?.excerpt || "")}</p></div>`;
			return { face, height: 120 };
		}
		const clone = source.cloneNode(true) as HTMLElement;
		clone.classList.remove("selected", "is-selected", "is-drag-source");
		clone
			.querySelectorAll(
				"script,iframe,object,embed,audio,video,.card-actions,.card-more-menu,.selection-circle,.selected-tick",
			)
			.forEach((node) => {
				node.remove();
			});
		for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
			for (const attr of [...node.attributes]) {
				if (
					/^(id|tabindex|href|for|autofocus|contenteditable|draggable|role)$/.test(attr.name) ||
					/^(aria-|data-|on)/.test(attr.name)
				)
					node.removeAttribute(attr.name);
			}
			if (node.matches("button,a,input,textarea,select")) {
				const visual = document.createElement("span");
				visual.className = node.className;
				visual.append(...node.childNodes);
				node.replaceWith(visual);
			}
		}
		const bounds = source.getBoundingClientRect();
		const full = bounds.width || 320;
		const scale = width / full;
		clone.style.cssText = `position:relative;left:0;top:0;width:${full}px;margin:0;transform:scale(${scale});transform-origin:top left;pointer-events:none;`;
		face.appendChild(clone);
		return { face, height: Math.max(96, Math.min(196, (bounds.height || 280) * scale)) };
	}
	/** Like Photos: the real cards, up to three, fanned into one pile with the count on top. */
	createStack(ids: string[]) {
		const stack = document.createElement("div");
		stack.className = "selection-stack";
		stack.dataset.depth = String(Math.min(3, ids.length));
		stack.setAttribute("aria-hidden", "true");
		stack.inert = true;
		const width = 176;
		const faces = ids.slice(0, 3).map((id) => this.thumbnail(id, width));
		const height = faces[0]?.height || 120;
		stack.style.setProperty("--stack-h", `${height}px`);
		// The first chosen card lies on top; the others peek out behind it.
		faces
			.slice()
			.reverse()
			.forEach(({ face }, i, list) => {
				face.dataset.layer = String(list.length - 1 - i);
				face.style.height = `${height}px`;
				stack.appendChild(face);
			});
		const count = document.createElement("span");
		count.className = "selection-stack-count num";
		count.textContent = String(ids.length);
		stack.appendChild(count);
		return stack;
	}
	track(x: number, y: number) {
		if (this.pending && Math.hypot(x - this.pending.x, y - this.pending.y) > 8) {
			if (this.pending.mouse && this.app.desktop()) this.start(this.pending);
			else this.clearPending();
		}
		if (this.active) {
			if (Math.hypot(x - this.active.x, y - this.active.y) > 8) this.active.moved = true;
			this.active.point = { x, y };
			this.move(x, y);
		}
	}
	move(x: number, y: number) {
		if (!this.active?.moved) return;
		const target = this.active.target as HTMLElement | null;
		const rect = target?.getBoundingClientRect();
		const ready =
			!!rect &&
			rect.width > 0 &&
			x >= rect.left &&
			x <= rect.right &&
			y >= rect.top &&
			y <= rect.bottom;
		if (this.active.ready !== ready) {
			this.active.ready = ready;
			target?.classList.toggle("is-ready", ready);
			const label = target?.querySelector("[data-ai-label]");
			if (label) label.textContent = copy(ready ? "web.selection.aiReady" : "web.selection.aiDrop");
			const dockInput = target?.querySelector<HTMLInputElement>("#ai-dock-input");
			if (dockInput)
				dockInput.placeholder = copy(ready ? "web.ai.dockReady" : "web.ai.dockPlaceholder");
		}
		if (!this.ghost) {
			this.ghost = document.createElement("div");
			this.ghost.className = "selection-drag-preview";
			this.ghost.setAttribute("aria-hidden", "true");
			this.ghost.inert = true;
			this.ghost.appendChild(
				this.createStack([
					this.active.id,
					...this.active.ids.filter((id: string) => id !== this.active.id),
				]),
			);
			document.body.classList.add("is-carrying");
			(this.app.modalKind === "search" ? this.app.dialog : document.body).append(this.ghost);
		}
		// Direct compositor movement: no queued animation can trail the finger.
		this.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
	}
	finish(releasePoint?: { x: number; y: number }) {
		this.clearPending();
		if (!this.active) return;
		if (releasePoint) this.move(releasePoint.x, releasePoint.y);
		const { ids, moved, ready } = this.active;
		this.cleanup();
		// A local preview only; no model call, transmission or card mutation.
		if (moved && ready) this.app.openSelectionAI(ids);
	}
	openMenu(ids: string[], trigger?: HTMLElement, point?: { x: number; y: number }) {
		ids = ids.filter((id) => Store.card(id));
		if (!ids.length || (this.app.dialog.open && this.app.modalKind !== "search") || this.menu.open)
			return;
		this.returnFocus = trigger || (document.activeElement as HTMLElement);
		this.menuIds = ids;
		this.app.closeMore();
		this.menu.innerHTML = `<div class="selection-context"><h2 class="sr-only" id="selection-menu-title">${copy("web.selection.countPrefix")}${ids.length}${copy("web.selection.countSuffix")}</h2><div class="selection-options"><div role="group" aria-label="${copy("web.selection.actions")}"><button type="button" data-selection-action="bookmark">${copy("web.selection.bookmark")}${icon("bookmark", 18)}</button><button type="button" data-selection-action="later">${copy("web.selection.later")}${icon("clock", 18)}</button></div><div role="group" aria-label="${copy("web.selection.organize")}"><button type="button" data-selection-action="tag">${copy("web.selection.tag")}${icon("tag", 18)}</button></div><div role="group"><button type="button" data-selection-action="cancel">${copy("web.selection.cancel")}</button></div></div></div>`;
		this.menu.querySelector(".selection-context")?.appendChild(this.createStack(ids));
		document.body.classList.add("selection-menu-open");
		this.menu.showModal();
		const rect = trigger?.getBoundingClientRect();
		this.positionMenu(
			point || {
				x: rect ? rect.left + rect.width / 2 : innerWidth / 2,
				y: rect ? rect.top : innerHeight / 2,
			},
		);
		this.menu.querySelector("button")?.focus({ preventScroll: true });
		MotionEngine.enter(this.menu.querySelector(".selection-context"));
	}
	positionMenu(point: { x: number; y: number }) {
		const context = this.menu.querySelector<HTMLElement>(".selection-context")!;
		const options = this.menu.querySelector<HTMLElement>(".selection-options")!;
		const stack = this.menu.querySelector<HTMLElement>(".selection-stack")!;
		const gap = 12,
			edge = 16;
		const stackH = stack.offsetHeight,
			optionsH = options.offsetHeight;
		// The pile stays where it was let go; the menu opens below it, or above when the space below is short.
		const below = point.y + stackH / 2 + gap + optionsH + edge <= innerHeight;
		context.dataset.placement = below ? "below" : "above";
		stack.style.order = below ? "-1" : "1";
		const height = context.offsetHeight;
		const top = below ? point.y - stackH / 2 : point.y + stackH / 2 - height;
		const left = point.x - context.offsetWidth / 2;
		context.style.left = `${Math.max(edge, Math.min(innerWidth - context.offsetWidth - edge, left))}px`;
		context.style.top = `${Math.max(edge, Math.min(innerHeight - height - edge, top))}px`;
	}

	closeMenu() {
		if (!this.menu.open) return;
		this.menu.close();
		document.body.classList.remove("selection-menu-open");
		this.menuIds = [];
		const focus = this.returnFocus?.isConnected
			? this.returnFocus
			: document.querySelector<HTMLElement>('[data-action="selection-menu"]');
		focus?.focus({ preventScroll: true });
		this.returnFocus = null;
	}
	cancel() {
		this.clearPending();
		if (this.active) this.cleanup();
		this.closeMenu();
	}
	cleanup() {
		if (this.active) {
			this.suppressedClick = { element: this.active.element, until: Date.now() + 400 };
		}
		this.active?.target?.classList.remove("is-ready");
		const label = this.active?.target?.querySelector("[data-ai-label]");
		if (label) label.textContent = copy("web.selection.aiDrop");
		const dockInput = (
			this.active?.target as HTMLElement | undefined
		)?.querySelector<HTMLInputElement>("#ai-dock-input");
		if (dockInput) dockInput.placeholder = copy("web.ai.dockPlaceholder");
		document.getElementById("dock")?.classList.remove("is-ai-drag");
		document.body.classList.remove("is-dragging");
		document.body.classList.remove("is-carrying");
		document.querySelectorAll(".is-drag-source").forEach((n) => {
			n.classList.remove("is-drag-source");
		});
		this.ghost?.remove();
		this.ghost = null;
		this.active = null;
		this.clearPending();
	}
}

export { DragManager };
