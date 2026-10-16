import { z } from "zod/v4";
import { Card, id, sourceKinds, timestamp } from "./card.ts";

export const CardState = z
	.object({
		seen: z.boolean().optional(),
		read: z.boolean().optional(),
		bookmarked: z.boolean().optional(),
		later: z.boolean().optional(),
		tagsEdited: z.boolean().optional(),
		progress: z.number().min(0).max(1).optional(),
		note: z.string().max(4000).optional(),
		tags: z.array(z.string().max(30)).max(20).optional(),
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
		singleKeyShortcuts: z.boolean().optional(),
		sort: z.enum(["priority", "unread", "time"]).optional(),
		reduceTransparency: z.boolean().optional(),
		stack: z.boolean().optional(),
		fadeRead: z.boolean().optional(),
		archiveAfter: z.enum(["3d", "7d", "never"]).optional(),
		floatTimely: z.boolean().optional(),
		collapseOnFinish: z.boolean().optional(),
		newHint: z.enum(["away", "off"]).optional(),
		theme: z.enum(["system", "light", "dark"]).optional(),
		density: z.enum(["compact", "standard", "roomy"]).optional(),
		reduceMotion: z.boolean().optional(),
		aiLocal: z.boolean().optional(),
		onboarded: z.boolean().optional(),
	})
	.passthrough();
export const Source = z
	.object({
		id,
		kind: z.enum(sourceKinds),
		name: z.string().min(1).max(100),
		detail: z.string().max(200).default(""),
		enabled: z.boolean().default(true),
		status: z.enum(["ok", "attention", "paused"]).default("ok"),
		syncedAt: timestamp.optional(),
		count: z.number().int().min(0).max(1e7).default(0),
		stack: z.boolean().default(true),
		open: z.enum(["inside", "web"]).default("inside"),
		range: z.enum(["30d", "all"]).default("30d"),
	})
	.passthrough();
export const State = z
	.object({
		cards: z.array(Card).max(5000),
		items: z.record(id, CardState),
		seconds: z.number().min(0).max(1e7),
		preferences: Preferences,
		sources: z.array(Source).max(200).optional(),
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
	z.object({ op: z.literal("source.upsert"), source: Source }).strict(),
	z.object({ op: z.literal("source.delete"), id }).strict(),
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
