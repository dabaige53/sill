import { contractVersion } from "./card.ts";

const cardFormat = `Card contract ${contractVersion}: type selects the card kind; summary is plain text for the card face; body is one CommonMark Markdown string, never an array or JSON-encoded string. Use native JSON objects/arrays/numbers/booleans for structured fields. Omit unknown facts. No points, card.meta or files[].meta/time. Personal notes belong to state.note. Dates retain their precision; scheduling timestamps use Unix milliseconds; media offsets and durations use seconds.`;
const writeRules =
	"Use a new idempotency_key for a new write; after an unknown result, verify first and retry only with the same key and identical arguments. A Sill write does not execute an external action.";

export const toolDescriptions = {
	sill_listContents:
		"Read cards page by page with limit 1–100. No keyword or type filter. Follow next_cursor; use only a returned sync_cursor as since. " +
		cardFormat,
	sill_getContent:
		"Read one authorized card by its real ID before editing. Preserve its revision, structured facts and personal state. " +
		cardFormat,
	sill_createContent:
		"Create one card with body:{type,title,...fields}; its nested body is Markdown. Prefer typed fields for tasks, meetings, files (including mail attachments), images, media chapters/transcript and PR snapshots. Unknown or removed fields are rejected. PR requires pullRequest with repository, number, state and observedAt. Read the returned ID to verify saved fields. " +
		cardFormat +
		" " +
		writeRules,
	sill_updateContent:
		"Patch a card using body:{expectedRevision,changes}; use the revision just read. Omitted fields stay unchanged; state merges by key, arrays/objects/Markdown replace as a whole. Merge preserved elements first. Fields do not accept null. Task completion and other personal state go in state, for example state.taskDone. Read the ID again after success. " +
		cardFormat +
		" " +
		writeRules,
	sill_deleteContent:
		"Delete only the requested, previously read card using body:{expectedRevision}. Archive via state.archived instead when requested. Confirm the deletion receipt. " +
		writeRules,
	sill_getWorkspace:
		"Read the complete authorized workspace: cards (including archived, excluding deleted), items keyed by card ID, preferences, seconds, and workspace revision. Filter or export this snapshot locally. Requires whole-workspace read access. " +
		cardFormat,
	sill_applyOperations:
		"Apply an atomic batch: card.upsert, card.delete, item.patch, preferences.patch, reading.add. Up to 5000 operations and 512 KiB UTF-8 request body. Requires whole-workspace read access plus permission for each write. Use original before or workspace expectedRevision; new card.upsert requires before:null and a new card.id. card is a full replacement: preserve existing facts and unknown fields, remove server metadata and state; put state in item.patch. Inspect the returned snapshot; no event metadata in a batch. " +
		cardFormat +
		" " +
		writeRules,
	sill_submitEvent:
		"Queue an explicitly requested, authorized event record. queued/accepted is not external execution or completion. " +
		writeRules,
	sill_getEvent:
		"Read an authorized event record by ID. Distinguish delivery from outcome; queued/accepted does not prove external completion.",
};
