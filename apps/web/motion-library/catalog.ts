import entries from "../../../design-system/motion/catalog.json" with { type: "json" };
import { type CopyKey, copy } from "../copy.ts";

export type Platform = "web" | "phone";
export type Availability =
	| "preview"
	| "missing-native"
	| "missing-preview"
	| "not-applicable"
	| "not-implemented";
export type AnimationEntry = {
	id: string;
	feature: string;
	interaction: string;
	component: string;
	implementation: string;
	native: string;
	parameters: string[];
	platforms: Record<Platform | "macos", Availability>;
};
export const catalog = entries as AnimationEntry[];
export const platforms: Platform[] = ["web", "phone"];
export const t = (key: string) => copy(`motion.${key}` as CopyKey);
export const describe = (entry: AnimationEntry, field: string) => t(`${entry.id}.${field}`);
export const availabilityLabel = (availability: Availability) =>
	t(
		availability === "missing-native"
			? "missingNative"
			: availability === "not-implemented"
				? "notImplemented"
				: availability === "not-applicable"
					? "notApplicable"
					: "missingPreview",
	);
export function exampleURL(id: string, platform: Platform, cover = false, embedded = false) {
	return `./examples/${encodeURIComponent(id)}/?platform=${platform}${cover ? "&cover=1" : ""}${embedded ? "&embedded=1" : ""}`;
}
