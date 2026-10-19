import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod/v4";
import { Card, normalizeCard, sourceKinds, cardTypes as types } from "../../contracts/card.ts";
import { Batch, CardState, Preferences, State } from "../../contracts/local.ts";
import { copy } from "../../design-system/copy.ts";
export const capabilities = {
	operations: ["card.upsert", "card.delete", "item.patch", "preferences.patch", "reading.add"],
	cardFields: Object.keys(Card.shape),
	itemFields: Object.keys(CardState.shape),
	preferences: Object.keys(Preferences.shape),
	types,
	sourceKinds,
	navigation: `GET /api/local/open?id=<card-id>${copy("server.repository.381476892d53")}`,
	synchronization: copy("server.repository.5d15c394f876"),
	examples: [
		{
			op: "card.upsert",
			card: {
				id: "my-note",
				type: "note",
				title: copy("server.repository.443cbad36d77"),
				body: [copy("web.body")],
				url: "https://example.com",
			},
		},
		{
			op: "item.patch",
			id: "my-note",
			values: {
				bookmarked: true,
				note: copy("server.repository.daede9881787"),
				tags: [copy("server.repository.bc62d1b6b936")],
				tagsEdited: true,
			},
		},
		{ op: "preferences.patch", values: { sort: "time" } },
	],
};
function conflict(message?: any) {
	throw Object.assign(new Error(message), { status: 409 });
}
function compare(target?: any, values?: any, before?: any) {
	if (!before) return;
	for (const key of Object.keys(values))
		if (JSON.stringify(target[key]) !== JSON.stringify(before[key])) conflict("field_conflict");
}
export class LocalRepository {
	declare file: any;
	declare value: any;

	constructor(file?: any) {
		this.file = file;
		this.value = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
		if (this.value?.state?.cards)
			this.value.state.cards = this.value.state.cards.map(normalizeCard);
		if (this.value) {
			State.parse(this.value.state);
			z.number().int().nonnegative().parse(this.value.revision);
		}
	}
	initialize(state?: any) {
		if (this.value) return this.snapshot();
		const parsed = State.parse({ ...state, cards: state.cards?.map(normalizeCard) });
		if (new Set<any>(parsed.cards.map((card?: any) => card.id)).size !== parsed.cards.length)
			throw new Error("duplicate_card_id");
		for (const key of Object.keys(parsed.items))
			if (!parsed.cards.some((card?: any) => card.id === key)) delete parsed.items[key];
		this.commit(parsed);
		return this.snapshot();
	}
	snapshot() {
		return this.value ? structuredClone(this.value) : { revision: 0, state: null };
	}
	commit(state?: any) {
		const value = { revision: (this.value?.revision || 0) + 1, state };
		mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
		writeFileSync(this.file + ".tmp", JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
		renameSync(this.file + ".tmp", this.file);
		this.value = value;
	}
	apply(input?: any) {
		const { operations, expectedRevision } = Batch.parse(input);
		for (const operation of operations) {
			if (operation.op === "card.upsert") operation.card = normalizeCard(operation.card);
			if ((operation.op === "card.upsert" || operation.op === "card.delete") && operation.before)
				operation.before = normalizeCard(operation.before);
		}
		if (expectedRevision !== undefined && expectedRevision !== (this.value?.revision || 0))
			conflict("revision_conflict");
		const state = this.value
			? structuredClone(this.value.state)
			: {
					cards: [],
					items: {},
					seconds: 0,
					preferences: { sort: "priority" },
				};
		for (const operation of operations) {
			const operationId =
				operation.op === "card.upsert"
					? operation.card.id
					: "id" in operation
						? operation.id
						: undefined;
			const index = state.cards.findIndex((card?: any) => card.id === operationId);
			if (
				(operation.op === "card.upsert" || operation.op === "card.delete") &&
				operation.before !== undefined &&
				!isDeepStrictEqual(state.cards[index] ?? null, operation.before)
			)
				conflict("card_conflict");
			if (operation.op === "card.upsert") {
				if (index < 0) state.cards.unshift(operation.card);
				else state.cards[index] = operation.card;
			} else if (operation.op === "card.delete") {
				if (index < 0) throw new Error("not_found");
				state.cards.splice(index, 1);
				delete state.items[operation.id];
			} else if (operation.op === "item.patch") {
				if (index < 0) throw new Error("not_found");
				if (
					operation.values.taskDone?.some(
						(key?: any) => !state.cards[index].tasks?.some((task?: any) => task.id === key),
					)
				)
					throw new Error("task_not_found");
				const item = state.items[operation.id] || {};
				compare(item, operation.values, operation.before);
				state.items[operation.id] = { ...item, ...operation.values };
			} else if (operation.op === "preferences.patch") {
				compare(state.preferences, operation.values, operation.before);
				Object.assign(state.preferences, operation.values);
			} else state.seconds = Math.min(1e7, state.seconds + operation.seconds);
		}
		State.parse(state);
		if (JSON.stringify(state) !== JSON.stringify(this.value?.state)) this.commit(state);
		return this.snapshot();
	}
}
