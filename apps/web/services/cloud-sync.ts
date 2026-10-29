import { sameData } from "../data/same-data.ts";

/** Cloud saves share the same conditional batch as MCP. Private drafts stay in memory. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const equal = sameData;
export function itemDefaults(card: any) {
	return {
		seen: false,
		read: false,
		bookmarked: false,
		later: false,
		playbackPosition: 0,
		progress: 0,
		note: "",
		addedAt: 0,
		snoozedUntil: 0,
		dismissed: false,
		reminderDone: false,
		lastReminderKey: "",
		lastNotifiedAt: 0,
		readAt: 0,
		restoredAt: 0,
		done: false,
		archived: false,
		lessLike: false,
		taskDone: [],
	};
}
export function workspaceDiff(before: any, next: any) {
	const operations: any[] = [];
	const old = new Map<string, any>(before.cards.map((card: any) => [card.id, card]));
	const ids = new Set(next.cards.map((card: any) => card.id));
	for (const card of next.cards.slice().reverse()) {
		if (!equal(old.get(card.id), card)) {
			const data = { ...card };
			for (const key of [
				"state",
				"revision",
				"created_at",
				"updated_at",
				"deleted",
				"owner_id",
				"change_version",
			])
				delete data[key];
			operations.push({ op: "card.upsert", card: data, before: old.get(card.id) || null });
		}
	}
	for (const [id, card] of old)
		if (!ids.has(id)) operations.push({ op: "card.delete", id, before: card });
	for (const card of next.cards) {
		const values: any = {},
			previous: any = {};
		const original = before.items[card.id] || itemDefaults(card);
		for (const [key, value] of Object.entries(next.items[card.id] || {})) {
			if (!equal(value, original[key])) {
				values[key] = value;
				if (original[key] !== undefined) previous[key] = original[key];
			}
		}
		if (Object.keys(values).length)
			operations.push({ op: "item.patch", id: card.id, values, before: previous });
	}
	const values: any = {},
		previous: any = {};
	for (const [key, value] of Object.entries(next.preferences))
		if (!equal(value, before.preferences[key])) {
			values[key] = value;
			if (before.preferences[key] !== undefined) previous[key] = before.preferences[key];
		}
	if (Object.keys(values).length)
		operations.push({ op: "preferences.patch", values, before: previous });
	if (next.seconds > before.seconds)
		operations.push({ op: "reading.add", seconds: next.seconds - before.seconds });
	return operations;
}
export class CloudSync {
	baseline: any = null;
	revision = 0;
	owner: string | null = null;
	pending: any[] = [];
	busy = false;
	failed: any = null;
	suspended = false;
	scheduled = false;
	epoch = 0;
	running: Promise<void> | null = null;
	options: {
		snapshot: () => any;
		adopt: (value: any) => void;
		request: (body: any, key: string, owner: string) => Promise<any>;
		owner: () => string | null;
		canSave: () => boolean;
		status: () => void;
		failure: (error: any) => void;
	};
	constructor(options: CloudSync["options"]) {
		this.options = options;
	}
	rebase(state: any, revision: number, owner: string | null = this.options.owner()) {
		this.owner = owner;
		this.baseline = clone(state);
		this.revision = revision;
	}
	resume(owner: string) {
		if (!owner || owner !== this.owner) return null;
		const state = clone(this.baseline);
		this.suspended = false;
		return state;
	}
	reset() {
		this.epoch++;
		this.baseline = null;
		this.owner = null;
		this.pending = [];
		this.failed = null;
		this.suspended = false;
		this.busy = false;
		this.running = null;
	}
	capture() {
		if (!this.baseline || this.suspended) return;
		// One user gesture may patch many cards synchronously: it must be one transaction.
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => {
			this.scheduled = false;
			this.collect();
			if (!this.failed) void this.flush();
		});
	}
	collect() {
		if (!this.baseline || this.suspended) return;
		const next = this.options.snapshot();
		const operations = workspaceDiff(this.baseline, next);
		if (operations.length) this.baseline = clone(next);
		if (operations.length) {
			this.pending.push({
				body: { operations: clone(operations) },
				key: crypto.randomUUID(),
				owner: this.owner,
			});
			this.options.status();
		}
	}
	async flush() {
		if (this.running) return this.running;
		if (this.suspended || !this.options.canSave()) return;
		this.collect();
		if (!this.pending.length) return;
		const epoch = this.epoch;
		this.busy = true;
		this.running = (async () => {
			try {
				while (this.pending.length && !this.suspended && this.options.canSave()) {
					const batch = this.pending[0];
					const value = await this.options.request(batch.body, batch.key, batch.owner);
					if (this.epoch !== epoch) return;
					this.collect();
					this.pending.shift();
					this.revision = value.revision;
					if (!this.pending.length) this.options.adopt(value);
				}
				this.failed = null;
			} catch (error) {
				if (this.epoch !== epoch) return;
				this.failed = error;
				this.options.failure(error);
			} finally {
				if (this.epoch === epoch) {
					this.busy = false;
					this.running = null;
					this.options.status();
				}
			}
		})();
		await this.running;
	}
}
