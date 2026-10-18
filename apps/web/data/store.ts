import type { Card } from "../../../contracts/card.ts";
import { normalizeCard } from "../../../contracts/card-migration.ts";
import type { CardState, State } from "../../../contracts/local.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { parseCard } from "./card-validation.ts";
import { demoBase, FreshCards, SeedCards, SeedItems } from "./cards.ts";

/** Reuse contract fields while excluding its unknown extension-key signature. */
export type Preferences = Required<{
	[K in keyof State["preferences"] as string extends K ? never : K]: State["preferences"][K];
}>;
export type CardItem = CardState &
	Required<
		Pick<
			CardState,
			| "seen"
			| "read"
			| "bookmarked"
			| "later"
			| "progress"
			| "note"
			| "tags"
			| "snoozedUntil"
			| "dismissed"
			| "reminderDone"
			| "lastReminderKey"
			| "lastNotifiedAt"
			| "readAt"
			| "restoredAt"
		>
	>;
export type StoreState = {
	cards: Card[];
	items: Record<string, CardState>;
	seconds: number;
	demoStartedAt: number;
	freshIds: string[];
	preferences: Preferences;
	storageAvailable: boolean;
};
/** Existing load guards decide what legacy JSON can restore; this type adds no validation. */
type Backup = Partial<StoreState> & {
	version?: number;
	sources?: unknown;
	reduceTransparency?: boolean;
	sort?: Preferences["sort"];
};

/** Browser backup; local mode synchronizes it with the agent-readable repository. */
const DefaultPreferences: Preferences = {
	singleKeyShortcuts: true,
	reduceTransparency: false,
	sort: "priority",
	stack: true,
	fadeRead: true,
	archiveAfter: "7d",
	floatTimely: true,
	collapseOnFinish: true,
	newHint: "away",
	theme: "system",
	density: "standard",
	reduceMotion: false,
	aiLocal: true,
	onboarded: true,
	hiddenActions: [],
};
const Store = {
	key: "sill-v1",
	state: {} as StoreState,
	legacyFields: {} as Record<string, unknown>,
	fresh(): StoreState {
		return {
			cards: [],
			items: {},
			seconds: 0,
			demoStartedAt: demoBase,
			freshIds: [],
			preferences: { ...DefaultPreferences },
			storageAvailable: true,
		};
	},
	sanitizeItem(x?: Record<string, unknown>): CardItem {
		const timestamp = (n?: unknown) =>
			Number.isFinite(n) && (n as number) > 0 && (n as number) < 8.64e15 ? (n as number) : 0;
		return {
			seen: !!x.seen,
			read: !!x.read,
			archived: !!x.archived,
			bookmarked: !!x.bookmarked,
			later: !!x.later,
			tagsEdited: !!x.tagsEdited,
			progress: Math.max(0, Math.min(1, Number(x.progress) || 0)),
			note: typeof x.note === "string" ? x.note.slice(0, 4000) : "",
			tags: Array.isArray(x.tags)
				? x.tags
						.filter((s: unknown) => typeof s === "string")
						.map((s: string) => s.slice(0, 30))
						.slice(0, 20)
				: [],
			taskDone: Array.isArray(x.taskDone)
				? x.taskDone.filter((s: unknown) => typeof s === "string")
				: undefined,
			addedAt: timestamp(x.addedAt),
			snoozedUntil: timestamp(x.snoozedUntil),
			dismissed: !!x.dismissed,
			reminderDone: !!x.reminderDone,
			lastReminderKey: typeof x.lastReminderKey === "string" ? x.lastReminderKey.slice(0, 200) : "",
			lastNotifiedAt: timestamp(x.lastNotifiedAt),
			readAt: timestamp(x.readAt),
			restoredAt: timestamp(x.restoredAt),
		};
	},
	load() {
		this.state = this.fresh();
		let raw: Backup = null;
		try {
			// Copy once; preserve old backups and never replace newer Sill data.
			if (!localStorage.getItem("sill-storage-migrated")) {
				for (const suffix of ["v1", "live-v1", "unsynced", "sync-revision"]) {
					const value = localStorage.getItem("quiet-glass-" + suffix);
					if (value !== null && localStorage.getItem("sill-" + suffix) === null)
						localStorage.setItem("sill-" + suffix, value);
				}
				localStorage.setItem("sill-storage-migrated", "1");
			}
			raw = JSON.parse(localStorage.getItem(this.key) || "null");
		} catch {
			this.state.storageAvailable = false;
			try {
				raw = JSON.parse(
					localStorage.getItem(this.key) ||
						localStorage.getItem(this.key.replace(/^sill-/, "quiet-glass-")) ||
						"null",
				);
			} catch {}
		}
		const valid =
			raw &&
			[1, 2, 3, 4].includes(raw.version) &&
			raw.items &&
			typeof raw.items === "object" &&
			!Array.isArray(raw.items);
		// Keep retired connection metadata in backups without using it as product state.
		this.legacyFields = valid && Object.hasOwn(raw, "sources") ? { sources: raw.sources } : {};
		if (valid) {
			if (Number.isFinite(raw.demoStartedAt) && raw.demoStartedAt > 0)
				this.state.demoStartedAt = raw.demoStartedAt;
			this.state.freshIds = Array.isArray(raw.freshIds)
				? [...new Set<string>(raw.freshIds.filter((id) => FreshCards.some((c) => c.id === id)))]
				: [];
			this.state.seconds = Math.max(0, Math.min(1e7, Number(raw.seconds) || 0));
			const prefs =
				raw.preferences && typeof raw.preferences === "object"
					? raw.preferences
					: { reduceTransparency: raw.reduceTransparency, sort: raw.sort };
			for (const key of Object.keys(DefaultPreferences) as (keyof Preferences)[])
				if (prefs[key] !== undefined && typeof prefs[key] === typeof DefaultPreferences[key])
					(this.state.preferences as Record<string, unknown>)[key] = prefs[key];
			if (!FeedPolicy.sorts.includes(this.state.preferences.sort))
				this.state.preferences.sort = "priority";
		}
		const offset = this.state.demoStartedAt - demoBase;
		const shift = (card?: Card) => {
			for (const key of ["time", "start", "end", "due"] as const)
				if (Number.isFinite(card[key])) card[key] += offset;
			return card;
		};
		this.state.cards = [
			...this.state.freshIds.map((id) => FreshCards.find((c) => c.id === id)),
			...SeedCards,
		].map((c) =>
			shift({
				...c,
				tasks: c.tasks?.map((t) => ({ ...t })),
				files: c.files?.map((f) => ({ ...f, time: f.time ? f.time + offset : undefined })),
			}),
		);
		if (valid && raw.version >= 3 && Array.isArray(raw.cards)) this.state.cards = raw.cards;
		this.state.cards = this.state.cards.map(normalizeCard);
		const items = valid
			? raw.items
			: Object.fromEntries(
					Object.entries(SeedItems).map(([id, x]) => [
						id,
						{ ...x, readAt: x.readAt ? x.readAt + offset : 0 },
					]),
				);
		// Live cards arrive after authentication; restore their browser-local notes too.
		const restored: { id: string; time?: number }[] = window.__QG_RUNTIME__
			? Object.keys(items).map((id) => ({ id }))
			: this.state.cards;
		for (const c of restored) {
			const x = items[c.id];
			if (!x || typeof x !== "object" || Array.isArray(x)) continue;
			this.state.items[c.id] = this.sanitizeItem(x);
			if (this.state.freshIds.includes(c.id) && this.state.items[c.id].addedAt)
				c.time = this.state.items[c.id].addedAt;
		}
		this.save(); // Persist the demo clock even when there has been no interaction yet.
		return this.state;
	},
	item(id?: string): CardItem {
		const defaults: CardItem = {
			seen: false,
			read: false,
			bookmarked: false,
			later: false,
			progress: 0,
			note: "",
			tags: [],
			snoozedUntil: 0,
			dismissed: false,
			reminderDone: false,
			lastReminderKey: "",
			lastNotifiedAt: 0,
			readAt: 0,
			restoredAt: 0,
		};
		this.state.items[id] = { ...defaults, ...this.state.items[id] };
		return this.state.items[id] as CardItem;
	},
	card(id?: string): Card {
		return this.state.cards.find((c) => c.id === id);
	},
	patch(id?: string, values?: CardState) {
		const item = this.item(id);
		if (values.read && !item.read && !values.readAt) values = { ...values, readAt: Date.now() };
		Object.assign(item, values);
		this.save();
	},
	pref<K extends keyof Preferences>(key?: K): Preferences[K] {
		return this.state.preferences?.[key] ?? DefaultPreferences[key];
	},
	setPref<K extends keyof Preferences>(key?: K, value?: Preferences[K]) {
		this.state.preferences[key] = value;
		this.save();
	},
	tags(c?: Card): string[] {
		const s = this.item(c.id);
		return s.tagsEdited ? [...s.tags] : [...new Set<string>([...(c.tags || []), ...s.tags])];
	},
	tasks(c?: Card): NonNullable<Card["tasks"]> {
		const done = this.item(c.id).taskDone;
		return (c.tasks || []).map((t) => ({ ...t, done: done ? done.includes(t.id) : t.done }));
	},
	insert(cards?: unknown[]) {
		cards = cards.map((card) => parseCard(normalizeCard(card as Card)));
		const known = new Set<string>(this.state.cards.map((c) => c.id));
		const additions = (cards as Card[]).filter((c) => {
			if (known.has(c.id)) return false;
			known.add(c.id);
			return true;
		});
		this.state.cards = [...additions, ...this.state.cards];
		for (const c of additions) this.item(c.id).addedAt = c.time;
		this.state.freshIds = this.state.cards
			.filter((c) => FreshCards.some((f) => f.id === c.id))
			.map((c) => c.id);
		this.save();
		return additions.length;
	},
	remove(ids?: Iterable<string>) {
		const set = new Set<string>(ids);
		this.state.cards = this.state.cards.filter((c) => !set.has(c.id));
		for (const id of set) delete this.state.items[id];
		this.save();
	},
	serialized() {
		return {
			version: 4,
			cards: this.state.cards,
			items: this.state.items,
			seconds: this.state.seconds,
			demoStartedAt: this.state.demoStartedAt,
			freshIds: this.state.freshIds,
			preferences: this.state.preferences,
			...this.legacyFields,
		};
	},
	bytes() {
		try {
			return new Blob([JSON.stringify(this.serialized())]).size;
		} catch {
			return 0;
		}
	},
	save() {
		try {
			localStorage.setItem(this.key, JSON.stringify(this.serialized()));
		} catch {
			this.state.storageAvailable = false;
		}
	},
	stats(since = 0) {
		const items = this.state.items,
			cards = this.state.cards;
		return {
			read: cards.filter((c) => items[c.id]?.read && (items[c.id].readAt || Date.now()) >= since)
				.length,
			saved: cards.filter((c) => items[c.id]?.bookmarked).length,
			done: cards.filter((c) => c.type === "task" && this.tasks(c).every((t) => t.done)).length,
			overdue: cards.filter(
				(c) =>
					c.type === "task" && c.due && c.due < Date.now() && !this.tasks(c).every((t) => t.done),
			),
		};
	},
};

export { DefaultPreferences, Store };
