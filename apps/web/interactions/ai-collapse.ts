import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";

type Rect = Pick<DOMRect, "left" | "top" | "width" | "height">;
export type CollapseVisual = {
	frame: HTMLElement;
	animations: (Playback | null)[];
	complete(): void;
	cancel(): void;
};
export type CollapseCapture = {
	rect: Rect;
	content: HTMLElement;
	contentRect: Rect;
	opacity: string;
};

/** Sample the clipped frame before cancelling it, including an interrupted reversal. */
export function captureAIDock(node: HTMLElement, visual: CollapseVisual | null): CollapseCapture {
	const frame = visual?.frame;
	const rect = frame?.isConnected ? frame.getBoundingClientRect() : node.getBoundingClientRect();
	const inset = frame?.isConnected
		? getComputedStyle(frame)
				.clipPath.match(/^inset\(([^r)]+)/)?.[1]
				.trim()
				.split(/\s+/)
				.map(parseFloat)
		: null;
	const [top = 0, right = top, bottom = top, left = right] = inset || [];
	const content = frame?.querySelector<HTMLElement>("[data-collapse-content]") || node;
	const clone = content.cloneNode(true) as HTMLElement;
	clone.removeAttribute("id");
	clone.querySelectorAll("[id]").forEach((child) => {
		child.removeAttribute("id");
	});
	clone.querySelector(".ai-dock-surface")?.remove();
	clone.inert = true;
	return {
		rect: {
			left: rect.left + left,
			top: rect.top + top,
			width: rect.width - left - right,
			height: rect.height - top - bottom,
		},
		content: clone,
		contentRect: content.getBoundingClientRect(),
		opacity: getComputedStyle(content).opacity,
	};
}
export function anchoredBubble(anchor: Rect, diameter: number): Rect {
	return {
		left: anchor.left + anchor.width / 2 - diameter / 2,
		top: anchor.top + anchor.height / 2 - diameter / 2,
		width: diameter,
		height: diameter,
	};
}

/** Clip a real-size shell from the old frame to its anchor; text and icons never scale. */
export function animateAIDock(
	node: HTMLElement,
	captured: CollapseCapture,
	collapsed: boolean,
): CollapseVisual | null {
	if (MotionEngine.keyboard) return null;
	const target = node.getBoundingClientRect();
	const source = captured.rect;
	const bounds = {
		left: Math.min(source.left, target.left),
		top: Math.min(source.top, target.top),
		width:
			Math.max(source.left + source.width, target.left + target.width) -
			Math.min(source.left, target.left),
		height:
			Math.max(source.top + source.height, target.top + target.height) -
			Math.min(source.top, target.top),
	};
	const frame = document.createElement("div");
	frame.className = "glass";
	frame.dataset.aiCollapseVisual = "";
	frame.inert = true;
	frame.setAttribute("aria-hidden", "true");
	Object.assign(frame.style, {
		position: "fixed",
		left: `${bounds.left}px`,
		top: `${bounds.top}px`,
		width: `${bounds.width}px`,
		height: `${bounds.height}px`,
		pointerEvents: "none",
		zIndex: "50",
	});
	const clip = (rect: Rect) =>
		`inset(${rect.top - bounds.top}px ${bounds.left + bounds.width - rect.left - rect.width}px ${bounds.top + bounds.height - rect.top - rect.height}px ${rect.left - bounds.left}px round ${getComputedStyle(node).borderRadius || "30px"})`;
	const content = captured.content;
	content.dataset.collapseContent = "";
	Object.assign(content.style, {
		position: "absolute",
		left: `${captured.contentRect.left - bounds.left}px`,
		top: `${captured.contentRect.top - bounds.top}px`,
		width: `${captured.contentRect.width}px`,
		height: `${captured.contentRect.height}px`,
		translate: "none",
		transform: "none",
		background: "transparent",
		boxShadow: "none",
		backdropFilter: "none",
		opacity: captured.opacity,
	});
	frame.append(content);
	document.body.append(frame);
	node.classList.add("has-collapse-visual");
	const surface = node.querySelector<HTMLElement>(".ai-dock-surface");
	const elements = [...node.children].filter((child) => child !== surface) as HTMLElement[];
	const styles = elements.map((child) => ({ child, opacity: child.style.opacity }));
	const surfaceOpacity = surface?.style.opacity || "";
	if (surface) surface.style.opacity = "0";
	const timing = tokens.motion.aiCollapse;
	const duration = collapsed ? timing.close : timing.open;
	const animations: (Playback | null)[] = [
		MotionEngine.animate(frame, [{ clipPath: clip(source) }, { clipPath: clip(target) }], {
			duration,
			easing: timing.easing,
		}),
		MotionEngine.animate(content, [{ opacity: captured.opacity }, { opacity: 0 }], {
			duration: timing.contentOut,
			fill: "forwards",
		}),
	];
	for (const { child } of styles) {
		const fade = collapsed ? timing.bubbleIn : timing.contentIn;
		animations.push(
			MotionEngine.animate(child, [{ opacity: 0 }, { opacity: 1 }], {
				duration: fade,
				delay: duration - fade,
				fill: "backwards",
			}),
		);
	}
	let live = true;
	const cleanup = () => {
		if (!live) return;
		live = false;
		frame.remove();
		node.classList.remove("has-collapse-visual");
		if (surface) surface.style.opacity = surfaceOpacity;
		for (const { child, opacity } of styles) child.style.opacity = opacity;
	};
	const visual: CollapseVisual = {
		frame,
		animations,
		cancel() {
			for (const animation of animations) animation?.cancel();
			cleanup();
		},
		complete() {
			for (const animation of animations) animation?.complete();
			cleanup();
		},
	};
	Promise.all(animations.map((animation) => animation?.finished)).then(
		() => {
			for (const animation of animations) animation?.cancel();
			cleanup();
		},
		() => {},
	);
	return visual;
}
