import { z } from "zod/v4";

const textSize = z.enum(["small", "standard", "large"]);
const spacing = z.enum(["compact", "standard", "roomy"]);

export const appearanceShape = {
	cardTextSize: textSize.optional(),
	cardSpacing: spacing.optional(),
	cardPadding: spacing.optional(),
	readerTextSize: textSize.optional(),
	readerSpacing: spacing.optional(),
	readerWidth: z.enum(["narrow", "standard", "full"]).optional(),
	textWeight: z.enum(["standard", "strong"]).optional(),
};

export const defaultAppearance = {
	cardTextSize: "standard",
	cardSpacing: "standard",
	cardPadding: "standard",
	readerTextSize: "standard",
	readerSpacing: "standard",
	readerWidth: "full",
	textWeight: "standard",
} as const;
