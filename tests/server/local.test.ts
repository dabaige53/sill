import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { Batch } from "../../contracts/local.ts";
import { startLocal } from "../../server/local/index.ts";
import { LocalRepository } from "../../server/local/repository.ts";

const run = promisify(execFile);
const card: Record<string, any> = {
	id: "test-note",
	type: "note",
	title: "本地卡片",
	body: "正文",
	url: "https://example.com",
};

test("conditional whole-card writes reject stale edits, deletes and duplicate creates without blocking independent reading", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sill-cas-"));
	try {
		const repo = new LocalRepository(join(dir, "cards.json"));
		const before = repo.apply({ operations: [{ op: "card.upsert", card, before: null }] }).state
			.cards[0];
		repo.apply({ operations: [{ op: "item.patch", id: card.id, values: { read: true } }] });
		const latest = repo.apply({
			operations: [{ op: "card.upsert", card: { ...before, title: "新标题" }, before }],
		}).state.cards[0];
		const saved = repo.snapshot();
		for (const op of [
			{ op: "card.upsert", card: { ...before, title: "旧页面" }, before },
			{ op: "card.delete", id: card.id, before },
			{ op: "card.upsert", card, before: null },
		]) {
			assert.throws(
				() => repo.apply({ operations: [{ op: "reading.add", seconds: 1 }, op] }),
				(e?: any) => e.status === 409,
			);
			assert.deepEqual(repo.snapshot(), saved);
		}
		repo.apply({ operations: [{ op: "card.delete", id: card.id, before: latest }] });
		assert.throws(
			() => repo.apply({ operations: [{ op: "card.upsert", card: before, before }] }),
			(e?: any) => e.status === 409,
			"deleted cards cannot be resurrected by stale editing",
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("local operations persist all card states and reject conflicts atomically", async () => {
	const dir = await mkdtemp(join(tmpdir(), "qg-local-")),
		file = join(dir, "cards.json");
	try {
		const repo = new LocalRepository(file);
		repo.apply({ operations: [{ op: "card.upsert", card }] });
		const saved = repo.apply({
			expectedRevision: 1,
			operations: [
				{
					op: "item.patch",
					id: card.id,
					values: {
						read: true,
						bookmarked: true,
						later: true,
						note: "备注",
						tags: ["工作"],
						tagsEdited: true,
						progress: 0.8,
						snoozedUntil: 123,
						dismissed: true,
						reminderDone: true,
					},
				},
				{ op: "preferences.patch", values: { sort: "time", density: "compact" } },
				{ op: "reading.add", seconds: 12 },
			],
		});
		assert.deepEqual(new LocalRepository(file).snapshot(), saved);
		assert.throws(
			() => repo.apply({ expectedRevision: 1, operations: [{ op: "card.delete", id: card.id }] }),
			/revision_conflict/,
		);
		assert.throws(
			() =>
				repo.apply({
					operations: [
						{ op: "preferences.patch", values: { sort: "unread" } },
						{ op: "item.patch", id: card.id, values: { note: "覆盖" }, before: { note: "旧备注" } },
					],
				}),
			/field_conflict/,
		);
		assert.deepEqual(repo.snapshot(), saved, "failed batch must not partially commit");
		assert.throws(() =>
			repo.apply({
				operations: [{ op: "card.upsert", card: { ...card, url: "javascript:alert(1)" } }],
			}),
		);
		assert.throws(() =>
			repo.apply({ operations: [{ op: "card.upsert", card: { ...card, id: "__proto__" } }] }),
		);
		assert.throws(
			() =>
				repo.apply({
					operations: [{ op: "item.patch", id: card.id, values: { taskDone: ["missing"] } }],
				}),
			/task_not_found/,
		);
		repo.apply({
			operations: [
				{
					op: "card.upsert",
					card: { id: "task", type: "task", title: "任务", tasks: [{ id: "t1", text: "检查" }] },
				},
				{ op: "item.patch", id: "task", values: { taskDone: ["t1"] } },
			],
		});
		assert.deepEqual(repo.snapshot().state.items.task.taskDone, ["t1"]);
		repo.apply({ operations: [{ op: "card.delete", id: card.id }] });
		assert.equal(
			repo.snapshot().state.cards.some((c?: any) => c.id === card.id),
			false,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("legacy sources remain opaque state and source operations are unsupported", async () => {
	const dir = await mkdtemp(join(tmpdir(), "qg-legacy-sources-")),
		file = join(dir, "cards.json");
	const sources = [
		{ id: "old-source", kind: "ai", name: "旧来源", enabled: false, extra: { keep: true } },
	];
	try {
		await writeFile(
			file,
			JSON.stringify({
				revision: 5,
				state: {
					cards: [card],
					items: {},
					seconds: 0,
					preferences: { sort: "priority" },
					sources,
				},
			}),
		);
		const repo = new LocalRepository(file);
		assert.deepEqual(
			repo.snapshot().state.sources,
			sources,
			"reading does not migrate old sources",
		);
		repo.apply({ operations: [{ op: "preferences.patch", values: { sort: "time" } }] });
		assert.deepEqual(
			new LocalRepository(file).snapshot().state.sources,
			sources,
			"other writes preserve old sources exactly",
		);
		for (const operation of [
			{ op: "source.upsert", source: { id: "new-source", kind: "rss", name: "RSS" } },
			{ op: "source.delete", id: "old-source" },
		]) {
			assert.throws(() => repo.apply({ operations: [operation] }));
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("loopback HTTP and actual agent CLI share the same data without App/MCP login", async () => {
	const dir = await mkdtemp(join(tmpdir(), "qg-http-")),
		file = join(dir, "cards.json");
	const server = await startLocal({ port: 0, file }),
		port = (server.address() as import("node:net").AddressInfo).port,
		origin = "http://127.0.0.1:" + port;
	const cli = async (...args: any[]) =>
		JSON.parse(
			(
				await run(process.execPath, ["scripts/sill.ts", ...args], {
					cwd: join(import.meta.dirname, "../.."),
					env: { ...process.env, QG_LOCAL_PORT: String(port) },
				})
			).stdout,
		);
	try {
		assert.equal((await fetch(origin + "/health").then((r?: any) => r.json())).mode, "local");
		assert.equal(
			(await fetch(origin + "/api/local/state", { headers: { Origin: "https://example.com" } }))
				.status,
			403,
		);
		const status = await new Promise((resolve?: any) => {
			const req = request(
				origin + "/api/local/state",
				{ headers: { Host: "example.com" } },
				(res?: any) => {
					res.resume();
					resolve(res.statusCode);
				},
			);
			req.end();
		});
		assert.equal(status, 403);
		assert.equal(
			(await fetch(origin + "/api/local/operations", { method: "POST", body: "{}" })).status,
			415,
		);
		const invalid = await fetch(origin + "/api/local/operations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		assert.equal(invalid.status, 400);
		assert.deepEqual(await invalid.json(), { error: "invalid_request" });
		const malformed = await fetch(origin + "/api/local/operations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		assert.deepEqual(await malformed.json(), { error: "invalid_json" });
		assert.equal((await fetch(origin + "/.env")).status, 404);
		const response = await fetch(origin + "/api/local/operations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operations: [{ op: "card.upsert", card }] }),
		});
		assert.equal(response.status, 200);
		const available = await cli("capabilities");
		assert.ok(available.itemFields.includes("taskDone"));
		Batch.parse({ operations: available.examples });
		assert.ok(!available.operations.includes("source.upsert"));
		assert.ok(!available.operations.includes("source.delete"));
		assert.equal((await cli("get", card.id)).card.title, card.title);
		assert.equal((await cli("list", "本地")).cards.length, 1);
		assert.equal((await cli("open", card.id)).source, card.url);
		assert.equal((await fetch(origin + "/mcp")).status, 404);
		const again = await fetch(origin + "/api/local/initialize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		}).then((r?: any) => r.json());
		assert.equal(again.state.cards.length, 1, "migration cannot replace saved data");
	} finally {
		await new Promise((resolve?: any) => server.close(resolve));
		await rm(dir, { recursive: true, force: true });
	}
});
