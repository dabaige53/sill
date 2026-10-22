import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { create } from "../../contracts/cloud.ts";
import { identity, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";

const fixtures = JSON.parse(
	await readFile(new URL("../../contracts/fixtures.json", import.meta.url), "utf8"),
);
const rich = (card: any) =>
	card.type === "pr" ||
	["audioUrl", "chapters", "transcript", "attachments"].some((key) => Object.hasOwn(card, key));

test("rich cards round trip and invalid merged changes leave the original revision intact", async () => {
	const f = await cloudFixture();
	try {
		await identity(f.db);
		let seq = 0;
		const write = (op: string, id: string | null, body: unknown) =>
			rpc(f.db, "sill_write_v1", [op, id, JSON.stringify(body), `rich_fields_${++seq}`]);
		for (const sample of fixtures.valid.filter((v: any) => rich(v.card))) {
			const { id: _, ...input } = sample.card;
			assert.deepEqual(create.parse(input), input);
			const saved = (await write("create", null, input)).body;
			for (const [key, value] of Object.entries(input)) assert.deepEqual(saved[key], value, key);
			if (input.type === "pr") {
				await assert.rejects(
					write("update", saved.id, { expectedRevision: 1, changes: { pullRequest: null } }),
					/invalid_request/,
				);
				assert.equal((await rpc(f.db, "sill_get_content", [saved.id])).revision, 1);
			}
			if (input.audioUrl) {
				const updated = (
					await write("update", saved.id, {
						expectedRevision: 1,
						changes: { state: { playbackPosition: 42.5 } },
					})
				).body;
				assert.equal(updated.state.playbackPosition, 42.5);
				assert.notEqual(updated.state.read, true);
				assert.notEqual(updated.state.progress, 1);
				await assert.rejects(
					write("update", saved.id, {
						expectedRevision: 1,
						changes: { state: { playbackPosition: 50 } },
					}),
					/conflict/,
				);
				await assert.rejects(
					write("update", saved.id, { expectedRevision: 2, changes: { duration: 20 } }),
					/invalid_request/,
				);
			}
		}
		for (const sample of fixtures.invalid.filter((v: any) => rich(v.card))) {
			const { id: _, ...input } = sample.card;
			assert.equal(create.safeParse(input).success, false, sample.name);
			await assert.rejects(write("create", null, input), /invalid_request/, sample.name);
		}
		const before = await rpc(f.db, "sill_get_workspace", []);
		await assert.rejects(
			rpc(f.db, "sill_apply_operations", [
				JSON.stringify({
					expectedRevision: before.revision,
					operations: [
						{
							op: "card.upsert",
							before: null,
							card: { id: "rich-rollback", type: "note", title: "Must roll back" },
						},
						{
							op: "card.upsert",
							before: null,
							card: { id: "rich-invalid", type: "pr", title: "Missing snapshot" },
						},
					],
				}),
				"rich_atomic",
			]),
			/invalid_request/,
		);
		const after = await rpc(f.db, "sill_get_workspace", []);
		assert.equal(after.revision, before.revision);
		assert.deepEqual(after.state.cards, before.state.cards);
	} finally {
		await f.db.close();
	}
});

test("HTTP and MCP expose PR snapshots and playback fields", async () => {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { StreamableHTTPClientTransport } = await import(
		"@modelcontextprotocol/sdk/client/streamableHttp.js"
	);
	const { createSillRuntime } = await import("../../server/cloud/http.ts");
	const { A, resource } = await import("./helpers/boundary-fixture.ts");
	const { token } = await import("./helpers/signed-auth.ts");
	const f = await cloudFixture();
	const client = new Client({ name: "rich-fields", version: "1" });
	try {
		const runtime = createSillRuntime(
			{ ...f.config, mcpEnabled: true },
			{ clientFactory: f.factory },
		);
		for (const sample of fixtures.valid.filter((v: any) => rich(v.card))) {
			const { id: _, ...body } = sample.card;
			const response = await runtime(
				new Request(f.config.appOrigin + "/api/v1/contents", {
					method: "POST",
					headers: {
						Cookie: "__Host-sill-access=" + token(),
						Origin: f.config.appOrigin,
						"Content-Type": "application/json",
						"Idempotency-Key": crypto.randomUUID(),
					},
					body: JSON.stringify(body),
				}),
			);
			assert.equal(response.status, 201);
			const saved = await response.json();
			for (const [key, value] of Object.entries(body)) assert.deepEqual(saved[key], value, key);
		}
		await f.db.exec(
			`reset role;insert into sill_private.caller_grants values('${A}','oauth:rich-test',array['content:read','content:write'],array['*'],'${resource}');`,
		);
		await client.connect(
			new StreamableHTTPClientTransport(new URL(resource), {
				requestInit: {
					headers: { Authorization: "Bearer " + token({ client_id: "rich-test", aud: resource }) },
				},
				fetch: (url, init) => runtime(new Request(url, init)),
			}),
		);
		const discovery = await client.listTools();
		assert.match(JSON.stringify(discovery.tools), /playbackPosition/);
		assert.match(JSON.stringify(discovery.tools), /pullRequest/);
		for (const sample of fixtures.valid.filter((v: any) => rich(v.card))) {
			const { id: _, ...body } = sample.card;
			const result = await client.callTool({
				name: "sill_createContent",
				arguments: { idempotency_key: crypto.randomUUID(), body },
			});
			assert.equal(result.isError, undefined);
			for (const [key, value] of Object.entries(body))
				assert.deepEqual((result.structuredContent as any)[key], value, key);
		}
	} finally {
		await client.close();
		await f.db.close();
	}
});

test("local storage preserves playback independently of read and reading progress", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { LocalRepository } = await import("../../server/local/repository.ts");
	const dir = await mkdtemp("/private/tmp/sill-rich-local-");
	try {
		const file = dir + "/cards.json";
		const repo = new LocalRepository(file);
		const cards = fixtures.valid.filter((v: any) => rich(v.card)).map((v: any) => v.card);
		repo.apply({
			operations: cards.map((card: any) => ({ op: "card.upsert", card, before: null })),
		});
		const card = cards.find((v: any) => v.audioUrl);
		repo.apply({
			operations: [
				{ op: "item.patch", id: card.id, values: { playbackPosition: 55.25, progress: 0.3 } },
			],
		});
		const saved = new LocalRepository(file).snapshot().state;
		assert.equal(saved.items[card.id].playbackPosition, 55.25);
		assert.equal(saved.items[card.id].progress, 0.3);
		assert.notEqual(saved.items[card.id].read, true);
		assert.deepEqual(
			saved.cards.find((v: any) => v.type === "pr").pullRequest,
			cards.find((v: any) => v.type === "pr").pullRequest,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
