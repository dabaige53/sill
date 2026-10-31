import type { Card } from "../../../contracts/card.ts";
import { markdownBlocks } from "../atoms/markdown.ts";

/** A cloud record: card facts plus server metadata and personal state. */
type CloudRecord = Card & { created_at?: string; updated_at?: string; state?: unknown };

/** Project cloud records into cards; nested values are copied, not shared. */
export function cloudCard(record: CloudRecord) {
	const card = structuredClone(record);
	card.summary ??= markdownBlocks(card.body || "")[0] || "";
	if (card.time === undefined && typeof card.created_at === "string") {
		const time = Date.parse(card.created_at);
		if (Number.isFinite(time)) card.time = time;
	}
	return card;
}

/** The editor owns only these fields; omitted fields remain owned by the stored record. */
export function cloudCardChanges(
	record: CloudRecord,
	values: { title: string; body: string; read: boolean },
) {
	const changes: Record<string, unknown> = {};
	const title = values.title.trim();
	if (!record.id || title !== record.title) changes.title = title;
	if (!record.id || values.body !== (record.body || "")) changes.body = values.body;
	const state = record.state as { read?: boolean } | undefined;
	if (!record.id || values.read !== !!state?.read) changes.state = { read: values.read };
	return changes;
}
