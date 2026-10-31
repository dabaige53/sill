import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, B, resource } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

test("official MCP client discovers/calls ten contracts over authenticated stateless HTTP", async () => {
	const f = await cloudFixture();
	let client: any;
	try {
		await f.db.exec(
			`insert into sill_private.caller_grants values('${A}','oauth:codex-test',array['content:read','content:write','content:delete','event:read','event:submit'],array['*'],'${resource}');`,
		);
		await f.db.exec(
			`insert into sill_private.destinations values('${A}','agent','oauth:codex-test',array['summarize'],true);`,
		);
		const runtime = createSillRuntime(
			{ ...f.config, mcpEnabled: true },
			{ clientFactory: f.factory },
		);
		const unauth = await runtime(new Request(resource, { method: "POST" }));
		assert.equal(unauth.status, 401);
		assert.match(unauth.headers.get("www-authenticate"), /oauth-protected-resource\/mcp/);
		const metadata = await runtime(
			new Request(f.config.appOrigin + "/.well-known/oauth-protected-resource/mcp"),
		);
		assert.equal((await metadata.json()).resource, resource);
		for (const [jwt, status] of [
			[token(), 401],
			[token({ client_id: "unknown", aud: resource }), 403],
			[token({ client_id: "codex-test", aud: "wrong" }), 401],
			[token({ client_id: "codex-test", aud: resource, exp: 1 }), 401],
		]) {
			assert.equal(
				(
					await runtime(
						new Request(resource, { method: "POST", headers: { Authorization: "Bearer " + jwt } }),
					)
				).status,
				status,
			);
		}
		const transport = new StreamableHTTPClientTransport(new URL(resource), {
			requestInit: {
				headers: { Authorization: "Bearer " + token({ client_id: "codex-test", aud: resource }) },
			},
			fetch: (url?: any, init?: any) => runtime(new Request(url, init)),
		});
		client = new Client({ name: "synthetic-codex-test", version: "1.0.0" });
		await client.connect(transport);
		const list = await client.listTools();
		assert.equal(list.tools.length, 10);
		const hints = Object.fromEntries(list.tools.map((t?: any) => [t.name, t.annotations]));
		assert.equal(hints.sill_getContent.readOnlyHint, true);
		assert.equal(hints.sill_searchContents.readOnlyHint, true);
		assert.equal(hints.sill_createContent.destructiveHint, false);
		assert.equal(hints.sill_submitEvent.destructiveHint, false);
		assert.equal(hints.sill_updateContent.destructiveHint, true);
		assert.equal(hints.sill_deleteContent.destructiveHint, true);
		const args: Record<string, any> = {
			idempotency_key: "mcp_create1",
			body: {
				type: "note",
				title: "MCP same database",
				body: "Synthetic MCP content",
				summary: "Rich preview",
				form: "quote",
				sources: [{ name: "Test agent", kind: "agent" }],
			},
		};
		const created = await client.callTool({ name: "sill_createContent", arguments: args });
		assert.ok(!created.isError, JSON.stringify(created));
		const one = created.structuredContent;
		assert.equal(created.content.length, 1, "a complete note gets no missing-field hint");
		assert.equal(one.summary, "Rich preview");
		assert.equal(one.form, "quote");
		assert.deepEqual(one.sources, args.body.sources);
		assert.equal(
			(await client.callTool({ name: "sill_createContent", arguments: args })).structuredContent.id,
			one.id,
		);
		assert.equal(
			(await client.callTool({ name: "sill_getContent", arguments: { id: one.id } }))
				.structuredContent.title,
			"MCP same database",
		);
		assert.equal(
			(await client.callTool({ name: "sill_listContents", arguments: {} })).structuredContent
				.items[0].id,
			one.id,
		);
		const found = (
			await client.callTool({ name: "sill_searchContents", arguments: { query: "same DATABASE" } })
		).structuredContent;
		assert.equal(found.total, 1);
		assert.equal(found.items[0].id, one.id);
		assert.equal(found.items[0].summary, "Rich preview");
		assert.equal("body" in found.items[0], false);
		const httpFound = await runtime(
			new Request(f.config.appOrigin + "/api/v1/search?query=same&limit=5", {
				headers: { Cookie: "__Host-sill-access=" + token() },
			}),
		);
		assert.deepEqual(await httpFound.json(), found);
		const noSummary = await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "mcp_no_summary",
				body: { type: "note", title: "No summary", body: "Text" },
			},
		});
		assert.equal(noSummary.isError, true);
		assert.deepEqual(noSummary.structuredContent, JSON.parse(noSummary.content[0].text));
		assert.deepEqual(JSON.parse(noSummary.content[0].text).error.issues, [
			{ path: "body.summary", message: "missing_summary" },
		]);
		const bare = await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "mcp_bare_article",
				body: { type: "article", title: "Bare article", summary: "Only a title.", body: "Text" },
			},
		});
		assert.ok(!bare.isError);
		assert.match(bare.content[1].text, /\(article\): url, authors, publishedAt, sources/);
		const snapshot = await client.callTool({ name: "sill_getWorkspace", arguments: {} });
		assert.equal(snapshot.structuredContent.state.cards[0].id, one.id);
		const applied = await client.callTool({
			name: "sill_applyOperations",
			arguments: {
				idempotency_key: "mcp-workspace-apply",
				body: {
					operations: [{ op: "preferences.patch", values: { theme: "dark" } }],
					expectedRevision: snapshot.structuredContent.revision,
				},
			},
		});
		assert.equal(applied.structuredContent.state.preferences.theme, "dark");
		const httpSnapshot = await runtime(
			new Request(f.config.appOrigin + "/api/v1/workspace", {
				headers: { Cookie: "__Host-sill-access=" + token() },
			}),
		);
		assert.deepEqual(await httpSnapshot.json(), applied.structuredContent);
		const compact = (
			await client.callTool({ name: "sill_getWorkspace", arguments: { compact: true } })
		).structuredContent;
		const full = (await client.callTool({ name: "sill_getWorkspace", arguments: {} }))
			.structuredContent;
		assert.equal(compact.compact, true);
		assert.equal(compact.revision, full.revision);
		assert.equal(compact.state.cards.length, full.state.cards.length);
		const indexed = compact.state.cards.find((card: any) => card.id === one.id);
		assert.equal("body" in indexed, false);
		assert.equal(indexed.bodyChars, [...one.body].length);
		const misuse = await client.callTool({
			name: "sill_applyOperations",
			arguments: {
				idempotency_key: "mcp-compact-misuse",
				body: {
					operations: [
						{
							op: "card.upsert",
							card: { id: one.id, type: "note", title: "Overwrite", summary: "x" },
							before: indexed,
						},
					],
				},
			},
		});
		assert.equal(misuse.isError, true);
		assert.equal(JSON.parse(misuse.content[0].text).error.code, "invalid_request");
		const beforeOwnerCheck = (await client.callTool({ name: "sill_getWorkspace", arguments: {} }))
			.structuredContent;
		for (const [name, args] of [
			["sill_getWorkspace", {}],
			["sill_listContents", {}],
			["sill_searchContents", { query: "MCP" }],
			["sill_getContent", { id: one.id }],
			["sill_getEvent", { id: "not-created" }],
		] as Array<[string, Record<string, any>]>) {
			const readDenied = await client.callTool({ name, arguments: { ...args, expected_owner: B } });
			assert.equal(readDenied.isError, true);
			assert.equal(JSON.parse(readDenied.content[0].text).error.code, "forbidden");
		}
		const wrongOwnerCalls: Array<[string, Record<string, any>]> = [
			["sill_createContent", args],
			[
				"sill_updateContent",
				{
					id: one.id,
					idempotency_key: "owner-update-key",
					body: { expectedRevision: one.revision, changes: { title: "Wrong account" } },
				},
			],
			[
				"sill_deleteContent",
				{
					id: one.id,
					idempotency_key: "owner-delete-key",
					body: { expectedRevision: one.revision },
				},
			],
			[
				"sill_applyOperations",
				{
					idempotency_key: "owner-apply-key",
					body: { operations: [{ op: "reading.add", seconds: 10 }] },
				},
			],
			[
				"sill_submitEvent",
				{
					idempotency_key: "owner-event-key",
					body: {
						event_id: "wrong-owner-event",
						card_id: one.id,
						card_version: one.revision,
						action: "summarize",
						destination_ref: "agent",
					},
				},
			],
		];
		for (const [name, argumentsValue] of wrongOwnerCalls) {
			const denied = await client.callTool({
				name,
				arguments: { ...argumentsValue, expected_owner: B },
			});
			assert.equal(denied.isError, true);
			assert.equal(JSON.parse(denied.content[0].text).error.code, "forbidden");
		}
		assert.deepEqual(
			(await client.callTool({ name: "sill_getWorkspace", arguments: {} })).structuredContent,
			beforeOwnerCheck,
		);
		assert.equal(
			(
				await client.callTool({
					name: "sill_createContent",
					arguments: { ...args, expected_owner: A },
				})
			).structuredContent.id,
			one.id,
		);
		const ev = await client.callTool({
			name: "sill_submitEvent",
			arguments: {
				idempotency_key: "mcp_event_1",
				body: {
					event_id: "mcp_event",
					card_id: one.id,
					card_version: 1,
					action: "summarize",
					destination_ref: "agent",
				},
			},
		});
		assert.equal(ev.structuredContent.outcome, "pending");
		assert.equal(
			(await client.callTool({ name: "sill_getEvent", arguments: { id: "mcp_event" } }))
				.structuredContent.delivery,
			"queued",
		);
		const temporary = await client.callTool({
			name: "sill_createContent",
			arguments: { ...args, idempotency_key: "mcp_temp_1" },
		});
		assert.equal(
			(
				await client.callTool({
					name: "sill_deleteContent",
					arguments: {
						id: temporary.structuredContent.id,
						idempotency_key: "mcp_delete1",
						body: { expectedRevision: 1 },
					},
				})
			).structuredContent.deleted,
			true,
		);
		const sessionCookie = "__Host-sill-access=" + token();
		const web = await runtime(
			new Request(f.config.appOrigin + "/api/v1/contents/" + one.id, {
				headers: { Cookie: sessionCookie },
			}),
		);
		assert.equal((await web.json()).id, one.id);
		const changed = await client.callTool({
			name: "sill_updateContent",
			arguments: {
				id: one.id,
				idempotency_key: "mcp_update1",
				body: { expectedRevision: 1, changes: { title: "MCP changed" } },
			},
		});
		assert.equal(changed.structuredContent.revision, 2);
		const stale = await client.callTool({
			name: "sill_updateContent",
			arguments: {
				id: one.id,
				idempotency_key: "mcp_update2",
				body: { expectedRevision: 1, changes: { title: "Stale" } },
			},
		});
		assert.equal(stale.isError, true);
		assert.equal(JSON.parse(stale.content[0].text).error.code, "revision_conflict");
		assert.deepEqual(stale.structuredContent, JSON.parse(stale.content[0].text));
		const beforeBatch = (
			await client.callTool({ name: "sill_getContent", arguments: { id: one.id } })
		).structuredContent;
		const failedBatch = await client.callTool({
			name: "sill_applyOperations",
			arguments: {
				idempotency_key: "mcp-atomic-conflict",
				body: {
					operations: [
						{
							op: "item.patch",
							id: one.id,
							values: { bookmarked: true },
							before: { bookmarked: false },
						},
						{
							op: "item.patch",
							id: one.id,
							values: { later: false },
							before: { later: true },
						},
					],
				},
			},
		});
		assert.equal(failedBatch.isError, true);
		assert.equal(failedBatch.structuredContent.error.code, "revision_conflict");
		assert.deepEqual(failedBatch.structuredContent, JSON.parse(failedBatch.content[0].text));
		assert.deepEqual(
			(await client.callTool({ name: "sill_getContent", arguments: { id: one.id } }))
				.structuredContent,
			beforeBatch,
		);
		const bad = await client.callTool({
			name: "sill_createContent",
			arguments: { ...args, body: { ...args.body, owner_id: A } },
		});
		assert.equal(bad.isError, true);
		assert.deepEqual(bad.structuredContent, JSON.parse(bad.content[0].text));
		// Agents must see which field was rejected, not only invalid_request.
		const rejected = JSON.parse(bad.content[0].text).error;
		assert.equal(rejected.code, "invalid_request");
		assert.ok(rejected.issues.some((issue?: any) => issue.message.includes("owner_id")));
		const event = await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "mcp_bad_event",
				body: { type: "event", title: "Bad span", start: 10, end: 5 },
			},
		});
		assert.ok(JSON.parse(event.content[0].text).error.issues.length > 0);
		await f.db.exec(
			`reset role;update sill_private.caller_grants set scopes=array['content:read'],resources=array['${one.id}'] where caller_id='oauth:codex-test';`,
		);
		const restricted = await client.listTools();
		assert.deepEqual(
			restricted.tools.map((t?: any) => t.name),
			["sill_getContent"],
		);
		assert.equal(
			(await client.callTool({ name: "sill_createContent", arguments: args })).isError,
			true,
		);
		assert.equal(
			(await client.callTool({ name: "sill_getContent", arguments: { id: one.id } }))
				.structuredContent.revision,
			2,
		);
	} finally {
		await client?.close();
		await f.close();
	}
});
