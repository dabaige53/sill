import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { create } from "../../contracts/cloud.ts";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, identity, resource, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

const article = {
	type: "article",
	title: "Explicit facts",
	body: ["Full synthetic text"],
	bodyCoverage: "full",
	authors: [{ name: "Writer", url: "https://example.com/author", future: true }],
	publisher: { name: "Publisher" },
	publishedAt: "2026-10-20",
	modifiedAt: "2026-10-20T10:30Z",
	savedAt: "2026-10-20T12:30:00+08:00",
	section: "Research",
	readingEstimate: { seconds: 120, origin: "calculated", scope: "full", method: "explicit-count" },
};

const otherCards = [
	{
		type: "mail",
		title: "Email facts",
		sentAt: "2026-10-20T10:20Z",
		recipients: ["Reader"],
		authors: [{ name: "Sender" }],
	},
	{
		type: "task",
		title: "Project task",
		tasks: [{ id: "step", text: "Check" }],
		project: { name: "Project", url: "https://example.com/project" },
	},
	{ type: "reminder", title: "Project reminder", project: { name: "Project" } },
	{ type: "event", title: "Zoned event", start: 1000, end: 2000, timeZone: "Asia/Shanghai" },
	{ type: "media", title: "Chapters", media: "podcast", chapterCount: 4, duration: 240 },
	{
		type: "photo",
		title: "Photo facts",
		image: "coast",
		takenAt: "2026-10-20",
		caption: "Synthetic coast",
	},
	{ type: "digest", title: "Coverage", coverageStart: 1000, coverageEnd: 2000 },
	{
		type: "file",
		title: "File facts",
		files: [
			{
				name: "A",
				mimeType: "application/pdf",
				sizeBytes: 2048,
				modifiedAt: "2026-10-20",
				url: "https://example.com/a",
			},
		],
	},
];

test("explicit metadata SQL matches contract validation and checks merged partial updates", async () => {
	const f = await cloudFixture();
	try {
		await identity(f.db);
		let seq = 0;
		const write = (op: string, id: string | null, body: unknown) =>
			rpc(f.db, "sill_write_v1", [op, id, JSON.stringify(body), `explicit_${++seq}`]);
		const saved = (await write("create", null, article)).body;
		assert.deepEqual(saved.authors, article.authors);
		assert.equal(saved.publishedAt, "2026-10-20");
		for (const sample of otherCards) {
			assert.deepEqual(create.parse(sample), sample);
			const result = (await write("create", null, sample)).body;
			for (const [key, value] of Object.entries(sample)) assert.deepEqual(result[key], value, key);
		}

		for (const bad of [
			{ ...article, meta: "legacy" },
			{ ...article, readingEstimate: { seconds: 0, origin: "provided", scope: "full" } },
			{ ...article, publishedAt: "2026-02-30" },
			{ ...article, bodyCoverage: "none" },
			{ ...article, body: [] },
			{ ...article, body: ["\n\t "] },
			{ ...article, authors: [{ name: "\t " }] },
			{
				...article,
				readingEstimate: { seconds: 2, origin: "calculated", scope: "full", method: "\n" },
			},
			{ ...article, readingEstimate: { seconds: 2, origin: "calculated", scope: "full" } },
			{ type: "task", title: "Unrelated", authors: [{ name: "A" }] },
			{ type: "note", title: "Not email", sentAt: "2026-10-20T10:00:00Z" },
			{ type: "file", title: "File", files: [{ name: "A", meta: "legacy" }] },
			{ type: "file", title: "File", files: [{ name: "A", time: 100 }] },
			{ type: "file", title: "File", files: [{ name: "A", sizeBytes: 1.5 }] },
			{ type: "file", title: "File", files: [{ name: "" }] },
			{ type: "file", title: "File", files: Array.from({ length: 201 }, () => ({ name: "A" })) },
			{ type: "event", title: "Event", timeZone: "Made/Up" },
			{ type: "digest", title: "Digest", coverageStart: 20, coverageEnd: 10 },
		]) {
			assert.equal(create.safeParse(bad).success, false, JSON.stringify(bad));
			await assert.rejects(write("create", null, bad), /invalid_request/);
		}
		for (const changes of [{ body: ["Changed"] }, { bodyCoverage: "excerpt" }, { type: "task" }])
			await assert.rejects(
				write("update", saved.id, { expectedRevision: 1, changes }),
				/invalid_request/,
			);
		const unchanged = await rpc(f.db, "sill_get_content", [saved.id]);
		assert.equal(unchanged.revision, 1);
		const updated = (
			await write("update", saved.id, {
				expectedRevision: 1,
				changes: { body: ["Changed"], readingEstimate: null, state: { note: "Personal note" } },
			})
		).body;
		assert.equal(updated.readingEstimate, null);
		assert.equal(updated.state.note, "Personal note");
		assert.equal(updated.meta, undefined);
		// Full-card edits clear omitted metadata while keeping unknown extensions.
		await f.db.exec("reset role");
		await f.db.query(
			"update sill_private.contents set card=card||'{\"futureField\":true}'::jsonb where id=$1",
			[saved.id],
		);
		await identity(f.db);
		const workspace = await rpc(f.db, "sill_get_workspace", []);
		await rpc(f.db, "sill_apply_operations", [
			JSON.stringify({
				expectedRevision: workspace.revision,
				operations: [
					{
						op: "card.upsert",
						card: {
							id: saved.id,
							type: "article",
							title: "Full replacement",
							body: ["Replacement text"],
						},
					},
				],
			}),
			"explicit_replace_01",
		]);
		const replaced = await rpc(f.db, "sill_get_content", [saved.id]);
		assert.equal(replaced.readingEstimate, undefined);
		assert.equal(replaced.authors, undefined);
		assert.equal(replaced.futureField, true);
		const file = {
			type: "file",
			title: "File",
			files: [
				{
					name: "A",
					mimeType: "application/pdf",
					sizeBytes: 0,
					modifiedAt: "2026-10-20",
					url: "https://example.com/a",
				},
			],
		};
		assert.equal(create.safeParse(file).success, true);
		assert.deepEqual((await write("create", null, file)).body.files, file.files);
	} finally {
		await f.db.close();
	}
});

test("HTTP and MCP preserve explicit facts and reject legacy or unrelated fields", async () => {
	const f = await cloudFixture();
	let client: Client | undefined;
	try {
		const runtime = createSillRuntime(
			{ ...f.config, mcpEnabled: true },
			{ clientFactory: f.factory },
		);
		const call = (body: unknown, key: string) =>
			runtime(
				new Request(f.config.appOrigin + "/api/v1/contents", {
					method: "POST",
					headers: {
						Cookie: "__Host-sill-access=" + token(),
						Origin: f.config.appOrigin,
						"Content-Type": "application/json",
						"Idempotency-Key": key,
					},
					body: JSON.stringify(body),
				}),
			);
		const response = await call(article, "explicit_http_01");
		assert.equal(response.status, 201);
		const saved = await response.json();
		assert.deepEqual(saved.authors, article.authors);
		const patch = (changes: unknown, key: string) =>
			runtime(
				new Request(f.config.appOrigin + "/api/v1/contents/" + saved.id, {
					method: "PATCH",
					headers: {
						Cookie: "__Host-sill-access=" + token(),
						Origin: f.config.appOrigin,
						"Content-Type": "application/json",
						"Idempotency-Key": key,
					},
					body: JSON.stringify({ expectedRevision: 1, changes }),
				}),
			);
		assert.equal((await patch({ body: ["Updated text"] }, "explicit_http_stale")).status, 400);
		const cleared = await patch(
			{ body: ["Updated text"], readingEstimate: null, state: { note: "Private reader note" } },
			"explicit_http_clear",
		);
		assert.equal(cleared.status, 200);
		const clearedCard = await cleared.json();
		assert.equal(clearedCard.readingEstimate, null);
		assert.equal(clearedCard.state.note, "Private reader note");
		assert.deepEqual(clearedCard.authors, article.authors);

		for (const [index, sample] of otherCards.entries()) {
			const result = await call(sample, "explicit_http_more_" + index);
			assert.equal(result.status, 201);
			const value = await result.json();
			for (const [key, expected] of Object.entries(sample))
				assert.deepEqual(value[key], expected, key);
		}

		for (const bad of [
			{ ...article, meta: "old" },
			{ type: "note", title: "Wrong", chapterCount: 2 },
		])
			assert.equal((await call(bad, crypto.randomUUID())).status, 400);
		await f.db.exec(
			`reset role;insert into sill_private.caller_grants values('${A}','oauth:explicit-test',array['content:read','content:write'],array['*'],'${resource}');`,
		);
		client = new Client({ name: "explicit-test", version: "1.0.0" });
		await client.connect(
			new StreamableHTTPClientTransport(new URL(resource), {
				requestInit: {
					headers: {
						Authorization: "Bearer " + token({ client_id: "explicit-test", aud: resource }),
					},
				},
				fetch: (url, init) => runtime(new Request(url, init)),
			}),
		);
		const discovered = await client.listTools();
		const creationTool = discovered.tools.find((tool) => tool.name === "sill_createContent");
		assert.match(JSON.stringify(creationTool?.inputSchema), /readingEstimate/);
		assert.match(JSON.stringify(creationTool?.inputSchema), /bodyCoverage/);
		assert.match(JSON.stringify(creationTool?.inputSchema), /Original content authors/);
		const result = await client.callTool({
			name: "sill_createContent",
			arguments: { idempotency_key: "explicit_mcp_01", body: article },
		});
		assert.equal(result.isError, undefined);
		assert.match(JSON.stringify(result), /explicit-count/);
		const savedMCP = result.structuredContent as { id: string; revision: number };
		const changedMCP = await client.callTool({
			name: "sill_updateContent",
			arguments: {
				id: savedMCP.id,
				idempotency_key: "explicit_mcp_update",
				body: {
					expectedRevision: savedMCP.revision,
					changes: {
						body: ["Updated through MCP"],
						readingEstimate: null,
						state: { note: "MCP personal note" },
					},
				},
			},
		});
		assert.equal(changedMCP.isError, undefined);
		const fetchedMCP = await client.callTool({
			name: "sill_getContent",
			arguments: { id: savedMCP.id },
		});
		const fetchedValue = fetchedMCP.structuredContent as Record<string, unknown>;
		assert.equal(fetchedValue.readingEstimate, null);
		assert.deepEqual(fetchedValue.authors, article.authors);
		assert.match(JSON.stringify(fetchedMCP), /MCP personal note/);
		const invalid = await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "explicit_mcp_bad",
				body: { type: "note", title: "Wrong", files: [{ name: "A", meta: "old" }] },
			},
		});
		assert.equal(invalid.isError, true);
	} finally {
		await client?.close();
		await f.db.close();
	}
});

test("shared invalid metadata fixtures are rejected by database full-card operations", async () => {
	const fixtures = JSON.parse(
		await readFile(new URL("../../contracts/fixtures.json", import.meta.url), "utf8"),
	);
	const f = await cloudFixture();
	try {
		await identity(f.db);
		const fields = [
			"meta",
			"authors",
			"publisher",
			"publishedAt",
			"modifiedAt",
			"savedAt",
			"bodyCoverage",
			"readingEstimate",
			"section",
			"sentAt",
			"recipients",
			"project",
			"timeZone",
			"chapterCount",
			"takenAt",
			"caption",
			"coverageStart",
			"coverageEnd",
		];
		const invalidMetadata = fixtures.invalid.filter(
			(sample) =>
				fields.some((field) => Object.hasOwn(sample.card, field)) ||
				sample.card.files?.some(
					(file) => Object.hasOwn(file, "meta") || Object.hasOwn(file, "time"),
				),
		);
		for (const [index, sample] of invalidMetadata.entries()) {
			const payload = {
				expectedRevision: 0,
				operations: [{ op: "card.upsert", before: null, card: sample.card }],
			};
			await assert.rejects(
				rpc(f.db, "sill_apply_operations", [JSON.stringify(payload), "shared_invalid_" + index]),
				/invalid_request/,
				sample.name,
			);
		}
		assert.equal((await rpc(f.db, "sill_get_workspace", [])).revision, 0);
	} finally {
		await f.db.close();
	}
});
