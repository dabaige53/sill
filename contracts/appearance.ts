/**
 * Layout preference values shared by local.ts and cloud.ts. Plain data, so the Web can read the
 * defaults without bundling zod; local.ts builds the schema fields from these choices.
 */
const textSize = ["small", "standard", "large"] as const;
const spacing = ["compact", "standard", "roomy"] as const;

export const appearanceChoices = {
	cardTextSize: textSize,
	cardSpacing: spacing,
	cardPadding: spacing,
	readerTextSize: textSize,
	readerSpacing: spacing,
	readerWidth: ["narrow", "standard", "full"],
	textWeight: ["standard", "strong"],
} as const;

export const defaultAppearance = {
	cardTextSize: "standard",
	cardSpacing: "standard",
	cardPadding: "standard",
	readerTextSize: "standard",
	readerSpacing: "standard",
	readerWidth: "full",
	textWeight: "standard",
} as const;
