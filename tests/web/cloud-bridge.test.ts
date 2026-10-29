import assert from "node:assert/strict";
import test from "node:test";
import {
	hostInitializeResult,
	readCloudResult,
	readWhenReady,
} from "../../apps/web/cloud-bridge.ts";

test("MCP validation and expired cursors remain definite client errors, not unknown writes", async () => {
	for (const [code, status] of [
		["invalid_request", 400],
		["cursor_expired", 410],
	] as const) {
		for (const structured of [false, true]) {
			let calls = 0;
			const value = { error: { code, message: "Untrusted error detail" } };
			await assert.rejects(
				readWhenReady(
					async () => {
						calls++;
						return readCloudResult({
							isError: true,
							...(structured ? { structuredContent: value } : {}),
							content: [{ type: "text", text: JSON.stringify(value) }],
						});
					},
					{ name: "sill_getWorkspace" },
					{ sleep: async () => assert.fail("must not retry") },
				),
				(error: any) =>
					error.code === code && error.status === status && !error.message.includes("Untrusted"),
			);
			assert.equal(calls, 1);
		}
	}
});

test("malformed or unavailable MCP results remain uncertain and successful content is preserved", () => {
	assert.throws(
		() => readCloudResult({ isError: true, content: [{ type: "text", text: "not JSON" }] }),
		{ code: "unavailable", status: 503 },
	);
	assert.throws(() => readCloudResult({ content: [] }), { status: 503 });
	const record = { id: "card-a", revision: 4, body: ["Preserve the record"] };
	assert.equal(readCloudResult({ structuredContent: record }), record);
});

test("initialization preserves composer attachment capabilities", () => {
	const parsed = hostInitializeResult.parse({
		protocolVersion: "2026-01-26",
		hostInfo: { name: "fixture", version: "1" },
		hostCapabilities: {
			experimental: { "openai/modelContext": {} },
			updateModelContext: { text: {} },
		},
		hostContext: {},
	});
	assert.ok(parsed.hostCapabilities.experimental["openai/modelContext"]);
});
