import { normalizeCard } from "../../../contracts/card-migration.ts";
import { copy } from "../copy.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { parseCard } from "./card-validation.ts";
import { demoBase, FreshCards, MIN, SeedCards, SeedItems } from "./cards.ts";

/** Browser backup; local mode synchronizes it with the agent-readable repository. */
const DefaultPreferences: Record<string, any> = {
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
};
const DemoSources = [
	{
		id: "src-rss",
		kind: "rss",
		name: "RSS",
		detail: copy("web.store.8598b18bc27e"),
		enabled: true,
		status: "ok",
		count: 42,
		stack: true,
		open: "inside",
		range: "30d",
	},
	{
		id: "src-readwise",
		kind: "readwise",
		name: "Readwise",
		detail: copy("web.store.857b57e427b7"),
		enabled: true,
		status: "ok",
		count: 1204,
		stack: true,
		open: "inside",
		range: "30d",
	},
	{
		id: "src-mail",
		kind: "mail",
		name: copy("web.mail"),
		detail: copy("web.store.3499131624f8"),
		enabled: true,
		status: "attention",
		count: 0,
		stack: true,
		open: "inside",
		range: "30d",
	},
	{
		id: "src-calendar",
		kind: "calendar",
		name: copy("web.cards.a00f295cfbb0"),
		detail: copy("web.store.315384d82a44"),
		enabled: true,
		status: "ok",
		count: 3,
		stack: false,
		open: "inside",
		range: "30d",
	},
	{
		id: "src-linear",
		kind: "linear",
		name: "Linear",
		detail: copy("web.store.c4b693544d15"),
		enabled: false,
		status: "paused",
		count: 0,
		stack: true,
		open: "web",
		range: "30d",
	},
];
const Store: Record<string, any> = {
	key: "sill-v1",
	state: {},
	fresh() {
		return {
			cards: [],
			items: {},
			seconds: 0,
			demoStartedAt: demoBase,
			freshIds: [],
			preferences: { ...DefaultPreferences },
			sources: [],
			storageAvailable: true,
		};
	},
	sanitizeItem(x?: any) {
		const timestamp = (n?: any) => (Number.isFinite(n) && n > 0 && n < 8.64e15 ? n : 0);
		return {
			seen: !!x.seen,
			read: !!x.read,
			bookmarked: !!x.bookmarked,
			later: !!x.later,
			tagsEdited: !!x.tagsEdited,
			progress: Math.max(0, Math.min(1, Number(x.progress) || 0)),
			note: typeof x.note === "string" ? x.note.slice(0, 4000) : "",
			tags: Array.isArray(x.tags)
				? x.tags
						.filter((s?: any) => typeof s === "string")
						.map((s?: any) => s.slice(0, 30))
						.slice(0, 20)
				: [],
			taskDone: Array.isArray(x.taskDone)
				? x.taskDone.filter((s?: any) => typeof s === "string")
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
		let raw = null;
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
		if (valid) {
			if (Number.isFinite(raw.demoStartedAt) && raw.demoStartedAt > 0)
				this.state.demoStartedAt = raw.demoStartedAt;
			this.state.freshIds = Array.isArray(raw.freshIds)
				? [
						...new Set<any>(
							raw.freshIds.filter((id?: any) => FreshCards.some((c?: any) => c.id === id)),
						),
					]
				: [];
			this.state.seconds = Math.max(0, Math.min(1e7, Number(raw.seconds) || 0));
			const prefs =
				raw.preferences && typeof raw.preferences === "object"
					? raw.preferences
					: { reduceTransparency: raw.reduceTransparency, sort: raw.sort };
			for (const key of Object.keys(DefaultPreferences))
				if (prefs[key] !== undefined && typeof prefs[key] === typeof DefaultPreferences[key])
					this.state.preferences[key] = prefs[key];
			if (!FeedPolicy.sorts.includes(this.state.preferences.sort))
				this.state.preferences.sort = "priority";
		}
		const offset = this.state.demoStartedAt - demoBase;
		const shift = (card?: any) => {
			for (const key of ["time", "start", "end", "due"])
				if (Number.isFinite(card[key])) card[key] += offset;
			return card;
		};
		this.state.cards = [
			...this.state.freshIds.map((id?: any) => FreshCards.find((c?: any) => c.id === id)),
			...SeedCards,
		].map((c?: any) =>
			shift({
				...c,
				tasks: c.tasks?.map((t?: any) => ({ ...t })),
				files: c.files?.map((f?: any) => ({ ...f, time: f.time ? f.time + offset : undefined })),
			}),
		);
		if (valid && raw.version >= 3 && Array.isArray(raw.cards)) this.state.cards = raw.cards;
		this.state.cards = this.state.cards.map(normalizeCard);
		this.state.sources =
			valid && Array.isArray(raw.sources)
				? raw.sources
				: DemoSources.map((s?: any) => ({ ...s, syncedAt: this.state.demoStartedAt - 2 * MIN }));
		const items = valid
			? raw.items
			: Object.fromEntries(
					Object.entries(SeedItems).map(([id, x]: any) => [
						id,
						{ ...x, readAt: x.readAt ? x.readAt + offset : 0 },
					]),
				);
		// Live cards arrive after authentication; restore their browser-local notes too.
		const restored = window.__QG_RUNTIME__
			? Object.keys(items).map((id?: any) => ({ id }))
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
	item(id?: any) {
		const defaults: Record<string, any> = {
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
		return this.state.items[id];
	},
	card(id?: any) {
		return this.state.cards.find((c?: any) => c.id === id);
	},
	patch(id?: any, values?: any) {
		const item = this.item(id);
		if (values.read && !item.read && !values.readAt) values = { ...values, readAt: Date.now() };
		Object.assign(item, values);
		this.save();
	},
	pref(key?: any) {
		return this.state.preferences[key] ?? DefaultPreferences[key];
	},
	setPref(key?: any, value?: any) {
		this.state.preferences[key] = value;
		this.save();
	},
	tags(c?: any) {
		const s = this.item(c.id);
		return s.tagsEdited ? [...s.tags] : [...new Set<any>([...(c.tags || []), ...s.tags])];
	},
	tasks(c?: any) {
		const done = this.item(c.id).taskDone;
		return (c.tasks || []).map((t?: any) => ({ ...t, done: done ? done.includes(t.id) : t.done }));
	},
	insert(cards?: any) {
		cards = cards.map((card: any) => parseCard(normalizeCard(card)));
		const known = new Set<any>(this.state.cards.map((c?: any) => c.id));
		const additions = cards.filter((c?: any) => {
			if (known.has(c.id)) return false;
			known.add(c.id);
			return true;
		});
		this.state.cards = [...additions, ...this.state.cards];
		for (const c of additions) this.item(c.id).addedAt = c.time;
		this.state.freshIds = this.state.cards
			.filter((c?: any) => FreshCards.some((f?: any) => f.id === c.id))
			.map((c?: any) => c.id);
		this.save();
		return additions.length;
	},
	remove(ids?: any) {
		const set = new Set<any>(ids);
		this.state.cards = this.state.cards.filter((c?: any) => !set.has(c.id));
		for (const id of set) delete this.state.items[id];
		this.save();
	},
	source(id?: any) {
		return this.state.sources.find((s?: any) => s.id === id);
	},
	upsertSource(source?: any) {
		const at = this.state.sources.findIndex((s?: any) => s.id === source.id);
		if (at < 0) this.state.sources.push(source);
		else this.state.sources[at] = source;
		this.save();
	},
	removeSource(id?: any) {
		this.state.sources = this.state.sources.filter((s?: any) => s.id !== id);
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
			sources: this.state.sources,
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
	stats(since: any = 0) {
		const items = this.state.items,
			cards = this.state.cards;
		return {
			read: cards.filter(
				(c?: any) => items[c.id]?.read && (items[c.id].readAt || Date.now()) >= since,
			).length,
			saved: cards.filter((c?: any) => items[c.id]?.bookmarked).length,
			done: cards.filter((c?: any) => c.type === "task" && this.tasks(c).every((t?: any) => t.done))
				.length,
			overdue: cards.filter(
				(c?: any) =>
					c.type === "task" &&
					c.due &&
					c.due < Date.now() &&
					!this.tasks(c).every((t?: any) => t.done),
			),
		};
	},
};

export { DefaultPreferences, DemoSources, Store };
