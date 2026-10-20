import type { Card } from "../../../contracts/card.ts";
import { normalizeCard } from "../../../contracts/card-migration.ts";

/** Project cloud records without dropping fields added by agents or future clients. */
export function cloudCard(record: Card) {
	const card = normalizeCard(record);
	card.summary ??= card.body?.[0] || "";
	if (card.time === undefined && typeof card.updated_at === "string") {
		const time = Date.parse(card.updated_at);
		if (Number.isFinite(time)) card.time = time;
	}
	return card;
}

export function cloudCardState(record: Card) {
	const state = record.state as { read?: boolean; done?: boolean } | undefined;
	return {
		read: !!state?.read,
		reminderDone: record.type === "reminder" && !!state?.done,
		...(record.type === "task" && state?.done
			? { taskDone: (record.tasks || []).map((task) => task.id) }
			: {}),
	};
}

/** The editor owns only these fields; omitted fields remain owned by the stored record. */
export function cloudCardChanges(
	record: Card,
	values: { title: string; body: string; read: boolean },
) {
	const changes: Record<string, unknown> = {};
	const title = values.title.trim();
	if (!record.id || title !== record.title) changes.title = title;
	if (!record.id || values.body !== (record.body || []).join("\n"))
		changes.body = values.body ? values.body.split("\n") : [];
	const state = record.state as { read?: boolean } | undefined;
	if (!record.id || values.read !== !!state?.read) changes.state = { read: values.read };
	return changes;
}
