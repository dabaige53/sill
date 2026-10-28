import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";
import { create } from "../../contracts/cloud.ts";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, identity, resource, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

const article = {
	type: "article",
	title: "Explicit facts",
	body: "Full synthetic text",
	authors: [{ name: "Writer", url: "https://example.com/author" }],
	publishedAt: "2026-10-20",
};

const otherCards = [
	{
		type: "mail",
		title: "Email facts",
		publishedAt: "2026-10-20T10:20Z",
		authors: [{ name: "Sender" }],
		files: [{ name: "brief.pdf", mimeType: "application/pdf", sizeBytes: 1024 }],
	},
	{
		type: "task",
		title: "Project task",
		tasks: [{ id: "step", text: "Check" }],
		project: { name: "Project", url: "https://example.com/project" },
	},
	{ type: "reminder", title: "Project reminder", project: { name: "Project" } },
	{ type: "event", title: "Meeting", start: 1000, end: 2000, people: ["Reader"] },
	{
		type: "media",
		title: "Chapters",
		media: "podcast",
		duration: 240,
		chapters: [{ start: 0, title: "Intro" }],
	},
	{
		type: "photo",
		title: "Photo facts",
		images: ["coast"],
		publishedAt: "2026-10-20",
		summary: "Synthetic coast",
	},
	{ type: "note", title: "Quote", form: "quote", body: "Quoted text" },
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

test("card SQL matches contract validation and checks merged partial updates", async () => {
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
			{ ...article, future: true },
			{ ...article, readingEstimate: { seconds: 120 } },
			{ ...article, bodyCoverage: "full" },
			{ ...article, sender: { name: "Sender" } },
			{ ...article, publishedAt: "2026-02-30" },
			{ ...article, authors: [{ name: "\t " }] },
			{ ...article, authors: [{ name: "Writer", future: true }] },
			{ ...article, summary: null },
			{
				type: "task",
				title: "Unrelated",
				tasks: [{ id: "a", text: "A" }],
				authors: [{ name: "A" }],
			},
			{ type: "task", title: "Completed", tasks: [{ id: "a", text: "A", done: true }] },
			{ type: "note", title: "Not an event", people: ["A"] },
			{ type: "note", title: "Layout", form: "capture" },
			{ type: "photo", title: "No image" },
			{ type: "file", title: "File", files: [{ name: "A", meta: "legacy" }] },
			{ type: "file", title: "File", files: [{ name: "A", time: 100 }] },
			{ type: "file", title: "File", files: [{ name: "A", sizeBytes: 1.5 }] },
			{ type: "file", title: "File", files: [{ name: "" }] },
			{ type: "file", title: "File", files: Array.from({ length: 201 }, () => ({ name: "A" })) },
			{ type: "event", title: "Event", start: 1000, end: 2000, timeZone: "Asia/Shanghai" },
			{ type: "digest", title: "Digest", coverageStart: 10, coverageEnd: 20 },
		]) {
			assert.equal(create.safeParse(bad).success, false, JSON.stringify(bad));
			await assert.rejects(write("create", null, bad), /invalid_request/, JSON.stringify(bad));
		}
		for (const changes of [
			{ type: "task" },
			{ people: ["A"] },
			{ summary: null },
			{ section: "Research" },
		])
			await assert.rejects(
				write("update", saved.id, { expectedRevision: 1, changes }),
				/invalid_request/,
			);
		const unchanged = await rpc(f.db, "sill_get_content", [saved.id]);
		assert.equal(unchanged.revision, 1);
		const updated = (
			await write("update", saved.id, {
				expectedRevision: 1,
				changes: { body: "Changed", state: { note: "Personal note" } },
			})
		).body;
		assert.equal(updated.body, "Changed");
		assert.equal(updated.state.note, "Personal note");
		assert.deepEqual(updated.authors, article.authors);
		// A full-card edit replaces the card: omitted fields are removed and unknown fields are rejected.
		const workspace = await rpc(f.db, "sill_get_workspace", []);
		const upsert = (card: unknown, key: string) =>
			rpc(f.db, "sill_apply_operations", [
				JSON.stringify({
					expectedRevision: workspace.revision,
					operations: [{ op: "card.upsert", card }],
				}),
				key,
			]);
		const replacement = {
			id: saved.id,
			type: "article",
			title: "Full replacement",
			body: "Replacement text",
		};
		await assert.rejects(
			upsert({ ...replacement, futureField: true }, "explicit_replace_bad"),
			/invalid_request/,
		);
		await upsert(replacement, "explicit_replace_01");
		const replaced = await rpc(f.db, "sill_get_content", [saved.id]);
		assert.equal(replaced.title, "Full replacement");
		assert.equal(replaced.authors, undefined);
		assert.equal(replaced.publishedAt, undefined);
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
		assert.equal((await patch({ summary: null }, "explicit_http_null")).status, 400);
		const changed = await patch(
			{ body: "Updated text", state: { note: "Private reader note" } },
			"explicit_http_change",
		);
		assert.equal(changed.status, 200);
		const changedCard = await changed.json();
		assert.equal(changedCard.body, "Updated text");
		assert.equal(changedCard.state.note, "Private reader note");
		assert.deepEqual(changedCard.authors, article.authors);

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
			{ type: "mail", title: "Wrong", recipients: ["Reader"] },
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
		const schema = JSON.stringify(creationTool?.inputSchema);
		assert.match(schema, /publishedAt/);
		assert.match(schema, /The first author is shown as the mail sender/);
		assert.doesNotMatch(schema, /readingEstimate|bodyCoverage|"sender"|"attachments"/);
		const result = await client.callTool({
			name: "sill_createContent",
			arguments: { idempotency_key: "explicit_mcp_01", body: article },
		});
		assert.equal(result.isError, undefined);
		const savedMCP = result.structuredContent as { id: string; revision: number };
		const changedMCP = await client.callTool({
			name: "sill_updateContent",
			arguments: {
				id: savedMCP.id,
				idempotency_key: "explicit_mcp_update",
				body: {
					expectedRevision: savedMCP.revision,
					changes: {
						body: "Updated through MCP",
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
		assert.equal(fetchedValue.body, "Updated through MCP");
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

test("shared invalid card fixtures are rejected by database full-card operations", async () => {
	const f = await cloudFixture();
	try {
		await identity(f.db);
		for (const [index, sample] of fixtures.invalid.entries()) {
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
