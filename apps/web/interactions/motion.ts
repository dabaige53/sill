const MotionEngine: Record<string, any> = {
	query: matchMedia("(prefers-reduced-motion: reduce)"),
	panelAnimations: new WeakMap(),
	panelRuns: new WeakMap(),
	layoutAnimations: new WeakMap(),
	contentAnimations: new WeakMap(),
	visibilityRuns: new WeakMap(),
	exits: new Map(),
	time(name: string) {
		return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`));
	},
	get reduced() {
		return this.query.matches || !!document.body?.classList.contains("reduce-motion");
	},
	animate(el?: any, keyframes?: any, options: any = {}) {
		if (!el || !el.animate) return null;
		if (this.reduced) {
			const opacity = keyframes.map((k?: any) => ({ opacity: k.opacity ?? 1 }));
			return el.animate(opacity, { easing: "linear", ...options, delay: 0, duration: 70 });
		}
		return el.animate(keyframes, {
			duration: 260,
			easing: "cubic-bezier(.2,.75,.25,1)",
			...options,
		});
	},
	enter(el?: any, delay: any = 0) {
		return this.animate(
			el,
			[
				{ opacity: 0, transform: "translateY(10px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: 280, delay, fill: "backwards" },
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
	visibility(el: HTMLElement, visible: boolean, done: () => void = () => {}) {
		const previous = this.visibilityRuns.get(el);
		if (previous?.visible === visible) return;
		const opacity = el.hidden ? 0 : getComputedStyle(el).opacity;
		previous?.animation?.cancel();
		const run = { visible, animation: null };
		this.visibilityRuns.set(el, run);
		if (visible) el.hidden = false;
		el.inert = !visible;
		if (el.hidden) {
			done();
			return;
		}
		run.animation = this.animate(el, [{ opacity }, { opacity: visible ? 1 : 0 }], {
			duration: this.time(visible ? "base" : "fast"),
		});
		const finish = () => {
			if (this.visibilityRuns.get(el) !== run) return;
			el.hidden = !visible;
			done();
		};
		if (run.animation) run.animation.finished.then(finish, () => {});
		else finish();
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
				{ opacity: 0, transform: "translateY(-14px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: 360, delay, fill: "backwards" },
		);
	},
	press(el?: any) {
		return this.animate(
			el,
			[
				{ transform: "scale(1)" },
				{ transform: "scale(.93)", offset: 0.35 },
				{ transform: "scale(1)" },
			],
			{ duration: 240 },
		);
	},
	capture(el?: any) {
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return null;
		const title =
			el.querySelector('[data-shared="title"]') || el.querySelector(".card-title-button,h2,h1");
		return {
			el,
			id: el.dataset.card || "",
			rect,
			title: title?.getBoundingClientRect(),
			radius: getComputedStyle(el).borderTopLeftRadius,
		};
	},
	// The card that is open leaves an empty place on the desk until it lands back.
	lift(id?: any) {
		let style = document.getElementById("lift-style");
		if (!id) {
			style?.remove();
			return;
		}
		if (!style) {
			style = document.createElement("style");
			style.id = "lift-style";
			document.head.appendChild(style);
		}
		style.textContent = `[data-card="${CSS.escape(id)}"]:not(dialog *){opacity:0!important;transition:none!important}`;
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
		this.panelRuns.delete(el);
		this.contentAnimations.get(el)?.cancel();
		this.contentAnimations.get(this.surface(el))?.cancel();
		(this.panelAnimations.get(el) || []).forEach((animation?: any) => {
			animation?.cancel();
		});
		this.panelAnimations.delete(el);
	},
	openPanel(el?: any, origin?: any) {
		this.cancelPanel(el);
		const run = {};
		this.panelRuns.set(el, run);
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
			requestAnimationFrame(() => {
				if (this.panelRuns.get(el) !== run || !sheet.isConnected) return;
				sheet.classList.remove("is-drag", "is-off");
				el.style.removeProperty("--backdrop");
				window.setTimeout(() => {
					if (this.panelRuns.get(el) === run) bar?.classList.remove("is-hidden");
				}, this.time("fast"));
			});
			this.panelAnimations.set(
				el,
				[
					...sheet.querySelectorAll(
						":is(.preview-body,.reader-body)>:not(h1,.preview-meta,.preview-sender)",
					),
				].map((n?: any) =>
					n.animate([{ opacity: 0 }, { opacity: 1 }], {
						duration: 280,
						delay: 200,
						easing: "linear",
						fill: "backwards",
					}),
				),
			);
			return;
		}
		// Keep text at its final size. Scaling a cloned card over the detail sheet
		// creates two text layers and clips short notes during the transition.
		const animations = [this.enter(sheet)];
		if (bar && bar !== sheet) animations.push(this.enter(bar));
		this.panelAnimations.set(el, animations);
	},
	closePanel(el?: any, origin?: any, done: any = () => {}) {
		this.cancelPanel(el);
		done();
	},
	flip(el?: any, oldRect?: any, newRect?: any) {
		this.layoutAnimations.get(el)?.cancel();
		this.layoutAnimations.delete(el);
		const now = newRect || el.getBoundingClientRect(),
			x = oldRect.left - now.left,
			y = oldRect.top - now.top;
		if (Math.abs(x) + Math.abs(y) + Math.abs(oldRect.width - now.width) > 1)
			this.layoutAnimations.set(
				el,
				this.animate(
					el,
					[
						{ transform: `translate(${x}px,${y}px)`, width: `${oldRect.width}px` },
						{ transform: "translate(0,0)", width: `${now.width}px` },
					],
					{ duration: this.time("layout") },
				),
			);
	},
	pulse(el?: any) {
		return this.animate(
			el,
			[
				{ transform: "scale(1)" },
				{ transform: "scale(1.08)", offset: 0.5 },
				{ transform: "scale(1)" },
			],
			{ duration: 350 },
		);
	},
};

export { MotionEngine };
