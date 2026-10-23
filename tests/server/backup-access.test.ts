import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, B, resource } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

test("backup MCP exposes no credential input and credential setup rejects agent tokens", async () => {
	const f = await cloudFixture();
	let client: any;
	try {
		await f.db.exec(
			`insert into sill_private.caller_grants values('${A}','oauth:backup-test',array['content:read','content:write','content:delete'],array['*'],'${resource}')`,
		);
		const runtime = createSillRuntime(
			{ ...f.config, mcpEnabled: true, backupEncryptionKey: "a".repeat(64) },
			{ clientFactory: f.factory },
		);
		const bearer = "Bearer " + token({ client_id: "backup-test", aud: resource });
		client = new Client({ name: "backup-synthetic", version: "1" });
		await client.connect(
			new StreamableHTTPClientTransport(new URL(resource), {
				requestInit: { headers: { Authorization: bearer } },
				fetch: (url, init) => runtime(new Request(url, init)),
			}),
		);
		const tools = (await client.listTools()).tools.filter((t: any) =>
			/Backup|Restore/.test(t.name),
		);
		assert.equal(tools.length, 8);
		assert.ok(
			!/password|secretAccessKey|username/.test(
				JSON.stringify(tools.map((t: any) => t.inputSchema)),
			),
		);
		const forbidden = await runtime(
			new Request(f.config.appOrigin + "/api/v1/backups/targets", {
				method: "POST",
				headers: { Authorization: bearer, "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "webdav",
					endpoint: "https://dav.jianguoyun.com/dav/",
					username: "synthetic",
					password: "never-echo-this",
				}),
			}),
		);
		assert.equal(forbidden.status, 403);
		assert.ok(!(await forbidden.text()).includes("never-echo-this"));
		const invalid = await client.callTool({
			name: "sill_listBackups",
			arguments: { password: "never-echo-this" },
		});
		assert.equal(invalid.isError, true);
		assert.ok(!JSON.stringify(invalid).includes("never-echo-this"));
		assert.equal(
			(await client.callTool({ name: "sill_listBackups", arguments: { expected_owner: B } }))
				.isError,
			true,
		);
		await f.db.exec("reset role");
		await f.db.exec(
			`update sill_private.caller_grants set scopes=array['content:read'] where caller_id='oauth:backup-test'`,
		);
		const readOnly = (await client.listTools()).tools.filter((t: any) =>
			/Backup|Restore/.test(t.name),
		);
		assert.deepEqual(readOnly.map((t: any) => t.name).sort(), [
			"sill_checkBackupTarget",
			"sill_getBackup",
			"sill_listBackups",
			"sill_previewRestore",
		]);
	} finally {
		await client?.close();
		await f.db.close();
	}
});
