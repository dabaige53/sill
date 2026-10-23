import assert from "node:assert/strict";
import test from "node:test";
import { backupSnapshot } from "../../contracts/backup.ts";
import { openBackupSecret, sealBackupSecret } from "../../server/cloud/backup-vault.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
test("portable snapshots do not accept backup configuration or credentials", () => {
	const snapshot = {
		format: "sill-workspace",
		version: 1,
		owner,
		createdAt: new Date().toISOString(),
		workspace: { revision: 1, state: { cards: [], items: {}, preferences: {}, seconds: 2 } },
	};
	assert.ok(backupSnapshot.safeParse(snapshot).success);
	assert.ok(
		!backupSnapshot.safeParse({ ...snapshot, credentials: { password: "synthetic" } }).success,
	);
	assert.ok(!backupSnapshot.safeParse({ ...snapshot, targets: [] }).success);
});
test("encrypted credentials cannot be opened for another owner or target", async () => {
	const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
		"encrypt",
		"decrypt",
	]);
	const sealed = await sealBackupSecret(key, owner, id, "synthetic-password");
	assert.equal(await openBackupSecret(key, owner, id, sealed), "synthetic-password");
	await assert.rejects(
		openBackupSecret(key, "other", id, sealed),
		/backup_credentials_unavailable/,
	);
	await assert.rejects(
		openBackupSecret(key, owner, "other", sealed),
		/backup_credentials_unavailable/,
	);
});
