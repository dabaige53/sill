import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { carryCapsule, returnFace } from "./card-transition.ts";
import { detailNavigationMotion } from "./motion-detail-navigation.ts";
import type { Playback } from "./motion-playback.ts";

// Snapshots share the product stylesheet, including pseudo-elements, without copying
// computed styles for every paragraph. Shadow DOM keeps their IDs and controls isolated.
const detailStyles = new WeakMap<
	Document,
	{ count: number; text: string; sheet?: CSSStyleSheet }
>();
function styleDetailSnapshot(shadow: ShadowRoot) {
	const doc = shadow.ownerDocument;
	let cached = detailStyles.get(doc);
	if (!cached || cached.count !== doc.styleSheets.length) {
		const text = [...doc.styleSheets]
			.filter((sheet) => !sheet.disabled)
			.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
			.join("\n");
		cached = { count: doc.styleSheets.length, text };
		if ("adoptedStyleSheets" in shadow && "replaceSync" in CSSStyleSheet.prototype) {
			cached.sheet = new CSSStyleSheet();
			cached.sheet.replaceSync(text);
		}
		detailStyles.set(doc, cached);
	}
	if (cached.sheet) shadow.adoptedStyleSheets = [cached.sheet];
	else {
		const style = doc.createElement("style");
		style.textContent = cached.text;
		shadow.append(style);
	}
}

/** Center-origin FLIP: final layout stays fixed while the surface travels from/to its card. */
export function cardTransform(
	source: Pick<DOMRect, "left" | "top" | "width" | "height">,
	target: Pick<DOMRect, "left" | "top" | "width" | "height">,
) {
	return `translate(${source.left + source.width / 2 - target.left - target.width / 2}px,${source.top + source.height / 2 - target.top - target.height / 2}px) scale(${source.width / target.width},${source.height / target.height})`;
}

export const panelMotion: Record<string, any> = {
	...detailNavigationMotion,
	panelAnimations: new WeakMap(),
	resizeFaces: new WeakMap(),
	prepareResize(dialog: HTMLElement) {
		if (this.keyboard) return;
		const previous = this.resizeFaces.get(dialog) as HTMLElement | undefined;
		// Detach the existing visual before cancelling its owner on a quick reversal.
		const face = (previous || this.captureDetail(dialog)?.face) as HTMLElement | undefined;
		if (!face) return;
		face.remove();
		face.style.opacity = "1";
		const root = face.shadowRoot;
		// Visual references use the cover only; they never mount a second media frame.
		for (const poster of root?.querySelectorAll<HTMLElement>(".youtube-poster") || []) {
			poster.hidden = false;
			poster.style.opacity = "1";
		}
		for (const frame of root?.querySelectorAll<HTMLElement>(".youtube-frame[data-video-cover]") ||
			[]) {
			const player = frame.querySelector<HTMLElement>(".youtube-player");
			if (player) {
				player.style.backgroundImage = `url("${frame.dataset.videoCover}")`;
				player.style.backgroundSize = "cover";
				player.style.backgroundPosition = "center";
			}
		}
		this.resizeFaces.set(dialog, face);
	},
	resizeHost(dialog: HTMLElement) {
		const face = this.resizeFaces.get(dialog) as HTMLElement | undefined;
		if (!face) return null;
		const existing = face.parentElement;
		if (existing?.hasAttribute("data-resize-visual")) return existing;
		const host = document.createElement("div");
		host.dataset.resizeVisual = "";
		host.inert = true;
		host.setAttribute("aria-hidden", "true");
		Object.assign(host.style, {
			position: "fixed",
			inset: "0",
			zIndex: "8",
			pointerEvents: "none",
		});
		host.append(face);
		dialog.append(host);
		return host;
	},
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
	/** Keep the original CSS in an inert, isolated snapshot; sample only surface geometry. */
	captureDetail(dialog: HTMLElement, targetId?: string) {
		if (this.keyboard) return null;
		const leaving = this.detailTransitions.get(dialog);
		const resume =
			leaving?.id === targetId && targetId
				? {
						opacity: getComputedStyle(leaving.face).opacity,
						transform: getComputedStyle(leaving.face).transform,
					}
				: undefined;
		const face = document.createElement("div");
		const shadow = face.attachShadow({ mode: "open" });
		styleDetailSnapshot(shadow);
		const root = document.createElement("div");
		for (const attribute of [...dialog.attributes])
			root.setAttribute(attribute.name, attribute.value);
		for (const child of [...dialog.childNodes]) root.append(child.cloneNode(true));
		for (const node of root.querySelectorAll("[data-detail-face]")) node.remove();
		shadow.append(root);
		const drawn = getComputedStyle(dialog);
		Object.assign(root.style, {
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			maxWidth: "none",
			maxHeight: "none",
			margin: "0",
			padding: drawn.padding,
			border: drawn.border,
			background: drawn.background,
			boxShadow: drawn.boxShadow,
			borderRadius: drawn.borderRadius,
			overflow: drawn.overflow,
			color: drawn.color,
			font: drawn.font,
			opacity: "1",
			transform: "none",
			translate: "none",
		});
		const originals = [...dialog.children].filter((node) => !node.hasAttribute("data-detail-face"));
		for (let i = 0; i < originals.length; i++) {
			const style = getComputedStyle(originals[i]);
			Object.assign((root.children[i] as HTMLElement).style, {
				opacity: style.opacity,
				transform: style.transform,
			});
		}
		const scrolls: [HTMLElement, number, number][] = [];
		const scrollSelector = "#reader-scroll, .sheet-scroll";
		const copies = root.querySelectorAll<HTMLElement>(scrollSelector);
		for (const [i, node] of [...dialog.querySelectorAll<HTMLElement>(scrollSelector)].entries()) {
			scrolls.push([copies[i], node.scrollTop, node.scrollLeft]);
		}
		// Detached clones do not run effects; strip sources before mounting so embeds cannot load.
		const media = dialog.querySelectorAll<HTMLElement>("iframe, audio, video, source");
		root.querySelectorAll("iframe, audio, video, source").forEach((node, i) => {
			const still = document.createElement("div");
			still.style.cssText = (node as HTMLElement).style.cssText;
			Object.assign(still.style, {
				width: `${media[i].offsetWidth}px`,
				height: `${media[i].offsetHeight}px`,
			});
			node.replaceWith(still);
		});
		const rect = dialog.getBoundingClientRect();
		const matrix = drawn.transform
			.match(/^matrix\(([^)]+)\)$/)?.[1]
			.split(",")
			.map(Number);
		const width = dialog.offsetWidth || rect.width,
			height = dialog.offsetHeight || rect.height;
		const [originX, originY] = drawn.transformOrigin.split(" ").map(parseFloat);
		const left =
			rect.left -
			(matrix ? (Number.isFinite(originX) ? originX : width / 2) * (1 - matrix[0]) + matrix[4] : 0);
		const top =
			rect.top -
			(matrix
				? (Number.isFinite(originY) ? originY : height / 2) * (1 - matrix[3]) + matrix[5]
				: 0);
		Object.assign(face.style, {
			position: "fixed",
			left: `${left}px`,
			top: `${top}px`,
			right: "auto",
			bottom: "auto",
			width: `${width}px`,
			height: `${height}px`,
			margin: "0",
			transform: drawn.transform,
			transformOrigin: drawn.transformOrigin,
			opacity: drawn.opacity,
			translate: "none",
			pointerEvents: "none",
		});
		face.inert = true;
		face.setAttribute("aria-hidden", "true");
		face.setAttribute("data-detail-face", "");
		return { face, scrolls, phone: this.phoneSheet(dialog), resume };
	},
	/** Wait until dialog sizing and focus settle; keep its first frame hidden until Motion owns it. */
	queuePanel(
		el: HTMLElement,
		origin?: DOMRect | null,
		resume?: { opacity: string; transform: string },
	) {
		this.cancelPanel(el);
		if (el.hasAttribute("data-phone-drawer") || this.keyboard) return;
		const sheet = this.surface(el);
		const opacity = sheet.style.opacity;
		const desktop = !matchMedia("(max-width:650px)").matches && el.dataset.readerResize !== "true";
		const tools = desktop
			? this.detailTools(el).map((tool: HTMLElement) => [tool, tool.style.opacity] as const)
			: [];
		for (const [tool] of tools) tool.style.opacity = "0";
		const resizing = el.dataset.readerResize === "true";
		// A phone sheet waits off screen for this frame; so does its dim.
		const phone = this.phoneSheet(el) && !resume && !resizing;
		if (phone) this.dim(el, 0);
		// A reader growing out of its preview keeps the preview's dim until it covers the screen.
		if (resizing && el.classList.contains("reader")) el.dataset.readerGrowing = "";
		const host = resizing ? this.resizeHost(el) : null;
		const waiting = host
			? [
					...sheet.children,
					...(sheet === el ? [] : [...el.children].filter((node) => node !== sheet)),
				]
					.filter((node) => node !== host)
					.map((node: HTMLElement) => [node, node.style.opacity] as const)
			: [];
		const restore = (keepVisual = false) => {
			sheet.style.opacity = opacity;
			for (const [node, value] of waiting) node.style.opacity = value;
			if (host && !keepVisual) {
				if (host.contains(this.resizeFaces.get(el))) this.resizeFaces.delete(el);
				host.remove();
			}
			for (const [tool, value] of tools) tool.style.opacity = value;
			if (phone) this.dim(el, null);
			delete el.dataset.readerGrowing;
		};
		if (host) for (const [node] of waiting) node.style.opacity = "0";
		else sheet.style.opacity = resume?.opacity || "0";
		const task = { frame: 0, restore };
		this.panelTasks.set(el, task);
		task.frame = requestAnimationFrame(() => {
			if (this.panelTasks.get(el) !== task) return;
			this.panelTasks.delete(el);
			restore(true);
			if ((el as HTMLDialogElement).open) this.openPanel(el, origin, resume);
		});
	},
	openPanel(el?: any, origin?: DOMRect | null, resume?: { opacity: string; transform: string }) {
		this.cancelPanel(el);
		const sheet = this.surface(el),
			bar = el.querySelector(
				":scope > .phone-drawer > .float-bar, :scope > .float-bar, .reader .float-bar",
			);
		if (el.dataset.readerResize === "true" && origin) {
			delete el.dataset.readerResize;
			const target = sheet.getBoundingClientRect();
			const background = document.createElement("div");
			background.dataset.readerResizeSurface = "";
			const style = getComputedStyle(sheet);
			Object.assign(background.style, {
				position: "fixed",
				left: `${target.left}px`,
				top: `${target.top}px`,
				width: `${target.width}px`,
				height: `${target.height}px`,
				background: style.backgroundColor,
				borderRadius: style.borderRadius,
				boxShadow: style.boxShadow,
				pointerEvents: "none",
				zIndex: "-1",
			});
			const previous = [sheet.style.background, sheet.style.boxShadow, el.style.isolation];
			sheet.style.background = "transparent";
			sheet.style.boxShadow = "none";
			el.style.isolation = "isolate";
			// The reader's own backdrop is the page colour; showing it now would cover the growth.
			if (el.classList.contains("reader")) el.dataset.readerGrowing = "";
			el.append(background);
			const animation = this.animate(
				background,
				[{ transform: cardTransform(origin, target) }, { transform: "none" }],
				{ duration: this.time("dur-open"), spring: "expanded" },
			);
			const host = this.resizeHost(el);
			const face = this.resizeFaces.get(el) as HTMLElement | undefined;
			const content = [
				...sheet.children,
				...(sheet === el ? [] : [...el.children].filter((node) => node !== sheet)),
			].filter((node) => node !== background && node !== host) as HTMLElement[];
			const states = content.map((node) => ({
				node,
				opacity: node.style.opacity,
				inert: node.inert,
			}));
			if (host)
				for (const { node } of states) {
					node.style.opacity = "0";
					node.inert = true;
				}
			const clip = (rect: DOMRect) =>
				`inset(${rect.top}px ${innerWidth - rect.left - rect.width}px ${innerHeight - rect.top - rect.height}px ${rect.left}px round ${style.borderRadius || "0px"})`;
			const clipped = host
				? this.animate(host, [{ clipPath: clip(origin) }, { clipPath: clip(target) }], {
						spring: "expanded",
					})
				: null;
			let active = true;
			const restoreContent = () => {
				for (const { node, opacity, inert } of states) {
					node.style.opacity = opacity;
					node.inert = inert;
				}
			};
			const cleanup = () => {
				if (!active) return;
				active = false;
				if (host?.contains(face)) this.resizeFaces.delete(el);
				host?.remove();
				background.remove();
				delete el.dataset.readerGrowing;
				[sheet.style.background, sheet.style.boxShadow, el.style.isolation] = previous;
				restoreContent();
			};
			const animations = [animation, clipped, { cancel: cleanup, complete: cleanup }];
			const reveal = () => {
				if (!active) return;
				if (!host) {
					cleanup();
					return;
				}
				// Both surfaces crossfade in the same task after the frame reaches its target.
				restoreContent();
				const fades = states.map(({ node }) => this.revealDetail(node, 0));
				fades.push(
					this.animate(host, [{ opacity: 1 }, { opacity: 0 }], {
						duration: tokens.motion.detailFade,
					}),
				);
				animations.push(...fades);
				Promise.all(fades.map((fade) => fade?.finished)).then(cleanup, () => {});
			};
			this.panelAnimations.set(el, animations);
			if (animation) animation.finished.then(reveal, () => {});
			else reveal();
			return;
		}
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
			// The sheet rises opaque, like the drag that closes it; the dim arrives with it.
			if (!this.keyboard) {
				this.dim(el, 0);
				this.dim(el, 1, this.time("dur-sheet"));
			}
			const animation = this.animate(
				sheet,
				[{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
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
};
