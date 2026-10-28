import { z } from "zod/v4";
import { Card, cardTypes, id } from "./card.ts";
import { cardIssues } from "./card-rules.ts";
import { CardState, Preferences } from "./local.ts";

export { id };
export const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const cloudState = CardState.extend({
	done: z.boolean().optional(),
	archived: z.boolean().optional(),
	lessLike: z.boolean().optional(),
}).strict();
export const cloudPreferences = Preferences.strict();
const rawCard = Card.refine(
	(value) =>
		![
			"state",
			"revision",
			"created_at",
			"updated_at",
			"deleted",
			"owner_id",
			"change_version",
		].some((key) => Object.hasOwn(value, key)),
	"server_metadata_forbidden",
);
export const workspaceBatch = z
	.object({
		operations: z
			.array(
				z.discriminatedUnion("op", [
					z
						.object({
							op: z.literal("card.upsert"),
							card: rawCard,
							before: Card.nullable().optional(),
						})
						.strict(),
					z.object({ op: z.literal("card.delete"), id, before: Card.optional() }).strict(),
					z
						.object({
							op: z.literal("item.patch"),
							id,
							values: cloudState,
							before: cloudState.optional(),
						})
						.strict(),
					z
						.object({
							op: z.literal("preferences.patch"),
							values: cloudPreferences,
							before: cloudPreferences.optional(),
						})
						.strict(),
					z
						.object({ op: z.literal("reading.add"), seconds: z.number().int().min(0).max(86400) })
						.strict(),
				]),
			)
			.min(1)
			.max(5000),
		expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
	})
	.strict();
const { id: cardId, ...cardFields } = Card.shape;
export const changes = z
	.object(cardFields)
	.partial()
	.extend({
		title: Card.shape.title.optional(),
		type: z
			.enum(cardTypes)
			.optional()
			.describe(
				"Card kind, not a MIME type or source kind. media uses media=video/podcast; pr requires pullRequest. Choose the kind matching the user's purpose.",
			),
		body: Card.shape.body,
		url: Card.shape.url,
		state: cloudState
			.optional()
			.describe(
				"Personal state, separate from card facts. Partial updates merge keys. progress is reading fraction; playbackPosition is media seconds. Neither means an external action completed.",
			),
	})
	.strict();
export const create = changes.required({ title: true, type: true }).superRefine((card, context) => {
	for (const message of cardIssues({
		...card,
		id: "new",
		type: card.type!,
		title: card.title!,
	}))
		context.addIssue({ code: "custom", message });
});
export const metadata = z
	.object({
		event_id: id,
		outcome: z.enum(["succeeded", "failed", "unknown"]),
		summary: z.string().max(2000),
	})
	.strict();
export const update = z
	.object({
		expectedRevision: revision,
		changes: changes.optional(),
		metadata: metadata.optional(),
	})
	.strict();
export const event = z
	.object({
		event_id: id,
		card_id: id,
		card_version: revision,
		action: z.enum(["summarize", "complete"]),
		destination_ref: id,
	})
	.strict();
const expected_owner = z
	.string()
	.min(1)
	.max(100)
	.optional()
	.describe(
		"Optional account guard from an authenticated host; grants no permissions. Keep it unchanged when retrying a request.",
	);
const key = z
	.string()
	.regex(/^[\w-]{8,128}$/)
	.describe(
		"New UUID per logical write. Reuse the exact key and arguments only when retrying that same write after checking an unknown result.",
	);
export const toolInputs = {
	sill_getWorkspace: z.object({ expected_owner }).strict(),
	sill_applyOperations: z
		.object({ expected_owner, idempotency_key: key, body: workspaceBatch })
		.strict(),
	sill_listContents: z
		.object({
			expected_owner,
			cursor: z.string().min(1).max(2048).optional(),
			since: z.string().min(1).max(2048).optional(),
			limit: z.number().int().min(1).max(100).optional(),
		})
		.strict(),
	sill_getContent: z.object({ id, expected_owner }).strict(),
	sill_getEvent: z.object({ id, expected_owner }).strict(),
	sill_createContent: z.object({ expected_owner, idempotency_key: key, body: create }).strict(),
	sill_updateContent: z.object({ expected_owner, id, idempotency_key: key, body: update }).strict(),
	sill_deleteContent: z
		.object({
			expected_owner,
			id,
			idempotency_key: key,
			body: z.object({ expectedRevision: revision }).strict(),
		})
		.strict(),
	sill_submitEvent: z.object({ expected_owner, idempotency_key: key, body: event }).strict(),
};
const dateTime = z.string().datetime({ offset: true });
export const cloudCard = z
	.object(cardFields)
	.partial()
	.extend({
		id,
		title: Card.shape.title,
		type: z.string().min(1).max(100),
		body: Card.shape.body.unwrap(),
		url: Card.shape.url,
		state: cloudState,
		revision,
		created_at: dateTime,
		updated_at: dateTime,
		deleted: z.boolean(),
	})
	.strict();
export const workspaceSnapshot = z
	.object({
		revision: z.number().int().nonnegative(),
		state: z
			.object({
				cards: z.array(cloudCard),
				items: z.record(id, cloudState),
				preferences: cloudPreferences,
				seconds: z.number().min(0).max(1e7),
			})
			.strict(),
	})
	.strict();
export const cloudSchemas = {
	Workspace: workspaceSnapshot,
	WorkspaceBatch: workspaceBatch,
	ID: id,
	Revision: revision,
	CreateCard: create,
	Changes: changes,
	ResultMetadata: metadata,
	UpdateCard: update,
	DeleteCard: z.object({ expectedRevision: revision }).strict(),
	Card: cloudCard,
	CardPage: z
		.object({
			items: z.array(cloudCard),
			next_cursor: z.string().nullable(),
			sync_cursor: z.string().nullable(),
		})
		.strict(),
	ListCards: toolInputs.sill_listContents,
	SubmitEvent: event,
	Event: event.extend({
		delivery: z.enum(["queued", "accepted", "failed", "unknown"]),
		outcome: z.enum(["pending", "succeeded", "failed", "unknown"]),
		created_at: dateTime,
		updated_at: dateTime,
		result_revision: revision.nullable(),
		summary: z.string().max(2000),
	}),
	Error: z
		.object({
			error: z
				.object({
					code: z.enum([
						"invalid_request",
						"unauthenticated",
						"forbidden",
						"not_found",
						"revision_conflict",
						"idempotency_conflict",
						"cursor_expired",
						"rate_limited",
						"unavailable",
					]),
					message: z.string(),
					request_id: id,
					current_revision: revision.optional(),
					retry_after_seconds: z.number().int().nonnegative().optional(),
				})
				.strict(),
		})
		.strict(),
	Health: z.object({ status: z.literal("ready"), contract: z.literal("sill-v1-draft1") }).strict(),
};
