import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { carryCapsule, returnFace } from "./card-transition.ts";
import { type Playback } from "./motion-playback.ts";

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
	/** Parent is already restored before this call; only the entering/leaving top layer moves. */
	navigateDetail(dialog: HTMLElement, captured: any, returning: boolean, leavingId?: string) {
		this.cancelPanel(dialog);
		if (!captured || this.keyboard) return;
		const { face, scrolls } = captured;
		const transition = returning ? { id: leavingId, face } : null;
		if (transition) this.detailTransitions.set(dialog, transition);
		const nodes = [...dialog.children] as HTMLElement[];
		const styles = nodes.map(
			(node) => [node, node.style.position, node.style.zIndex, node.style.background] as const,
		);
		// A reader's opaque page belongs to the moving content, not to the dialog behind it.
		const page = dialog.querySelector<HTMLElement>(":scope > .reader-scroll");
		if (page) page.style.background = getComputedStyle(dialog).background;
		for (const [node] of styles) {
			if (getComputedStyle(node).position === "static") node.style.position = "relative";
			node.style.zIndex = "1001";
		}
		face.style.zIndex = returning ? "1002" : "1000";
		dialog.append(face);
		for (const [node, top, left] of scrolls) {
			node.scrollTop = top;
			node.scrollLeft = left;
		}
		const phone = returning ? captured.phone : this.phoneSheet(dialog);
		const distance = this.surface(dialog).getBoundingClientRect().height;
		const travel = phone
			? `translateY(${returning ? face.getBoundingClientRect().height : distance}px)`
			: "translateY(10px)";
		const targets = returning ? [face] : nodes;
		const animations = targets.map((node) =>
			this.animate(
				node,
				phone
					? [
							{
								transform: returning
									? getComputedStyle(node).transform
									: captured.resume?.transform || travel,
							},
							{ transform: returning ? travel : "translateY(0)" },
						]
					: returning
						? [
								{
									opacity: getComputedStyle(node).opacity,
									transform: getComputedStyle(node).transform,
								},
								{ opacity: phone ? 1 : 0, transform: travel },
							]
						: [
								captured.resume || { opacity: phone ? 1 : 0, transform: travel },
								{ opacity: 1, transform: "translateY(0)" },
							],
				{
					duration: this.time(phone ? "dur-sheet" : returning ? "dur-close" : "dur-open"),
					easing: this.curve(phone ? "ease-sheet" : "ease"),
				},
			),
		);
		let active = true;
		const cleanup = () => {
			if (!active) return;
			active = false;
			face.remove();
			if (this.detailTransitions.get(dialog) === transition) this.detailTransitions.delete(dialog);
			for (const [node, position, zIndex, background] of styles) {
				node.style.position = position;
				node.style.zIndex = zIndex;
				node.style.background = background;
			}
		};
		const finished = Promise.all(animations.map((animation) => animation?.finished));
		finished.then(cleanup, cleanup);
		this.panelAnimations.set(dialog, [...animations, { cancel: cleanup, complete: cleanup }]);
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
		const restore = () => {
			sheet.style.opacity = opacity;
			for (const [tool, value] of tools) tool.style.opacity = value;
			if (phone) this.dim(el, null);
			delete el.dataset.readerGrowing;
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
			const body = sheet.querySelector(".reader-body, .preview-body");
			let active = true;
			const cleanup = () => {
				if (!active) return;
				active = false;
				background.remove();
				delete el.dataset.readerGrowing;
				[sheet.style.background, sheet.style.boxShadow, el.style.isolation] = previous;
			};
			animation?.finished.then(cleanup, cleanup);
			this.panelAnimations.set(el, [
				animation,
				...(body ? [this.revealDetail(body, 0)] : []),
				{ cancel: cleanup, complete: cleanup },
			]);
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
