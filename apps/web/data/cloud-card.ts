import type { Card } from "../../../contracts/card.ts";
import { markdownExcerpt } from "../atoms/markdown.ts";
import { sameData } from "./same-data.ts";

/** A cloud record: card facts plus server metadata and personal state. */
type CloudRecord = Card & { created_at?: string; updated_at?: string; state?: unknown };

/** Project cloud records into cards; nested values are copied, not shared. */
export function cloudCard(record: CloudRecord) {
	const card = structuredClone(record);
	card.summary ??= markdownExcerpt(card.body || "");
	if (card.time === undefined && typeof card.created_at === "string") {
		const time = Date.parse(card.created_at);
		if (Number.isFinite(time)) card.time = time;
	}
	return card;
}

const projections = new WeakMap<CloudRecord, ReturnType<typeof cloudCard>>();

/**
 * The page's card for one stored record. Records and the cards drawn from them are replaced,
 * never edited in place, so an unchanged record keeps the card object the feed already drew;
 * a save no longer copies and re-derives every card in the workspace.
 */
export function projectedCard(record: CloudRecord) {
	let card = projections.get(record);
	if (!card) {
		card = cloudCard(record);
		projections.set(record, card);
	}
	return card;
}

/** A save or poll answer keeps the previous object of every record whose data did not change. */
export function keepUnchanged<T extends { id: string }>(
	previous: Map<string, T>,
	records: T[],
): T[] {
	return records.map((record) => {
		const kept = previous.get(record.id);
		return kept && kept !== record && sameData(kept, record) ? kept : record;
	});
}

/**
 * The card as saved: fields the projection filled in and the page left unchanged are dropped.
 * A card the page did not replace is its record, so the save baseline shares that object.
 */
export function storedCard(card: Record<string, unknown>, record: CloudRecord) {
	const projected = projectedCard(record);
	if (card === projected) return record;
	const value = { ...card };
	for (const key of Object.keys(projected))
		if (!(key in record) && JSON.stringify(value[key]) === JSON.stringify(projected[key]))
			delete value[key];
	return value;
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
