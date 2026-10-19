const MotionEngine: Record<string, any> = {
	query: matchMedia("(prefers-reduced-motion: reduce)"),
	panelAnimations: new WeakMap(),
	panelTasks: new WeakMap(),
	layoutAnimations: new WeakMap(),
	visibilityAnimations: new WeakMap(),
	contentAnimations: new WeakMap(),
	exits: new Map(),
	time(name: string) {
		const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
		return parseFloat(value) * (value.endsWith("s") && !value.endsWith("ms") ? 1000 : 1);
	},
	curve(name = "ease") {
		return (
			getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() ||
			"cubic-bezier(0.23,1,0.32,1)"
		);
	},
	get keyboard() {
		return document.documentElement.dataset.inputModality === "keyboard";
	},
	get reduced() {
		return this.query.matches || !!document.body?.classList.contains("reduce-motion");
	},
	get reducedDuration() {
		return this.time("dur-reduced") || 70;
	},
	animate(el?: any, keyframes?: any, options: any = {}) {
		if (!el || !el.animate) return null;
		if (this.reduced) {
			const opacity = keyframes.map((k?: any) => ({ opacity: k.opacity ?? 1 }));
			return el.animate(opacity, {
				...options,
				easing: "linear",
				delay: 0,
				duration: this.reducedDuration,
			});
		}
		// CSS state can hold travel without cancelling the animation's fade or timeline.
		const managed = keyframes.map((frame?: any) =>
			typeof frame.transform === "string"
				? { ...frame, transform: `var(--motion-managed-transform, ${frame.transform})` }
				: frame,
		);
		return el.animate(managed, {
			duration: this.time("base"),
			easing: this.curve(),
			...options,
		});
	},
	/** Absolute rail notices fade without moving the navigation or leaving clickable ghosts. */
	visibility(el: HTMLElement, visible: boolean) {
		if (!el) return;
		const previous = this.visibilityAnimations.get(el);
		if (!el.animate) {
			previous?.animation?.cancel();
			this.visibilityAnimations.delete(el);
			el.inert = !visible;
			el.hidden = !visible;
			return;
		}
		if (previous?.visible === visible || (!previous && el.hidden === !visible)) return;
		const style = el.animate ? getComputedStyle(el) : null;
		const opacity = el.hidden ? 0 : Number.parseFloat(style?.opacity || "1");
		const transform = el.hidden ? "translateY(4px)" : style?.transform || "none";
		previous?.animation?.cancel();
		el.inert = !visible;
		el.hidden = false;
		const state = { visible, animation: null as Animation | null };
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
		this.contentAnimations.get(el)?.cancel();
		const animation = this.animate(el, [{ opacity: 0 }, { opacity: 1 }], {
			duration: this.time("fast"),
		});
		this.contentAnimations.set(el, animation);
		return animation;
	},
	resize(el: HTMLElement, before: number) {
		if (!el) return;
		this.contentAnimations.get(el)?.cancel();
		const after = el.getBoundingClientRect().height;
		if (this.reduced || Math.abs(before - after) < 1) return this.fade(el);
		const animation = this.animate(
			el,
			[
				{ height: `${before}px`, opacity: 0.5, overflow: "hidden" },
				{ height: `${after}px`, opacity: 1, overflow: "hidden" },
			],
			{ duration: this.time("base") },
		);
		this.contentAnimations.set(el, animation);
		return animation;
	},
	// Retain the removed surface only for its exit; it has no live controls or identity.
	cancelExit(key: string) {
		this.exits.get(key)?.remove();
		this.exits.delete(key);
	},
	retire(el: HTMLElement, rect: DOMRect, key: string) {
		this.cancelExit(key);
		if (rect.bottom <= 0 || rect.top >= innerHeight) return;
		for (const animation of el.getAnimations({ subtree: true })) animation.cancel();
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
			this.panelTasks.delete(el);
		}
		(this.panelAnimations.get(el) || []).forEach((animation?: any) => {
			animation?.cancel();
		});
		this.panelAnimations.delete(el);
	},
	openPanel(el?: any, _origin?: DOMRect | null) {
		this.cancelPanel(el);
		const sheet = this.surface(el),
			bar = el.querySelector(":scope > .float-bar, .reader .float-bar");
		// Phone: the preview is a sheet rising from the bottom edge; its position is a CSS transition, the dim fades in with it.
		if (this.phoneSheet(el)) {
			if (this.reduced) {
				this.panelAnimations.set(el, [this.enter(el)]);
				return;
			}
			sheet.classList.add("is-drag", "is-off");
			el.style.setProperty("--backdrop", "0");
			bar?.classList.add("is-hidden");
			void sheet.offsetHeight;
			const tasks = { frame: 0, timer: 0 };
			this.panelTasks.set(el, tasks);
			tasks.frame = requestAnimationFrame(() => {
				tasks.frame = 0;
				if (this.panelTasks.get(el) !== tasks || !el.open || !sheet.isConnected) return;
				sheet.classList.remove("is-drag", "is-off");
				el.style.removeProperty("--backdrop");
				this.panelTasks.delete(el);
				bar?.classList.remove("is-hidden");
			});
			return;
		}
		// Keep a single text layer at its final size; the toolbar enters at the same time.
		const animations = [this.enter(sheet)];
		if (bar && bar !== sheet) animations.push(this.enter(bar));
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
