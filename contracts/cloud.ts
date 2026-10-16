import { z } from 'zod/v4';
import { Card, cardTypes, id } from './card.ts';

export { id };
export const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const cloudState = z.object({ read: z.boolean().optional(), done: z.boolean().optional(), archived: z.boolean().optional() }).strict();
export const changes = z.object({ title: Card.shape.title.optional(), type: z.enum(cardTypes).optional(), body: Card.shape.body, url: Card.shape.url, state: cloudState.optional() }).strict();
export const create = changes.required({ title: true, type: true });
export const metadata = z.object({ event_id: id, outcome: z.enum(['succeeded', 'failed', 'unknown']), summary: z.string().max(2000) }).strict();
export const update = z.object({ expectedRevision: revision, changes: changes.optional(), metadata: metadata.optional() }).strict();
export const event = z.object({ event_id: id, card_id: id, card_version: revision, action: z.enum(['summarize', 'complete']), destination_ref: id }).strict();
const key = z.string().regex(/^[\w-]{8,128}$/);
export const toolInputs = {
  sill_listContents: z.object({ cursor: z.string().min(1).max(2048).optional(), since: z.string().min(1).max(2048).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  sill_getContent: z.object({ id }).strict(), sill_getEvent: z.object({ id }).strict(),
  sill_createContent: z.object({ idempotency_key: key, body: create }).strict(),
  sill_updateContent: z.object({ id, idempotency_key: key, body: update }).strict(),
  sill_deleteContent: z.object({ id, idempotency_key: key, body: z.object({ expectedRevision: revision }).strict() }).strict(),
  sill_submitEvent: z.object({ idempotency_key: key, body: event }).strict(),
};
const dateTime = z.string().datetime({ offset: true });
export const cloudCard = z.object({
  id, title: Card.shape.title, type: z.string().min(1).max(100), body: Card.shape.body.unwrap(),
  url: Card.shape.url, state: cloudState, revision, created_at: dateTime, updated_at: dateTime, deleted: z.boolean(),
}).passthrough();
export const cloudSchemas = {
  ID: id, Revision: revision, CreateCard: create, Changes: changes, ResultMetadata: metadata,
  UpdateCard: update, DeleteCard: z.object({ expectedRevision: revision }).strict(), Card: cloudCard,
  CardPage: z.object({ items: z.array(cloudCard), next_cursor: z.string().nullable(), sync_cursor: z.string().nullable() }).strict(),
  ListCards: toolInputs.sill_listContents, SubmitEvent: event,
  Event: event.extend({ delivery: z.enum(['queued', 'accepted', 'failed', 'unknown']), outcome: z.enum(['pending', 'succeeded', 'failed', 'unknown']), created_at: dateTime, updated_at: dateTime, result_revision: revision.nullable(), summary: z.string().max(2000) }),
  Error: z.object({ error: z.object({ code: z.enum(['invalid_request', 'unauthenticated', 'forbidden', 'not_found', 'revision_conflict', 'idempotency_conflict', 'cursor_expired', 'rate_limited', 'unavailable']), message: z.string(), request_id: id, current_revision: revision.optional(), retry_after_seconds: z.number().int().nonnegative().optional() }).strict() }).strict(),
  Health: z.object({ status: z.literal('ready'), contract: z.literal('sill-v1-draft1') }).strict(),
};
