import tokens from "../../tokens.json" with { type: "json" };
import type { AnimationEntry } from "./catalog.ts";

export type Overrides = Record<string, number | string>;
export type Parameter = {
	key: string;
	value: number | string;
	unit: string;
	min?: number;
	max?: number;
	step?: number;
};
export const draftKey = "sill-motion-preview-drafts-v3";
export const easingOptions = [
	"cubic-bezier(0.23,1,0.32,1)",
	"cubic-bezier(.32,.72,0,1)",
	"cubic-bezier(.5,1,.89,1)",
	"linear",
] as const;
export type DemoKind =
	| "press"
	| "check"
	| "switch"
	| "menu"
	| "tooltip"
	| "search"
	| "list"
	| "sheet"
	| "resize"
	| "drag"
	| "scroll"
	| "fade"
	| "toast"
	| "stack";
const kinds: Record<string, DemoKind> = {
	"control.press": "press",
	"task.mark": "check",
	"settings.toggle": "switch",
	"menu.scope": "menu",
	"menu.card": "menu",
	"hint.tooltip": "tooltip",
	"search.resize": "search",
	"feed.reorder": "list",
	"feed.first-entry": "list",
	"feed.arrival": "list",
	"feed.departure": "list",
	"detail.sheet": "sheet",
	"detail.card-flight": "resize",
	"detail.navigate": "fade",
	"detail.resize": "resize",
	"reader.gesture": "sheet",
	"reader.tools": "scroll",
	"reader.outline": "menu",
	"media.scroll-collapse": "scroll",
	"drag.selection": "drag",
	"drag.ai-target": "drag",
	"deck.swipe": "stack",
	"refresh.pull": "drag",
	"feedback.toast": "toast",
	"notice.offline": "toast",
	"notice.new-content": "toast",
	"selection.bar": "toast",
	"content.fade": "fade",
	"ai.context-entry": "list",
	"ai.dock-collapse": "resize",
	"ai.dock-height": "resize",
};
export const demoKind = (entry: AnimationEntry): DemoKind => kinds[entry.id] || "fade";

const defaults = structuredClone(tokens);
const extra: Record<string, string[]> = {
	"task.mark": ["motion.pressScale"],
	"menu.card": ["dur-menu", "dur-menu-close", "ease"],
	"reader.tools": ["rest-show", "ease"],
	"detail.card-flight": ["dur-sheet", "ease-sheet"],
	"detail.navigate": ["dur-sheet", "ease-sheet"],
	"detail.sheet": ["ease-sheet", "motion.expandedSpring", "motion.spring"],
	"reader.gesture": ["dur-sheet", "motion.spring", "motion.cardSpring"],
	"feedback.toast": ["motion.toastTravel", "ease"],
	"refresh.pull": ["motion.spring", "delay-loading"],
	"deck.swipe": ["ease"],
	"detail.resize": ["motion.cardSpring"],
	"selection.bar": ["dur-state", "ease"],
	"feed.reorder": ["motion.cardSpring"],
};
function valueAt(object: unknown, key: string): unknown {
	return key
		.split(".")
		.reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], object);
}
function numeric(key: string, value: number, unit = ""): Parameter {
	const part = key.split(".").at(-1);
	if (unit === "ms" || /duration|delay|Fade|Delay/.test(part || ""))
		return { key, value, unit: "ms", min: 0, max: 3000, step: 10 };
	if (part === "stiffness") return { key, value, unit, min: 1, max: 1200, step: 1 };
	if (part === "damping") return { key, value, unit, min: 1, max: 100, step: 1 };
	if (part === "mass") return { key, value, unit, min: 0.1, max: 5, step: 0.1 };
	if (part?.toLowerCase().includes("scale"))
		return { key, value, unit, min: 0.5, max: 1.5, step: 0.01 };
	if (part === "opacity" || part === "finishTravel")
		return { key, value, unit, min: 0, max: 1, step: 0.01 };
	return { key, value, unit: "px", min: 0, max: 100, step: 1 };
}
function expand(key: string): Parameter[] {
	const time = defaults.timing.tokens.find((item) => item.name === key);
	if (time) {
		if (/^\d+(\.\d+)?m?s$/.test(time.value))
			return [numeric(key, parseFloat(time.value) * (time.value.endsWith("ms") ? 1 : 1000), "ms")];
		return [{ key, value: time.value, unit: "curve" }];
	}
	const value = valueAt(defaults, key);
	if (typeof value === "number") return [numeric(key, value)];
	if (typeof value === "string") return [{ key, value, unit: "curve" }];
	if (value && typeof value === "object")
		return Object.keys(value).flatMap((part) => expand(key + "." + part));
	return [];
}
export function parametersFor(entry: AnimationEntry): Parameter[] {
	return [...new Set([...entry.parameters, ...(extra[entry.id] || [])])].flatMap(expand);
}
export function validOverrides(entry: AnimationEntry, input: unknown): Overrides {
	if (!input || typeof input !== "object" || Array.isArray(input)) return {};
	const result: Overrides = {};
	for (const p of parametersFor(entry)) {
		const value = (input as Overrides)[p.key];
		if (
			p.unit === "curve"
				? typeof value === "string" &&
					(easingOptions.some((option) => option === value) || value === p.value)
				: typeof value === "number" && Number.isFinite(value) && value >= p.min! && value <= p.max!
		)
			result[p.key] = value;
	}
	return result;
}
export function readDrafts(storage: Pick<Storage, "getItem">): Record<string, Overrides> {
	try {
		const value = JSON.parse(storage.getItem(draftKey) || "{}");
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	} catch {
		return {};
	}
}

/** Only called inside an isolated example, before importing the product runtime. */
export function applyPreviewOverrides(
	entry: AnimationEntry,
	input: unknown,
	style: CSSStyleDeclaration,
) {
	const overrides = validOverrides(entry, input);
	for (const [key, value] of Object.entries(overrides)) {
		const time = tokens.timing.tokens.find((item) => item.name === key);
		if (time) {
			time.value = typeof value === "number" ? value + "ms" : value;
			style.setProperty("--" + key, time.value);
		} else {
			const parts = key.split(".");
			const last = parts.pop();
			const parent = valueAt(tokens, parts.join(".")) as Record<string, unknown>;
			if (parent && last) parent[last] = value;
		}
	}
	return overrides;
}
