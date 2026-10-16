import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, resource } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

test("official MCP client discovers/calls seven contracts over authenticated stateless HTTP", async () => {
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
		assert.equal(list.tools.length, 7);
		const args: Record<string, any> = {
			idempotency_key: "mcp_create1",
			body: { type: "note", title: "MCP same database", body: ["Synthetic MCP content"] },
		};
		const created = await client.callTool({ name: "sill_createContent", arguments: args });
		assert.ok(!created.isError, JSON.stringify(created));
		const one = created.structuredContent;
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
		const bad = await client.callTool({
			name: "sill_createContent",
			arguments: { ...args, body: { ...args.body, owner_id: A } },
		});
		assert.equal(bad.isError, true);
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
