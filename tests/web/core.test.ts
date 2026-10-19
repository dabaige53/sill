import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { buildSync } from "esbuild";

const root = path.resolve(import.meta.dirname, "../..");
const bundle = buildSync({
	stdin: {
		contents:
			"export {FeedPolicy} from './apps/web/services/feed-policy.ts'; export {Store} from './apps/web/data/store.ts'; export {AppController} from './apps/web/views/app.ts'; export {SeedCards,FreshCards} from './apps/web/data/cards.ts';",
		resolveDir: root,
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SillCore",
}).outputFiles[0].text;
function fixture(raw: any = null, at: any = 1800000000000) {
	let now = at;
	const data = new Map<any, any>(
		raw === null ? [] : [["sill-v1", typeof raw === "string" ? raw : JSON.stringify(raw)]],
	);
	const nodes = new Map<any, any>();
	const context = vm.createContext({
		Date: class extends Date {
			constructor(...args: any[]) {
				super(...((args.length ? args : [now]) as [any]));
			}
			static now() {
				return now;
			}
		},
		localStorage: {
			getItem: (k?: any) => data.get(k) || null,
			setItem: (k?: any, v?: any) => data.set(k, v),
		},
		structuredClone,
		queueMicrotask,
		matchMedia: () => ({ matches: false }),
		window: { scrollTo() {} },
		CSS: { escape: (value?: any) => String(value) },
		document: {
			documentElement: { dataset: { inputModality: "keyboard" } },
			getElementById(id?: any) {
				if (!nodes.has(id))
					nodes.set(id, {
						dataset: {},
						focus() {},
						setAttribute(k?: any, v?: any) {
							this[k] = v;
						},
					});
				return nodes.get(id);
			},
		},
		icon: () => "",
		history: { replaceState() {} },
	});
	vm.runInContext(bundle + "\nthis.api=SillCore;", context);
	const api = context.api;
	api.Store.load();
	const app = new api.AppController();
	app.dialog = { open: false };
	app.replacePanelContent = (html: string) => {
		app.dialog.innerHTML = html;
	};
	app.drag = { active: null };
	app.grid = { querySelector: () => null };
	app.renders = 0;
	// This fixture checks state policy; actual card geometry is covered by home-tabs-browser.
	app.refreshCard = () => {
		app.renders++;
	};
	app.withFeedAnchor = (fn?: any) => {
		fn();
		app.renders++;
	};
	app.toast = (message?: any, undo?: any) => {
		app.lastToast = message;
		app.undoAction = undo;
	};
	return { ...api, app, context, data, nodes, now: () => now, advance: (ms?: any) => (now += ms) };
}
const ids = (cards?: any) => Array.from(cards, (c?: any) => c.id);

test("v1 state migrates without losing independent reading, tags, tasks or notes", () => {
	const { Store, data } = fixture({
		version: 1,
		items: {
			"article-01": {
				seen: true,
				read: false,
				progress: 0.4,
				bookmarked: true,
				tagsEdited: true,
				tags: ["自定义"],
				note: "保留备注",
			},
			"task-01": { taskDone: ["t2"] },
		},
		seconds: 42,
	});
	assert.equal(Store.item("article-01").progress, 0.4);
	assert.equal(Store.item("article-01").read, false);
	assert.deepEqual(Array.from(Store.tags(Store.card("article-01"))), ["自定义"]);
	assert.equal(Store.item("article-01").note, "保留备注");
	assert.equal(Store.item("article-01").bookmarked, true);
	assert.deepEqual(
		Array.from(
			Store.tasks(Store.card("task-01")).filter((t?: any) => t.done),
			(t?: any) => t.id,
		),
		["t2"],
	);
	assert.equal(Store.state.seconds, 42);
	assert.equal(JSON.parse(data.get(Store.key)).version, 4);
});
test("reload preserves the original demo clock, snooze deadline and ordering preference", () => {
	const f = fixture(),
		due = f.Store.card("reminder-01").due;
	f.app.changeReminder("reminder-01", "snooze");
	f.Store.state.preferences.sort = "time";
	f.Store.save();
	const g = fixture(f.data.get(f.Store.key), f.now() + 300000);
	assert.equal(g.Store.card("reminder-01").due, due);
	assert.equal(g.Store.item("reminder-01").snoozedUntil, f.now() + 600000);
	assert.equal(g.Store.state.preferences.sort, "time");
});
test("storage corruption and unavailable storage leave the demo usable", () => {
	const f = fixture("{");
	assert.equal(f.Store.state.cards.length, f.SeedCards.length);
	f.context.localStorage.setItem = () => {
		throw Error("denied");
	};
	f.Store.patch("article-01", { bookmarked: true });
	assert.equal(f.Store.state.storageAvailable, false);
	assert.equal(f.Store.item("article-01").bookmarked, true);
});
test("malformed persisted fields are bounded and unknown card IDs are discarded", () => {
	const f = fixture({
			version: 2,
			items: {
				"reminder-01": {
					snoozedUntil: "tomorrow",
					lastNotifiedAt: Infinity,
					note: 1,
					tags: [1, "safe"],
					progress: -3,
				},
				unknown: { read: true },
			},
			sort: "invalid",
			freshIds: ["missing", "fresh-note", "fresh-note"],
		}),
		{ Store } = f;
	const s = Store.item("reminder-01");
	assert.equal(s.snoozedUntil, 0);
	assert.equal(s.progress, 0);
	assert.equal(s.note, "");
	assert.deepEqual(Array.from(s.tags), ["safe"]);
	assert.equal(Store.state.items.unknown, undefined);
	assert.equal(Store.state.preferences.sort, "priority");
	assert.equal(Store.state.cards.length, f.SeedCards.length + 1);
});
test("repeated load resets removed flags rather than retaining stale in-memory state", () => {
	const { Store, data } = fixture();
	Store.patch("article-01", { bookmarked: true });
	data.clear();
	Store.load();
	assert.equal(Store.item("article-01").bookmarked, false);
});
test("refresh insertion deduplicates IDs and restores new-card flags and timestamps", () => {
	const f = fixture(),
		card: Record<string, any> = { ...f.FreshCards[0], time: f.now() + 120000 };
	assert.equal(f.Store.insert([card, card]), 1);
	assert.equal(f.Store.insert([card]), 0);
	f.Store.patch(card.id, { bookmarked: true });
	const g = fixture(f.data.get(f.Store.key), f.now() + 600000);
	assert.equal(g.Store.state.cards.length, g.SeedCards.length + 1);
	assert.equal(g.Store.card(card.id).time, card.time);
	assert.equal(g.Store.item(card.id).bookmarked, true);
});
test("home retains read, completed and old cards for every legacy age preference", () => {
	const { FeedPolicy: p, now } = fixture();
	const old = now() - 365 * 86400000;
	for (const type of ["article", "media", "note", "mail", "task", "event", "reminder"]) {
		const c = { id: type, type, time: old, tasks: [{ id: "step", done: true }] };
		for (const pref of ["3d", "7d", "never"]) {
			for (const state of [
				{},
				{ read: true, readAt: old },
				{ reminderDone: true },
				{ taskDone: ["step"] },
				{ dismissed: true },
				{ snoozedUntil: now() + 60000 },
			]) {
				assert.equal(p.shelf(c, state, now(), pref), "desk");
				assert.equal(p.visible(c, state), true);
				assert.equal(p.shelf(c, { ...state, archived: true }, now(), pref), "read");
			}
		}
	}
});
test("only explicit archive removes cards from home, without rewriting existing flags", () => {
	const f = fixture();
	f.Store.patch("article-01", { read: true, readAt: f.now() - 30 * 86400000 });
	f.Store.patch("reminder-01", { reminderDone: true, dismissed: true });
	f.Store.patch("task-01", { taskDone: f.Store.card("task-01").tasks.map((t: any) => t.id) });
	for (const id of ["article-01", "reminder-01", "task-01"]) {
		assert.ok(ids(f.app.filtered()).includes(id));
	}
	f.Store.patch("article-01", { archived: true });
	assert.ok(!ids(f.app.filtered()).includes("article-01"));
	const g = fixture(f.data.get(f.Store.key), f.now() + 365 * 86400000);
	assert.ok(!ids(g.app.filtered()).includes("article-01"));
	assert.ok(ids(g.app.filtered()).includes("reminder-01"));
	assert.ok(ids(g.app.filtered()).includes("task-01"));
	assert.equal(g.Store.item("reminder-01").dismissed, true);
	assert.equal(g.Store.item("reminder-01").archived, false);
	g.app.filter.status = "done";
	assert.ok(ids(g.app.filtered()).includes("task-01"));
	g.app.filter.status = "all";
	g.app.filter.query = g.Store.card("article-01").title;
	assert.ok(ids(g.app.filtered()).includes("article-01"));
	assert.ok(ids(g.app.searchAll(g.Store.card("reminder-01").title).desk).includes("reminder-01"));
});
test("explicit restore keeps reading state and undo restores the archive flag", () => {
	const f = fixture();
	f.Store.patch("article-01", { archived: true, read: true, progress: 1, bookmarked: true });
	f.app.editId = "read";
	f.app.action("restore-card", "article-01");
	assert.equal(f.Store.item("article-01").archived, false);
	assert.equal(f.Store.item("article-01").read, true);
	assert.equal(f.Store.item("article-01").progress, 1);
	assert.equal(f.Store.item("article-01").bookmarked, true);
	assert.ok(ids(f.app.filtered()).includes("article-01"));
	f.app.undoAction();
	assert.equal(f.Store.item("article-01").archived, true);
	assert.ok(!ids(f.app.filtered()).includes("article-01"));
});
test("snooze, dismissal, completion and archive suppress notifications independently of home", () => {
	const { FeedPolicy: p, now } = fixture();
	const c = { id: "r", type: "reminder", due: now() - 1 };
	for (const state of [
		{ snoozedUntil: now() + 60000 },
		{ dismissed: true },
		{ reminderDone: true },
		{ archived: true },
	]) {
		assert.equal(p.eligible(c, state, now()), false);
	}
});
test("priority, unread and time sorts are stable, immutable and deduplicated", () => {
	const { FeedPolicy: p, now } = fixture();
	const cards = [
		{ id: "a", type: "article", time: 3 },
		{ id: "b", type: "reminder", due: now() - 1, time: 1 },
		{ id: "c", type: "article", time: 2 },
	];
	assert.deepEqual(ids(p.sort(cards, "priority", {}, now())), ["b", "a", "c"]);
	assert.deepEqual(ids(p.sort(cards, "unread", { a: { read: true } }, now())), ["b", "c", "a"]);
	assert.deepEqual(ids(p.sort(cards, "time", {}, now())), ["a", "c", "b"]);
	assert.deepEqual(ids(cards), ["a", "b", "c"]);
	assert.equal(p.sort([...cards, cards[0]], "priority", {}, now()).length, 3);
});
test("event and task notification thresholds exclude ended and completed work", () => {
	const { FeedPolicy: p, now } = fixture(),
		n = now();
	const event: Record<string, any> = {
		id: "e",
		type: "event",
		start: n + 15 * 60000,
		end: n + 30 * 60000,
	};
	assert.equal(p.eligible(event, {}, n), true);
	assert.equal(p.eligible(event, {}, n - 1), false);
	assert.equal(p.eligible(event, {}, event.end), false);
	const task: Record<string, any> = {
		id: "t",
		type: "task",
		due: n + 30 * 60000,
		tasks: [{ id: "1", done: false }],
	};
	assert.equal(p.eligible(task, {}, n), true);
	assert.equal(p.eligible(task, { taskDone: ["1"] }, n), false);
	assert.equal(p.eligible({ ...task, due: undefined }, {}, n), false);
});
test("one occurrence is not delivered twice; cooldown gates a changed occurrence", () => {
	const { FeedPolicy: p, now } = fixture(),
		c: Record<string, any> = { id: "r", type: "reminder", due: now() - 100 };
	assert.equal(p.eligible(c, { lastReminderKey: p.key(c) }, now()), false);
	assert.equal(
		p.eligible(c, { lastReminderKey: "old", lastNotifiedAt: now() - 59999 }, now()),
		false,
	);
	assert.equal(
		p.eligible(c, { lastReminderKey: "old", lastNotifiedAt: now() - 60000 }, now()),
		true,
	);
});
test("snooze stays on home while notification confirmation survives reload", () => {
	const f = fixture();
	f.app.changeReminder("reminder-01", "snooze");
	assert.equal(
		f.app.filtered().some((c?: any) => c.id === "reminder-01"),
		true,
	);
	f.advance(600001);
	f.app.checkReminders();
	f.app.checkReminders();
	assert.equal(f.app.pendingReminders.filter((id?: any) => id === "reminder-01").length, 1);
	assert.equal(
		f.app.filtered().some((c?: any) => c.id === "reminder-01"),
		true,
	);
	const g = fixture(f.data.get(f.Store.key), f.now());
	g.app.checkReminders();
	assert.equal(g.app.pendingReminders.includes("reminder-01"), true);
	g.app.showNew();
	assert.equal(
		g.app.filtered().some((c?: any) => c.id === "reminder-01"),
		true,
	);
	g.app.checkReminders();
	assert.equal(g.app.pendingReminders.includes("reminder-01"), false);
	const h = fixture(g.data.get(g.Store.key), g.now() + 60000);
	h.app.checkReminders();
	assert.equal(h.app.pendingReminders.includes("reminder-01"), false);
});
test("timer queues reminders without rendering, reordering or changing read state", () => {
	const f = fixture(),
		before = ids(f.app.filtered());
	f.advance(600001);
	f.app.checkReminders();
	assert.equal(f.app.renders, 0);
	assert.deepEqual(ids(f.app.filtered()), before);
	assert.equal(f.Store.item("reminder-01").read, false);
	assert.equal(f.Store.item("reminder-01").seen, false);
});
test("reading or dragging prevents pending content insertion", () => {
	const f = fixture();
	f.advance(600001);
	f.app.checkReminders();
	f.app.dialog.open = true;
	f.app.showNew();
	assert.equal(f.app.renders, 0);
	f.app.dialog.open = false;
	f.app.drag.active = {};
	f.app.showNew();
	assert.equal(f.app.renders, 0);
});
test("dismiss, complete, restore and undo preserve unrelated content state", () => {
	const f = fixture(),
		id = "reminder-01";
	f.Store.patch(id, { bookmarked: true, note: "保留" });
	for (const action of ["dismiss-reminder", "complete-reminder"]) {
		f.app.changeReminder(id, action);
		assert.equal(
			f.app.filtered().some((c?: any) => c.id === id),
			true,
		);
		f.app.filter.status = action === "dismiss-reminder" ? "dismissed" : "done";
		assert.equal(
			f.app.filtered().some((c?: any) => c.id === id),
			true,
		);
		f.app.filter.status = "all";
		f.app.undoAction();
		assert.equal(
			f.app.filtered().some((c?: any) => c.id === id),
			true,
		);
	}
	f.app.changeReminder(id, "snooze");
	f.app.changeReminder(id, "restore-reminder");
	assert.equal(
		f.app.filtered().some((c?: any) => c.id === id),
		true,
	);
	assert.equal(f.Store.item(id).bookmarked, true);
	assert.equal(f.Store.item(id).note, "保留");
	assert.equal(f.Store.item(id).read, false);
});
test("snoozed and dismissed views compose with type, tag and search filters", () => {
	const f = fixture();
	f.app.changeReminder("reminder-01", "snooze");
	f.app.filter = { type: "reminder", status: "snoozed", tag: "生活", query: "空档" };
	assert.deepEqual(ids(f.app.filtered()), ["reminder-01"]);
	f.app.filter.query = "不存在";
	assert.deepEqual(ids(f.app.filtered()), []);
});
test("explicit pending confirmation respects current filters and never duplicates cards", () => {
	const f = fixture();
	f.advance(600001);
	f.app.checkReminders();
	f.app.pendingCards = [f.FreshCards[0], f.FreshCards[0]];
	f.app.filter.type = "mail";
	f.app.showNew();
	assert.equal(f.Store.state.cards.length, f.SeedCards.length + 1);
	assert.equal(
		f.app.filtered().every((c?: any) => c.type === "mail"),
		true,
	);
	f.app.checkReminders();
	assert.equal(f.app.pendingReminders.length, 0);
});

test("duplicate popstate/hashchange does not close a newly opened local panel", () => {
	const f = fixture();
	f.context.location = { hash: "#feed" };
	let closes = 0;
	f.app.closeNative = () => closes++;
	f.app.modalKind = "preview";
	f.app.route();
	assert.equal(closes, 1);
	f.app.route();
	assert.equal(closes, 1);
	f.app.route(true);
	assert.equal(closes, 2);
	f.app.modalKind = "editor";
	f.app.route(true);
	assert.equal(closes, 2);
});

test("the settings button opens settings directly; there is no expanding entrance", () => {
	const f = fixture();
	f.context.matchMedia = () => ({ matches: false });
	const opened: string[] = [];
	f.app.openPanel = (kind: string) => opened.push(kind);
	f.app.action("settings", "", "", null, { pointerType: "touch" });
	f.app.action("settings", "", "", null, { pointerType: "mouse" });
	assert.deepEqual(opened, ["settings", "settings"]);
	assert.equal(typeof f.app.openDock, "undefined");
	f.app.action("orb", "", "", null, { pointerType: "touch" });
	assert.deepEqual(opened, ["settings", "settings"]);
});

test("Sill rename copies old cards and drafts once without replacing newer data", () => {
	const f = fixture();
	f.data.clear();
	const raw = JSON.stringify({ version: 4, cards: [], items: {}, seconds: 37, preferences: {} });
	f.data.set("quiet-glass-v1", raw);
	f.data.set("quiet-glass-unsynced", "saved-draft");
	f.Store.load();
	assert.equal(f.Store.state.seconds, 37);
	assert.equal(f.data.get("sill-unsynced"), "saved-draft");
	assert.equal(f.data.get("quiet-glass-v1"), raw);
	f.data.delete("sill-unsynced");
	f.Store.load();
	assert.equal(f.data.has("sill-unsynced"), false);
	f.data.delete("sill-storage-migrated");
	f.data.set("sill-unsynced", "new-draft");
	f.Store.load();
	assert.equal(f.data.get("sill-unsynced"), "new-draft");
});
