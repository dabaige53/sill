const MotionEngine: Record<string, any> = {
	query: matchMedia("(prefers-reduced-motion: reduce)"),
	panelAnimations: new WeakMap(),
	panelTasks: new WeakMap(),
	layoutAnimations: new WeakMap(),
	visibilityAnimations: new WeakMap(),
	get reduced() {
		return this.query.matches || !!document.body?.classList.contains("reduce-motion");
	},
	get reducedDuration() {
		return (
			parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-reduced")) || 70
		);
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
		return el.animate(keyframes, {
			duration: 260,
			easing: "cubic-bezier(.2,.75,.25,1)",
			...options,
		});
	},
	/** Absolute rail notices fade without moving the navigation or leaving clickable ghosts. */
	visibility(el: HTMLElement, visible: boolean) {
		if (!el) return;
		const previous = this.visibilityAnimations.get(el);
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
			{ duration: visible ? 220 : 180 },
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
			{ duration: 280, delay, fill: "backwards" },
		);
	},
	// New cards drop in from above: the one motion for arrivals.
	drop(el?: any, delay: any = 0) {
		return this.animate(
			el,
			[
				{ opacity: 0, transform: "translateY(-14px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: 360, delay },
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
	openPanel(el?: any, origin?: any) {
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
				tasks.timer = window.setTimeout(() => {
					if (this.panelTasks.get(el) !== tasks) return;
					this.panelTasks.delete(el);
					if (el.open && sheet.isConnected && !sheet.classList.contains("is-off"))
						bar?.classList.remove("is-hidden");
				}, 140);
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
		if (Math.abs(x) + Math.abs(y) > 1)
			this.layoutAnimations.set(
				el,
				this.animate(
					el,
					[{ transform: `translate(${x}px,${y}px)` }, { transform: "translate(0,0)" }],
					{ duration: 320 },
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
