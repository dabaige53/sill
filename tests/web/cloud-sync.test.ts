import assert from "node:assert/strict";
import test from "node:test";
import {
	CloudSync,
	clone,
	itemDefaults,
	workspaceDiff,
} from "../../apps/web/services/cloud-sync.ts";
import { workspaceBatch } from "../../contracts/cloud.ts";

const initial = () => ({
	cards: [
		{ id: "a", type: "note", title: "A", revision: 1, state: { read: false } },
		{ id: "b", type: "note", title: "B", revision: 1 },
	],
	items: { a: itemDefaults({}), b: itemDefaults({}) },
	preferences: { theme: "system" },
	seconds: 0,
});
test("cloud captures one bulk gesture atomically and strips server metadata from card writes", () => {
	const before = initial(),
		next = clone(before);
	next.items.a.bookmarked = true;
	next.items.b.bookmarked = true;
	next.cards[0].title = "Changed";
	const operations = workspaceDiff(before, next);
	assert.equal(operations.length, 3);
	assert.equal(operations[0].card.revision, undefined);
	assert.equal(operations[0].card.state, undefined);
	assert.doesNotThrow(() => workspaceBatch.parse({ operations }));
	const removed = clone(before);
	removed.cards = [];
	assert.doesNotThrow(() => workspaceBatch.parse({ operations: workspaceDiff(before, removed) }));
	assert.deepEqual(
		operations.slice(1).map((o) => o.before),
		[{ bookmarked: false }, { bookmarked: false }],
	);
});
test("unknown cloud write keeps the exact key and body; a successful retry does not duplicate reading time", async () => {
	let state = initial(),
		requestCount = 0;
	const sent: any[] = [];
	const sync = new CloudSync({
		snapshot: () => state,
		owner: () => "owner-a",
		canSave: () => true,
		status: () => {},
		failure: () => {},
		adopt: (value) => sync.rebase(value.state, value.revision),
		request: async (body, key) => {
			sent.push({ body: clone(body), key });
			if (requestCount++ === 0) throw Error("lost response");
			return { state: clone(state), revision: 2 };
		},
	});
	sync.rebase(state, 1);
	state.seconds += 5;
	await sync.flush();
	assert.equal(sync.pending.length, 1);
	assert.ok(sync.failed);
	await sync.flush();
	assert.equal(sync.pending.length, 0);
	assert.deepEqual(sent[0], sent[1]);
	assert.deepEqual(sent[0].body.operations, [{ op: "reading.add", seconds: 5 }]);
	// A no-op flush must not strand a resolved promise and block later writes.
	await sync.flush();
	state.items.a.bookmarked = true;
	await sync.flush();
	assert.equal(sent.length, 3);
});
test("one synchronous bulk action is one request and preserves later changes during a save", async () => {
	let state = initial(),
		resolve: any;
	const sent: any[] = [];
	const sync = new CloudSync({
		snapshot: () => state,
		owner: () => "owner-a",
		canSave: () => true,
		status: () => {},
		failure: () => {},
		adopt: (value) => sync.rebase(value.state, value.revision),
		request: async (body, key) => {
			sent.push({ body, key });
			if (sent.length === 1) await new Promise((r) => (resolve = r));
			return { state: clone(state), revision: sent.length + 1 };
		},
	});
	sync.rebase(state, 1);
	state.items.a.bookmarked = true;
	sync.capture();
	state.items.b.bookmarked = true;
	sync.capture();
	await Promise.resolve();
	assert.equal(sent.length, 1);
	assert.equal(sent[0].body.operations.length, 2);
	state.items.a.note = "After save started";
	sync.capture();
	await Promise.resolve();
	resolve();
	await sync.running;
	assert.equal(sent.length, 2);
	assert.equal(sent[1].body.operations[0].values.note, "After save started");
	assert.equal(sync.pending.length, 0);
});

test("reauthentication restores the optimistic state before retry, never treating cleared UI as deletion", async () => {
	let state = initial(),
		denied = true;
	const sent: any[] = [];
	const sync = new CloudSync({
		snapshot: () => state,
		owner: () => "owner-a",
		canSave: () => true,
		status: () => {},
		adopt: (value) => sync.rebase(value.state, value.revision),
		failure: () => {
			state = { ...initial(), cards: [], items: {} as any };
			sync.suspended = true;
		},
		request: async (body, key, owner) => {
			sent.push({ body: clone(body), key, owner });
			if (denied) throw Object.assign(Error("unauthenticated"), { status: 401 });
			return { state: clone(state), revision: 2 };
		},
	});
	sync.rebase(state, 1);
	state.items.a.read = true;
	await sync.flush();
	assert.equal(sync.suspended, true);
	assert.equal(sync.resume("owner-b"), null);
	assert.equal(sync.suspended, true);
	state = sync.resume("owner-a");
	denied = false;
	await sync.flush();
	assert.equal(sent.length, 2);
	assert.deepEqual(sent[0], sent[1]);
	assert.ok(sent.every((r) => r.body.operations.every((o) => o.op !== "card.delete")));
	assert.equal(state.cards.length, 2);
});
test("queued batches retain their originating owner even if the current session changes", async () => {
	let state = initial(),
		owner = "owner-a";
	const sent: any[] = [];
	const sync = new CloudSync({
		snapshot: () => state,
		owner: () => owner,
		canSave: () => false,
		status: () => {},
		adopt: () => {},
		failure: () => {},
		request: async (body, key, expectedOwner) => {
			sent.push(expectedOwner);
			throw Object.assign(Error("forbidden"), { status: 403 });
		},
	});
	sync.rebase(state, 1);
	state.preferences.theme = "dark";
	sync.collect();
	owner = "owner-b";
	sync.options.canSave = () => true;
	await sync.flush();
	assert.deepEqual(sent, ["owner-a"]);
	assert.equal(sync.pending.length, 1);
});
