import { defaultAppearance } from "../../../contracts/appearance.ts";
import tokens from "../../../design-system/tokens/apple.json" with { type: "json" };

type Appearance = { [K in keyof typeof defaultAppearance]?: string };
const metrics = tokens.apple;

/** Only content changes size; navigation and controls keep their existing dimensions. */
export function appearanceVariables(preferences: Appearance) {
	const size = (value?: string) =>
		value === "small" ? metrics.layoutTextSmall : value === "large" ? metrics.layoutTextLarge : 1;
	const spacing = (value?: string) =>
		value === "compact"
			? metrics.layoutSpaceCompact
			: value === "roomy"
				? metrics.layoutSpaceRoomy
				: 1;
	return {
		"--card-text-scale": String(size(preferences.cardTextSize)),
		"--reader-text-scale": String(size(preferences.readerTextSize)),
		"--card-space-scale": String(spacing(preferences.cardSpacing)),
		"--card-padding-scale": String(spacing(preferences.cardPadding)),
		"--reader-space-scale": String(spacing(preferences.readerSpacing)),
		"--reader-line-scale": String(
			preferences.readerSpacing === "compact"
				? metrics.layoutLineCompact
				: preferences.readerSpacing === "roomy"
					? metrics.layoutLineRoomy
					: 1,
		),
		"--reader-measure":
			preferences.readerWidth === "narrow"
				? `${metrics.layoutReaderNarrow}px`
				: preferences.readerWidth === "standard"
					? `${metrics.layoutReaderStandard}px`
					: "none",
		"--content-weight-add": preferences.textWeight === "strong" ? "100" : "0",
	};
}

export function applyAppearance(preferences: Appearance) {
	for (const [key, value] of Object.entries(appearanceVariables(preferences)))
		document.body.style.setProperty(key, value);
}
