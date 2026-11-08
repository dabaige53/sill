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
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
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
			head: { appendChild() {} },
			createElement: () => ({ appendChild() {}, style: {} }),
			createTextNode: (text: string) => text,
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
	app.toast = (message?: any) => {
		app.lastToast = message;
	};
	return { ...api, app, context, data, nodes, now: () => now, advance: (ms?: any) => (now += ms) };
}
const ids = (cards?: any) => Array.from(cards, (c?: any) => c.id);

// @wu-test type=behavior | scope=FeedPolicy home visibility | protects=Keep cards on home until explicitly archived
test("home retains read, completed and old cards for every legacy age preference", () => {
	const { FeedPolicy: p, now } = fixture();
	const old = now() - 365 * 86400000;
	for (const type of ["article", "media", "note", "mail", "task", "event", "reminder"]) {
		const c = { id: type, type, time: old, tasks: [{ id: "step", text: "Step" }] };
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
// @wu-test type=behavior | scope=home archive behavior | protects=Remove only explicitly archived cards while preserving other state
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
});
// @wu-test type=behavior | scope=feed order | protects=Keep the current order after completion until an explicit refresh
test("completed tasks and reminders keep their order until a user refresh", () => {
	const f = fixture();
	const task = { ...f.Store.card("task-01"), due: f.now() - 1, priority: 10, time: f.now() - 2000 };
	const reminder = {
		...f.Store.card("reminder-01"),
		due: f.now() - 1,
		priority: 5,
		time: f.now() - 1000,
	};
	const article = { ...f.Store.card("article-01"), priority: 0 };
	f.Store.state.cards = [article, task, reminder];
	f.Store.state.items = {};
	const before = ids(f.app.filtered());
	assert.deepEqual(before, [task.id, reminder.id, article.id]);
	for (const row of f.Store.tasks(task).filter((row) => !row.done))
		f.app.toggleTask(task.id, row.id);
	f.app.changeReminder(reminder.id, "complete-reminder");
	assert.deepEqual(ids(f.app.filtered()), before);
	// A saved snapshot and a later render must not replace the current order.
	f.Store.state.items = structuredClone(f.Store.state.items);
	f.advance(60000);
	assert.deepEqual(ids(f.app.filtered()), before);
	f.app.filter.type = "todo";
	assert.deepEqual(ids(f.app.filtered()), [task.id, reminder.id]);
	f.app.filter.type = "all";
	assert.deepEqual(ids(f.app.filtered()), before);
	f.app.refreshFeedOrder();
	// Once both are done their scores tie, so the newer reminder comes first.
	assert.deepEqual(ids(f.app.filtered()), [article.id, reminder.id, task.id]);
});
// @wu-test type=behavior | scope=task completion feedback | protects=Complete and restore tasks without an unnecessary success toast
test("finishing and restoring tasks stays silent", () => {
	const f = fixture();
	const card = f.Store.card("task-01");
	f.Store.patch(card.id, { taskDone: [] });
	for (const task of card.tasks) f.app.toggleTask(card.id, task.id);
	assert.equal(
		f.Store.tasks(card).every((task) => task.done),
		true,
	);
	assert.equal(f.app.lastToast, undefined);
	f.app.toggleTask(card.id, card.tasks[0].id);
	assert.equal(f.Store.tasks(card)[0].done, false);
	assert.equal(f.app.lastToast, undefined);
});
// @wu-test type=behavior | scope=archive restore | protects=Restore a card without losing reading or bookmark state
test("explicit restore keeps reading state without a success toast", () => {
	const f = fixture();
	f.Store.patch("article-01", { archived: true, read: true, progress: 1, bookmarked: true });
	f.app.editId = "read";
	f.app.action("restore-card", "article-01");
	assert.equal(f.Store.item("article-01").archived, false);
	assert.equal(f.Store.item("article-01").read, true);
	assert.equal(f.Store.item("article-01").progress, 1);
	assert.equal(f.Store.item("article-01").bookmarked, true);
	assert.ok(ids(f.app.filtered()).includes("article-01"));
	assert.equal(f.app.lastToast, undefined);
});
// @wu-test type=behavior | scope=reminder notification eligibility | protects=Suppress notifications for snoozed, dismissed, completed or archived reminders
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
// @wu-test type=behavior | scope=FeedPolicy sorting | protects=Sort and deduplicate cards without changing the input order
test("priority, unread and time sorts are stable, immutable and deduplicated", () => {
	const { FeedPolicy: p, now } = fixture();
	const cards = [
		{ id: "a", type: "article", time: 3 },
		{ id: "b", type: "reminder", due: now() - 1, time: 1 },
		{ id: "c", type: "article", time: 2 },
	];
	assert.deepEqual(ids(p.sort(cards, "priority", {}, now())), ["b", "a", "c"]);
	assert.deepEqual(ids(p.sort(cards, "unread", { a: { read: true } }, now())), ["c", "b", "a"]);
	assert.deepEqual(ids(p.sort(cards, "time", {}, now())), ["a", "c", "b"]);
	// Stored order is oldest first; equal scores still show the newest write first.
	assert.deepEqual(ids(p.sort([cards[2], cards[0]], "priority", {}, now())), ["a", "c"]);
	assert.deepEqual(ids(cards), ["a", "b", "c"]);
	assert.equal(p.sort([...cards, cards[0]], "priority", {}, now()).length, 3);
});
// @wu-test type=boundary | scope=event and task notifications | protects=Notify only within the eligible time window for unfinished work
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
		tasks: [{ id: "1", text: "Step" }],
	};
	assert.equal(p.eligible(task, {}, n), true);
	assert.equal(p.eligible(task, { taskDone: ["1"] }, n), false);
	assert.equal(p.eligible({ ...task, due: undefined }, {}, n), false);
});
// @wu-test type=behavior | scope=notification deduplication | protects=Avoid duplicate notifications and enforce the cooldown
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
// @wu-test type=behavior | scope=pending reminders | protects=Queue a reminder without changing card order or read state | debt=D6
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
// @wu-test type=behavior | scope=reminder actions | protects=Preserve notes and bookmarks while changing reminder state
test("reminder actions preserve unrelated content state without a success toast", () => {
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
		assert.equal(f.app.lastToast, undefined);
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
// @wu-test type=behavior | scope=reminder filters | protects=Combine reminder status with type, tag and text filters
test("snoozed and dismissed views compose with type, tag and search filters", () => {
	const f = fixture();
	f.app.changeReminder("reminder-01", "snooze");
	f.app.filter = { type: "reminder", status: "snoozed", tag: "生活", query: "空档" };
	assert.deepEqual(ids(f.app.filtered()), ["reminder-01"]);
	f.app.filter.query = "不存在";
	assert.deepEqual(ids(f.app.filtered()), []);
});

// @wu-test type=regression | scope=route change handling | protects=Prevent duplicate history events from closing a newly opened panel | debt=D5
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
});
