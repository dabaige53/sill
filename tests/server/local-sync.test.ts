import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { LocalRepository } from "../../server/local/repository.ts";

const bundle = buildSync({
	stdin: {
		contents:
			"export {LocalSync} from './apps/web/services/local-sync.ts'; export {Store} from './apps/web/data/store.ts';",
		resolveDir: resolve(import.meta.dirname, "../.."),
	},
	bundle: true,
	write: false,
	format: "iife",
	globalName: "API",
}).outputFiles[0].text;

function fixture(t: any, items: any = { a: { note: "original" } }) {
	const dir = mkdtempSync(join(tmpdir(), "sill-sync-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const data = new Map();
	const context = vm.createContext({
		queueMicrotask,
		localStorage: {
			getItem: (key: string) => data.get(key),
			setItem: (key: string, value: string) => data.set(key, value),
			removeItem: (key: string) => data.delete(key),
		},
		document: { getElementById: () => null },
		window: {},
	});
	vm.runInContext(bundle, context);
	const { LocalSync: sync, Store: store } = context.API;
	const repo = new LocalRepository(join(dir, "cards.json"));
	const initial = repo.initialize({
		cards: ["a", "b"].map((id) => ({ id, type: "note", title: id, body: ["original"] })),
		items,
		preferences: {},
		sources: [],
		seconds: 0,
	});
	store.state = initial.state;
	sync.app = {
		currentId: "a",
		editId: "a",
		modalKind: "editor",
		grid: { dataset: {} },
		applyPreferences() {},
		withFeedAnchor() {},
		checkReminders() {},
		toast() {},
		setOffline() {},
	};
	sync.status = () => {};
	sync.baseline = sync.snapshot();
	sync.revision = initial.revision;
	const request = sync.request.bind(sync);
	sync.request = async (_path: string, batch: any) => repo.apply(JSON.parse(JSON.stringify(batch)));
	return { sync, store, repo, data, context, request };
}

test("empty proxy failure reports service unavailable and retains an unconfirmed write", async (t) => {
	const { sync, context, request, data } = fixture(t);
	context.AbortSignal = AbortSignal;
	context.fetch = async () => new Response(null, { status: 502 });
	sync.request = request;
	const batch = { operations: [{ kind: "item.patch", id: "a", values: { note: "draft" } }] };
	sync.pending.push(batch);
	let message = "";
	sync.status = (value: string) => { message = value; };
	await sync.flush();
	assert.match(message, /本地数据服务暂时不可用/);
	assert.equal(sync.pending[0], batch);
	assert.equal(sync.failed, true);
	assert.ok(data.has("sill-unsynced"));
});

test("incomplete local response is not reported as a successful read", async (t) => {
	const { context, request } = fixture(t);
	context.AbortSignal = AbortSignal;
	context.fetch = async () => new Response("", { status: 200 });
	await assert.rejects(request("state"), /不完整的响应/);
});

test("unchanged array preferences do not enqueue another write after adopting a response", (t) => {
	const { sync, store } = fixture(t);
	store.state.preferences.hiddenActions = [];
	sync.baseline = sync.snapshot();
	sync.capture();
	assert.equal(sync.pending.length, 0);
});

for (const items of [{ a: { note: "original" } }, {}]) {
	test("open note editor retains original or absent baseline across save responses", async (t) => {
		const { sync, store, repo, data } = fixture(t, items);
		sync.adopt(
			repo.apply({
				operations: [{ op: "item.patch", id: "a", values: { note: "agent note", read: true } }],
			}),
		);
		assert.equal(store.state.items.a.read, true);
		store.state.items.a.note = "user draft";
		sync.capture();
		await sync.flush();
		assert.equal(repo.snapshot().state.items.a.note, "agent note");
		assert.equal(sync.failed, true);
		assert.equal(sync.pending.length, 1);
		assert.equal(JSON.parse(data.get("sill-unsynced")).state.items.a.note, "user draft");
	});
}

test("bulk tags retain each card baseline and reject the whole conflicting batch", async (t) => {
	const { sync, store, repo } = fixture(t, { a: { tags: ["old"], tagsEdited: true }, b: {} });
	sync.app.bulkEditIds = ["a", "b"];
	sync.adopt(
		repo.apply({
			operations: [{ op: "item.patch", id: "b", values: { tags: ["agent"], tagsEdited: true } }],
		}),
	);
	for (const id of ["a", "b"])
		Object.assign(store.state.items[id], { tags: ["user"], tagsEdited: true });
	sync.capture();
	await sync.flush();
	assert.equal(sync.failed, true);
	assert.deepEqual(repo.snapshot().state.items.a.tags, ["old"]);
	assert.deepEqual(repo.snapshot().state.items.b.tags, ["agent"]);
});

test("unrelated remote reading state merges while a note save succeeds", async (t) => {
	const { sync, store, repo } = fixture(t);
	sync.adopt(repo.apply({ operations: [{ op: "item.patch", id: "a", values: { read: true } }] }));
	store.state.items.a.note = "user draft";
	sync.capture();
	sync.app.modalKind = "";
	await sync.flush();
	assert.equal(sync.failed, false);
	assert.equal(repo.snapshot().state.items.a.note, "user draft");
	assert.equal(repo.snapshot().state.items.a.read, true);
});

test("lost write response keeps the draft and retry cannot overwrite a newer note", async (t) => {
	const { sync, store, repo, data } = fixture(t);
	store.state.items.a.note = "user draft";
	sync.capture();
	sync.app.modalKind = "";
	sync.request = async (_path: string, batch: any) => {
		repo.apply(JSON.parse(JSON.stringify(batch)));
		throw new Error("response lost");
	};
	await sync.flush();
	assert.equal(sync.failed, true);
	assert.ok(data.has("sill-unsynced"));
	repo.apply({ operations: [{ op: "item.patch", id: "a", values: { note: "new agent note" } }] });
	sync.request = async (_path: string, batch: any) => repo.apply(JSON.parse(JSON.stringify(batch)));
	await sync.flush();
	assert.equal(repo.snapshot().state.items.a.note, "new agent note");
	assert.equal(sync.pending.length, 1);
});

test("initial snapshot appears without arrival motion; later snapshots retain update motion", (t) => {
	const { sync, repo } = fixture(t);
	sync.app.modalKind = "";
	const animations: boolean[] = [];
	sync.app.withFeedAnchor = (_change: () => void, animate: boolean) => animations.push(animate);
	sync.adopt(repo.apply({ operations: [{ op: "item.patch", id: "a", values: { read: true } }] }));
	assert.deepEqual(animations, [false]);
	sync.ready = true;
	sync.adopt(repo.apply({ operations: [{ op: "item.patch", id: "a", values: { read: false } }] }));
	assert.deepEqual(animations, [false, true]);
});
