import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { carryCapsule, returnFace } from "./card-transition.ts";
import { cancelMotion, dim, move, type Playback, play } from "./motion-playback.ts";

/** Center-origin FLIP: final layout stays fixed while the surface travels from/to its card. */
export function cardTransform(
	source: Pick<DOMRect, "left" | "top" | "width" | "height">,
	target: Pick<DOMRect, "left" | "top" | "width" | "height">,
) {
	return `translate(${source.left + source.width / 2 - target.left - target.width / 2}px,${source.top + source.height / 2 - target.top - target.height / 2}px) scale(${source.width / target.width},${source.height / target.height})`;
}

const MotionEngine: Record<string, any> = {
	panelAnimations: new WeakMap(),
	matchedSources: new WeakMap(),
	matchSource(dialog: HTMLElement, source: HTMLElement | null) {
		this.releaseSource(dialog);
		if (!source || this.keyboard || matchMedia("(max-width:650px)").matches) return;
		this.matchedSources.set(dialog, { source, visibility: source.style.visibility });
		source.style.visibility = "hidden";
	},
	returnSource(dialog: HTMLElement) {
		const state = this.matchedSources.get(dialog);
		if (!state?.source.isConnected) return null;
		state.source.style.visibility = state.visibility;
		return this.animate(state.source, [{ opacity: 0 }, { opacity: 1 }], {
			...tokens.motion.cardHandoff,
		});
	},
	releaseSource(dialog: HTMLElement) {
		const state = this.matchedSources.get(dialog);
		if (state) state.source.style.visibility = state.visibility;
		this.matchedSources.delete(dialog);
	},
	cardTransform,
	carryCapsule,
	prepareReturn(dialog: HTMLElement, sheet: HTMLElement) {
		const source = this.matchedSources.get(dialog)?.source as HTMLElement | undefined;
		if (!source?.isConnected) return null;
		const face = returnFace(source, sheet);
		if (!face) return null;
		const animation = this.animate(face, [{ opacity: 0 }, { opacity: 1 }], {
			...tokens.motion.cardContentReturn,
			fill: "forwards",
		});
		return {
			finished: animation?.finished || Promise.resolve(),
			cancel() {
				animation?.cancel();
				face.remove();
			},
			complete() {
				animation?.complete();
			},
		};
	},
	detailTools(el: HTMLElement): HTMLElement[] {
		return [...el.querySelectorAll<HTMLElement>(".float-bar, .sheet-head-tools, .reader-head")];
	},
	revealDetail(el: HTMLElement, delay: number): Playback | null {
		const inert = el.inert;
		el.inert = true;
		const animation = this.animate(el, [{ opacity: 0 }, { opacity: 1 }], {
			duration: tokens.motion.detailFade,
			delay,
			fill: "backwards",
		});
		if (!animation) {
			el.inert = inert;
			return null;
		}
		let active = true;
		animation.finished.then(
			() => {
				if (active) el.inert = inert;
			},
			() => {},
		);
		return {
			finished: animation.finished,
			cancel: () => {
				active = false;
				animation.cancel();
				el.inert = inert;
			},
			complete: () => {
				animation.complete();
				el.inert = inert;
			},
		};
	},
	detailEntry(el: HTMLElement) {
		return this.detailTools(el).map((tool: HTMLElement) => this.revealDetail(tool, 0));
	},
	panelTasks: new WeakMap(),
	layoutAnimations: new WeakMap(),
	visibilityAnimations: new WeakMap(),
	contentAnimations: new WeakMap(),
	loops: new WeakMap(),
	menuAnimations: new WeakMap(),
	exits: new Map(),
	time(name: string) {
		const value =
			getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() ||
			tokens.timing.tokens.find((token) => token.name === name)?.value ||
			"220ms";
		return parseFloat(value) * (value.endsWith("s") && !value.endsWith("ms") ? 1000 : 1);
	},
	curve(name = "ease") {
		return (
			getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() ||
			tokens.timing.tokens.find((token) => token.name === name)?.value ||
			"cubic-bezier(0.23,1,0.32,1)"
		);
	},
	get keyboard() {
		return document.documentElement.dataset.inputModality === "keyboard";
	},
	animate(el?: HTMLElement, keyframes?: any[], options: any = {}): Playback | null {
		if (!el || this.keyboard) return null;
		return play(el, keyframes, {
			duration: this.time("base"),
			easing: this.curve(),
			...options,
		});
	},
	cancel: cancelMotion,
	dim,
	move(el: HTMLElement, destination = "", direct = false) {
		return move(el, destination, direct || this.keyboard);
	},
	loading(el: HTMLElement | null, busy: boolean, duration = 800) {
		if (!el) return;
		this.loops.get(el)?.cancel();
		this.loops.delete(el);
		if (!busy) return;
		// A request still needs progress feedback when it starts from the keyboard.
		const animation = play(el, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
			duration,
			easing: "linear",
			repeat: Infinity,
		});
		this.loops.set(el, animation);
	},
	/** Capture before changing CSS state, then let Motion bridge only visual properties. */
	change(el: HTMLElement, update: () => void, duration = this.time("base"), easing?: string) {
		const before = getComputedStyle(el);
		const from = { opacity: before.opacity, transform: before.transform };
		this.cancel(el);
		update();
		if (!easing && el.id === "home-top" && matchMedia("(min-width: 651px)").matches) {
			duration = this.time(el.classList.contains("is-tucked") ? "dur-tuck" : "dur-open");
		}
		const after = getComputedStyle(el);
		const to = { opacity: after.opacity, transform: after.transform };
		const visibility = after.visibility;
		if (this.keyboard) return null;
		// A constant opacity animation still creates a compositing boundary for glass
		// descendants. Animate only properties that change so their backdrop stays live.
		const keys = (Object.keys(from) as (keyof typeof from)[]).filter(
			(key) => from[key] !== to[key],
		);
		if (!keys.length) {
			el.style.visibility = "";
			return null;
		}
		el.style.visibility = "visible";
		const animation = this.animate(
			el,
			[from, to].map((frame) => Object.fromEntries(keys.map((key) => [key, frame[key]]))),
			{ duration, ...(easing ? { easing } : {}) },
		);
		const finish = () => {
			if (this.contentAnimations.get(el) === animation) el.style.visibility = "";
		};
		this.contentAnimations.set(el, animation);
		if (animation) animation.finished.then(finish, () => {});
		else el.style.visibility = visibility;
		return animation;
	},
	// @design button-feedback
	bind() {
		let pressed: HTMLElement | null = null;
		const release = () => {
			if (!pressed) return;
			const el = pressed;
			pressed = null;
			const from = getComputedStyle(el).transform;
			this.cancel(el);
			this.animate(el, [{ transform: from }, { transform: "scale(1)" }], {
				duration: this.time("dur-press"),
			});
		};
		document.addEventListener("pointerdown", (event: PointerEvent) => {
			release();
			if (event.button !== 0 || !event.isPrimary) return;
			const target = (event.target as Element).closest<HTMLElement>(
				".icon-button,.solid-button,.soft-button,.text-button,.pill.primary,.pill.soft,.check-item,.reminder-check,.tag-pill button,.nav-tab,#pull-ring",
			);
			if (!target || target.matches(":disabled") || target.closest("[inert]")) return;
			// Keep task text and the surrounding card still; only the mark acknowledges the press.
			pressed = target.querySelector<HTMLElement>(".nav-icon,.check-dot") || target;
			const from = getComputedStyle(pressed).transform;
			this.cancel(pressed);
			this.animate(
				pressed,
				[{ transform: from }, { transform: `scale(${tokens.motion.pressScale})` }],
				{ duration: this.time("dur-press"), fill: "forwards" },
			);
		});
		document.addEventListener("pointerup", release);
		document.addEventListener("pointercancel", release);
		window.addEventListener("blur", release);
	},
	popover(el: HTMLElement, visible: boolean) {
		const previous = this.menuAnimations.get(el);
		if (previous?.visible === visible || (!previous && el.hidden === !visible)) return;
		const style = getComputedStyle(el);
		const from = el.hidden
			? { opacity: 0, transform: "translateY(-4px) scale(.95)" }
			: { opacity: style.opacity, transform: style.transform };
		previous?.animation?.cancel();
		el.hidden = false;
		el.inert = !visible;
		const state = { visible, animation: null as Playback | null };
		this.menuAnimations.set(el, state);
		state.animation = this.animate(
			el,
			[
				from,
				visible
					? { opacity: 1, transform: "none" }
					: { opacity: 0, transform: "translateY(-4px) scale(.95)" },
			],
			{
				duration: this.time(visible ? "dur-menu" : "dur-menu-close"),
			},
		);
		const finish = () => {
			if (this.menuAnimations.get(el) !== state) return;
			el.hidden = !visible;
			state.animation = null;
		};
		if (state.animation) state.animation.finished.then(finish, () => {});
		else finish();
	},
	pulses: new WeakMap<HTMLElement, Playback>(),
	/** The AI box as a drop target: it grows while a card is carried and rings keep spreading out. */
	dropTarget(el: HTMLElement | null, state: "idle" | "carrying" | "ready") {
		if (!el) return;
		const drop = tokens.motion.aiDrop;
		const scale = state === "ready" ? drop.readyScale : state === "carrying" ? drop.scale : 1;
		const from = getComputedStyle(el).transform;
		this.animate(
			el,
			[{ transform: from === "none" ? "scale(1)" : from }, { transform: `scale(${scale})` }],
			{
				spring: true,
				fill: "forwards",
			},
		);
		let ring = el.querySelector<HTMLElement>(":scope > .ai-dock-pulse");
		if (state === "idle") {
			this.pulses.get(el)?.cancel();
			this.pulses.delete(el);
			ring?.remove();
			return;
		}
		if (ring) return;
		ring = document.createElement("span");
		ring.className = "ai-dock-pulse";
		ring.setAttribute("aria-hidden", "true");
		el.prepend(ring);
		this.pulses.set(
			el,
			play(
				ring,
				[
					{ inset: "0px", opacity: drop.opacity },
					{ inset: `-${drop.spread}px`, opacity: 0 },
				],
				{ duration: drop.duration, easing: this.curve(), repeat: Infinity },
			),
		);
	},
	/** Layout settles once. Only the background stretches; text and caret keep their size. */
	searchResize(el: HTMLElement, previousWidth: number) {
		const width = el.getBoundingClientRect().width;
		if (!width || !previousWidth || width === previousWidth) return;
		const transform = getComputedStyle(el, "::before").transform;
		const scale = transform.startsWith("matrix(") ? Number(transform.slice(7).split(",")[0]) : 1;
		const visualWidth = previousWidth * (Number.isFinite(scale) ? scale : 1);
		this.cancel(el);
		this.animate(
			el,
			[{ transform: `scaleX(${visualWidth / width})` }, { transform: "scaleX(1)" }],
			{ duration: this.time("dur-state"), pseudoElement: "::before" },
		);
		for (const child of el.querySelectorAll<HTMLElement>(
			":scope > .icon, #home-search-token, #home-search-marks, #home-search",
		)) {
			this.cancel(child);
			this.animate(
				child,
				[{ transform: `translateX(${width - visualWidth}px)` }, { transform: "none" }],
				{ duration: this.time("dur-state") },
			);
		}
	},
	/** Absolute rail notices fade without moving the navigation or leaving clickable ghosts. */
	visibility(el: HTMLElement, visible: boolean) {
		if (!el) return;
		const previous = this.visibilityAnimations.get(el);
		if (this.keyboard) {
			previous?.animation?.cancel();
			this.visibilityAnimations.delete(el);
			el.inert = !visible;
			el.hidden = !visible;
			return;
		}
		if (previous?.visible === visible || (!previous && el.hidden === !visible)) return;
		const style = getComputedStyle(el);
		const opacity = el.hidden ? 0 : Number.parseFloat(style?.opacity || "1");
		const transform = el.hidden ? "translateY(4px)" : style?.transform || "none";
		previous?.animation?.cancel();
		el.inert = !visible;
		el.hidden = false;
		const state = { visible, animation: null as Playback | null };
		this.visibilityAnimations.set(el, state);
		const finish = () => {
			if (this.visibilityAnimations.get(el) !== state) return;
			el.hidden = !visible;
			state.animation = null;
		};
		state.animation = this.animate(
			el,
			[
				{ opacity, transform },
				{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(4px)" },
			],
			{ duration: this.time(visible ? "base" : "dur-tuck") },
		);
		if (state.animation) state.animation.finished.then(finish, finish);
		else finish();
	},
	enter(el?: any, delay: any = 0) {
		return this.animate(
			el,
			[
				{ opacity: 0, transform: "translateY(10px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: this.time("dur-open"), delay, fill: "backwards" },
		);
	},
	fade(el?: any) {
		if (!el) return;
		const previous = this.contentAnimations.get(el);
		const opacity = previous ? getComputedStyle(el).opacity : 0;
		previous?.cancel();
		const animation = this.animate(el, [{ opacity }, { opacity: 1 }], {
			duration: this.time("fast"),
		});
		this.contentAnimations.set(el, animation);
		const clear = () => {
			if (this.contentAnimations.get(el) === animation) this.contentAnimations.delete(el);
		};
		if (animation) animation.finished.then(clear, clear);
		else clear();
		return animation;
	},
	resize(el: HTMLElement, _before: number) {
		return this.fade(el);
	},

	// Retain the removed surface only for its exit; it has no live controls or identity.
	cancelExit(key: string) {
		this.exits.get(key)?.remove();
		this.exits.delete(key);
	},
	retire(el: HTMLElement, rect: DOMRect, key: string) {
		this.cancelExit(key);
		if (rect.bottom <= 0 || rect.top >= innerHeight) return;
		this.cancel(el, true);
		const layer = document.createElement("div");
		layer.className = "motion-exit";
		layer.inert = true;
		layer.setAttribute("aria-hidden", "true");
		layer.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2`;
		for (const node of [el, ...el.querySelectorAll("*")]) {
			for (const attr of ["id", "data-card", "data-stack", "data-action", "autofocus"])
				node.removeAttribute(attr);
		}
		el.style.cssText = `position:relative;left:0;top:0;width:${rect.width}px;margin:0`;
		layer.append(el);
		document.body.append(layer);
		this.exits.set(key, layer);
		const animation = this.animate(layer, [{ opacity: 1 }, { opacity: 0 }], {
			duration: this.time("fast"),
		});
		const remove = () => {
			layer.remove();
			if (this.exits.get(key) === layer) this.exits.delete(key);
		};
		if (animation) animation.finished.then(remove, remove);
		else remove();
	},
	// New cards drop in from above: the one motion for arrivals.
	drop(el?: any, delay: any = 0) {
		return this.animate(
			el,
			[
				{ opacity: 0, transform: "translateY(-10px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: this.time("base"), delay, fill: "backwards" },
		);
	},
	phoneSheet(el?: any) {
		return (
			el.classList.contains("preview") &&
			matchMedia("(max-width:650px)").matches &&
			!!el.querySelector(".preview-sheet")
		);
	},
	surface(dialog?: any) {
		return dialog.classList.contains("reader")
			? dialog
			: dialog.querySelector(".preview-sheet") || dialog;
	},
	cancelPanel(el?: any) {
		this.contentAnimations.get(el)?.cancel();
		this.contentAnimations.get(this.surface(el))?.cancel();
		const tasks = this.panelTasks.get(el);
		if (tasks) {
			cancelAnimationFrame(tasks.frame);
			clearTimeout(tasks.timer);
			tasks.restore?.();
			this.panelTasks.delete(el);
		}
		(this.panelAnimations.get(el) || []).forEach((animation?: any) => {
			animation?.cancel();
		});
		this.panelAnimations.delete(el);
	},
	/** Wait until dialog sizing and focus settle; keep its first frame hidden until Motion owns it. */
	queuePanel(
		el: HTMLElement,
		origin?: DOMRect | null,
		resume?: { opacity: string; transform: string },
	) {
		this.cancelPanel(el);
		if (this.keyboard) return;
		const sheet = this.surface(el);
		const opacity = sheet.style.opacity;
		const desktop = !matchMedia("(max-width:650px)").matches;
		const tools = desktop
			? this.detailTools(el).map((tool: HTMLElement) => [tool, tool.style.opacity] as const)
			: [];
		for (const [tool] of tools) tool.style.opacity = "0";
		const restore = () => {
			sheet.style.opacity = opacity;
			for (const [tool, value] of tools) tool.style.opacity = value;
		};
		sheet.style.opacity = resume?.opacity || "0";
		const task = { frame: 0, restore };
		this.panelTasks.set(el, task);
		task.frame = requestAnimationFrame(() => {
			if (this.panelTasks.get(el) !== task) return;
			this.panelTasks.delete(el);
			restore();
			if ((el as HTMLDialogElement).open) this.openPanel(el, origin, resume);
		});
	},
	openPanel(el?: any, origin?: DOMRect | null, resume?: { opacity: string; transform: string }) {
		this.cancelPanel(el);
		const sheet = this.surface(el),
			bar = el.querySelector(":scope > .float-bar, .reader .float-bar");
		if (resume) {
			const carried =
				origin && !matchMedia("(max-width:650px)").matches
					? this.carryCapsule(el, sheet, resume.transform, "none", true)
					: null;
			this.panelAnimations.set(el, [
				this.animate(sheet, [resume, { opacity: 1, transform: "none" }], {
					duration: this.time("dur-open"),
					spring: origin && !matchMedia("(max-width:650px)").matches ? "card" : false,
				}),
				carried,
				...(!matchMedia("(max-width:650px)").matches
					? this.detailEntry(el)
					: bar
						? [this.enter(bar)]
						: []),
			]);
			return;
		}
		if (this.phoneSheet(el)) {
			sheet.classList.remove("is-off", "is-drag");
			const animation = this.animate(
				sheet,
				[
					{ opacity: 0, transform: "translateY(100%)" },
					{ opacity: 1, transform: "translateY(0)" },
				],
				{ duration: this.time("dur-sheet"), easing: this.curve("ease-sheet") },
			);
			this.panelAnimations.set(el, [animation, ...(bar ? [this.enter(bar)] : [])]);
			return;
		}
		if (origin?.width && origin.height && !matchMedia("(max-width:650px)").matches) {
			const destination = sheet.getBoundingClientRect();
			if (destination.width && destination.height) {
				const carried = this.carryCapsule(
					el,
					sheet,
					cardTransform(origin, destination),
					"none",
					true,
				);
				const animation = this.animate(
					sheet,
					[
						{ opacity: 1, transform: cardTransform(origin, destination) },
						{ opacity: 1, transform: "translate(0px,0px) scale(1,1)" },
					],
					{ duration: this.time("dur-open"), spring: "card" },
				);
				const body = sheet.querySelector(".preview-body, .reader-body") as HTMLElement | null;
				this.panelAnimations.set(el, [
					animation,
					carried,
					...(body ? [this.revealDetail(body, tokens.motion.detailContentDelay)] : []),
					...this.detailEntry(el),
				]);
				return;
			}
		}
		// Without a source, fade the surface in and retain the same tool sequence.
		const animations = [this.enter(sheet)];
		if (!matchMedia("(max-width:650px)").matches && el.matches(".preview, .reader"))
			animations.push(...this.detailEntry(el));
		else if (bar && bar !== sheet) animations.push(this.enter(bar));
		this.panelAnimations.set(el, animations);
	},
	flip(el?: any, oldRect?: any, newRect?: any) {
		this.layoutAnimations.get(el)?.cancel();
		this.layoutAnimations.delete(el);
		const now = newRect || el.getBoundingClientRect(),
			x = oldRect.left - now.left,
			y = oldRect.top - now.top;
		if (Math.abs(oldRect.width - now.width) > 1) this.fade(el.querySelector(".card-body") || el);
		if (Math.abs(x) + Math.abs(y) > 1)
			this.layoutAnimations.set(
				el,
				this.animate(
					el,
					[{ transform: `translate(${x}px,${y}px)` }, { transform: "translate(0,0)" }],
					{ duration: this.time("layout") },
				),
			);
	},
};

export { MotionEngine };
