import assert from "node:assert/strict";
import test from "node:test";
import { createCloudTransport } from "../../apps/web/cloud-bridge.ts";

test("embedded backup actions retain account and confirmation while excluding credential setup", async () => {
	const calls: any[] = [];
	const request = createCloudTransport(async (call) => {
		calls.push(call);
		return { result: null };
	});
	const headers = { "X-Sill-Owner": "owner-a" };
	const body = {
		backupId: "backup-a",
		digest: "a".repeat(64),
		expectedRevision: 7,
		confirmed: true,
		idempotencyKey: "restore-key",
	};
	await request("/api/v1/backups", { headers });
	await request("/api/v1/backups/backup-a/download", { headers });
	await request("/api/v1/backups/targets/target-a/check", { headers, method: "POST" });
	await request("/api/v1/backups/restore/status", {
		headers,
		method: "POST",
		body: JSON.stringify(body),
	});
	await request("/api/v1/backups/restore", { headers, method: "POST", body: JSON.stringify(body) });
	assert.deepEqual(
		calls.map((call) => call.name),
		[
			"sill_listBackups",
			"sill_getBackup",
			"sill_checkBackupTarget",
			"sill_getRestoreStatus",
			"sill_restoreBackup",
		],
	);
	assert.deepEqual(calls[4].arguments, { ...body, expected_owner: "owner-a" });
	assert.ok(calls.every((call) => call.arguments.expected_owner === "owner-a"));
	await assert.rejects(
		request("/api/v1/backups/targets", {
			method: "POST",
			body: JSON.stringify({ password: "synthetic-only" }),
		}),
	);
	assert.equal(calls.length, 5);
});
