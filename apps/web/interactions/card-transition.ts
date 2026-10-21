import { animate, motionValue, spring } from "motion";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import type { Playback } from "./motion-playback.ts";

type Rect = Pick<DOMRect, "left" | "top" | "width" | "height">;
type Pose = { x: number; y: number; sx: number; sy: number };
const identity: Pose = { x: 0, y: 0, sx: 1, sy: 1 };

export function readCardPose(transform: string): Pose {
	if (!transform || transform === "none") return identity;
	const values = transform
		.match(/matrix\(([^)]+)\)/)?.[1]
		.split(",")
		.map(Number);
	if (values) return { x: values[4], y: values[5], sx: values[0], sy: values[3] };
	const translate = transform.match(/translate\(([-.\d]+)px,\s*([-.\d]+)px\)/);
	const scale = transform.match(/scale\(([-.\d]+),\s*([-.\d]+)\)/);
	return {
		x: Number(translate?.[1] || 0),
		y: Number(translate?.[2] || 0),
		sx: Number(scale?.[1] || 1),
		sy: Number(scale?.[2] || 1),
	};
}

/** The capsule follows the bottom edge, without scaling its icons or its bottom gap. */
export function capsulePose(pose: Pose, surface: Rect, tool: Rect, nested: boolean): Pose {
	const dx = tool.left + tool.width / 2 - surface.left - surface.width / 2;
	const dy = tool.top + tool.height / 2 - surface.top - surface.height / 2;
	const x = pose.x + dx * (pose.sx - 1);
	const y = pose.y + (surface.height * (pose.sy - 1)) / 2;
	return nested
		? { x: 0, y: (y - pose.y - dy * (pose.sy - 1)) / pose.sy, sx: 1 / pose.sx, sy: 1 / pose.sy }
		: { x, y, sx: 1, sy: 1 };
}

/** Same curve and progress as the surface; only transform is written on animation frames. */
export function carryCapsule(
	dialog: HTMLElement,
	surface: HTMLElement,
	from: string,
	to: string,
	opening: boolean,
): Playback | null {
	const tool = dialog.querySelector<HTMLElement>(".float-bar");
	if (
		!tool ||
		getComputedStyle(tool).visibility === "hidden" ||
		tool.matches(".is-tucked, .is-hidden")
	)
		return null;
	const rect = surface.getBoundingClientRect(),
		toolRect = tool.getBoundingClientRect();
	const nested = surface.contains(tool);
	const start = readCardPose(from),
		end = readCardPose(to);
	const previous = tool.style.transform;
	let active = true;
	tool.dataset.cardFlight = "";
	const progress = motionValue(0);
	const draw = (p: number) => {
		const pose = {
			x: start.x + (end.x - start.x) * p,
			y: start.y + (end.y - start.y) * p,
			sx: start.sx + (end.sx - start.sx) * p,
			sy: start.sy + (end.sy - start.sy) * p,
		};
		const value = capsulePose(pose, rect, toolRect, nested);
		tool.style.transform = `translate(${value.x}px,${value.y}px) scale(${value.sx},${value.sy})`;
	};
	draw(0);
	const unsubscribe = progress.on("change", draw);
	const control = animate(
		progress,
		1,
		opening
			? { type: spring, ...tokens.motion.cardSpring }
			: {
					duration: tokens.motion.cardReturn.duration / 1000,
					ease: tokens.motion.cardReturn.easing.match(/[\d.]+/g)!.map(Number) as [
						number,
						number,
						number,
						number,
					],
				},
	);
	const finished = control.finished.then(() => {
		if (!active) return;
		unsubscribe();
		progress.destroy();
		delete tool.dataset.cardFlight;
		if (opening) tool.style.transform = previous;
	});
	return {
		finished,
		cancel() {
			active = false;
			delete tool.dataset.cardFlight;
			control.stop();
			unsubscribe();
			progress.destroy();
			tool.style.transform = previous;
		},
		complete() {
			control.complete();
		},
	};
}

/** A non-interactive copy at source dimensions; the moving surface clips and carries it home. */
export function returnFace(source: HTMLElement, surface: HTMLElement): HTMLElement | null {
	const sourceRect = source.getBoundingClientRect(),
		target = surface.getBoundingClientRect();
	if (!sourceRect.width || !sourceRect.height || !target.width || !target.height) return null;
	const face = source.cloneNode(true) as HTMLElement;
	for (const node of [face, ...face.querySelectorAll<HTMLElement>("*")]) {
		node.removeAttribute("id");
		node.removeAttribute("data-card");
	}
	face.inert = true;
	face.setAttribute("aria-hidden", "true");
	face.dataset.returnFace = "";
	Object.assign(face.style, {
		position: "absolute",
		top: "0",
		left: "0",
		right: "auto",
		bottom: "auto",
		margin: "0",
		width: `${sourceRect.width}px`,
		height: `${sourceRect.height}px`,
		minWidth: "0",
		maxWidth: "none",
		maxHeight: "none",
		boxSizing: "border-box",
		transformOrigin: "0 0",
		transform: `scale(${target.width / sourceRect.width},${target.height / sourceRect.height})`,
		translate: "none",
		scale: "none",
		rotate: "none",
		visibility: "visible",
		opacity: "0",
		pointerEvents: "none",
		zIndex: "3",
		transition: "none",
		animation: "none",
	});
	surface.append(face);
	return face;
}
