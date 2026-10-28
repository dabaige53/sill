import { z } from "zod/v4";
import { appearanceShape } from "./appearance.ts";
import { Card, id, timestamp } from "./card.ts";
import { CardActions } from "./card-actions.ts";

export const CardState = z
	.object({
		seen: z.boolean().optional(),
		read: z.boolean().optional(),
		bookmarked: z.boolean().optional(),
		later: z.boolean().optional(),
		playbackPosition: z
			.number()
			.min(0)
			.max(86400)
			.optional()
			.describe(
				"Actual playback position in seconds, separate from reading progress; saving position does not mark read.",
			),
		progress: z.number().min(0).max(1).optional(),
		note: z.string().max(4000).optional(),
		taskDone: z.array(id).max(100).optional(),
		addedAt: timestamp.optional(),
		snoozedUntil: timestamp.optional(),
		dismissed: z.boolean().optional(),
		reminderDone: z.boolean().optional(),
		lastReminderKey: z.string().max(200).optional(),
		lastNotifiedAt: timestamp.optional(),
		readAt: timestamp.optional(),
		restoredAt: timestamp.optional(),
	})
	.passthrough();
export const Preferences = z
	.object({
		...appearanceShape,
		singleKeyShortcuts: z.boolean().optional(),
		// Legacy stored fields remain readable; clients no longer expose or apply them.
		reduceMotion: z.boolean().optional(),
		reduceTransparency: z.boolean().optional(),
		sort: z.enum(["priority", "unread", "time"]).optional(),
		stack: z.boolean().optional(),
		fadeRead: z.boolean().optional(),
		archiveAfter: z.enum(["3d", "7d", "never"]).optional(),
		floatTimely: z.boolean().optional(),
		collapseOnFinish: z.boolean().optional(),
		newHint: z.enum(["away", "off"]).optional(),
		theme: z.enum(["system", "light", "dark"]).optional(),
		density: z.enum(["compact", "standard", "roomy"]).optional(),
		aiLocal: z.boolean().optional(),
		onboarded: z.boolean().optional(),
		hiddenActions: z.array(z.enum(CardActions)).max(CardActions.length).optional(),
	})
	.passthrough();
export const State = z
	.object({
		cards: z.array(Card).max(5000),
		items: z.record(id, CardState),
		seconds: z.number().min(0).max(1e7),
		preferences: Preferences,
	})
	.passthrough();
export const Operation = z.discriminatedUnion("op", [
	z
		.object({ op: z.literal("card.upsert"), card: Card, before: Card.nullable().optional() })
		.strict(),
	z.object({ op: z.literal("card.delete"), id, before: Card.optional() }).strict(),
	z
		.object({ op: z.literal("item.patch"), id, values: CardState, before: CardState.optional() })
		.strict(),
	z
		.object({
			op: z.literal("preferences.patch"),
			values: Preferences,
			before: Preferences.optional(),
		})
		.strict(),
	z.object({ op: z.literal("reading.add"), seconds: z.number().int().min(0).max(86400) }).strict(),
]);
export const Batch = z
	.object({
		operations: z.array(Operation).min(1).max(500),
		expectedRevision: z.number().int().nonnegative().optional(),
	})
	.strict();
export type State = z.infer<typeof State>;
export type Batch = z.infer<typeof Batch>;
export type CardState = z.infer<typeof CardState>;
