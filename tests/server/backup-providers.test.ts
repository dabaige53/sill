import assert from "node:assert/strict";
import test from "node:test";
import { backupProvider, backupText, webdavEndpoint } from "../../server/cloud/backup-providers.ts";
import { BackupRuntime } from "../../server/cloud/backup-runtime.ts";
import { backupDigest } from "../../server/cloud/backup-service.ts";
import { backupEncryptionKey, sealBackupSecret } from "../../server/cloud/backup-vault.ts";

const owner = "11111111-1111-4111-8111-111111111111",
	targetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("WebDAV confines credentials to approved HTTPS destination and rejects redirects", async () => {
	for (const endpoint of [
		"http://dav.jianguoyun.com/dav/",
		"https://user:secret@dav.jianguoyun.com/dav/",
		"https://127.0.0.1/",
		"https://dav.jianguoyun.com/dav/?secret=x",
	])
		assert.throws(() => webdavEndpoint(endpoint, ["dav.jianguoyun.com"]));
	const calls: any[] = [];
	const send = async (url: any, init: any) => {
		calls.push({ url: String(url), init });
		return new Response(init.method === "PROPFIND" ? "" : init.method === "PUT" ? "" : "snapshot", {
			status: init.method === "PROPFIND" ? 207 : 200,
		});
	};
	const provider = backupProvider(
		{ provider: "webdav", endpoint: "https://dav.jianguoyun.com/dav/Sill" },
		{ username: "synthetic", password: "test-only" },
		owner,
		{},
		send as any,
	);
	await provider.check();
	await provider.write("test-id", null, "snapshot");
	assert.equal(await provider.read("test-id", null), "snapshot");
	assert.equal(calls[0].init.headers.Depth, "0");
	assert.equal(calls[1].init.headers["If-None-Match"], "*");
	assert.ok(calls[1].url.endsWith(`sill-${owner}-test-id.json`));
	assert.ok(calls.every((c) => c.init.redirect === "error"));
	assert.ok(calls.every((c) => !c.url.includes("test-only")));
});
test("R2 signs S3 requests with configured bucket and no retrying transport", async () => {
	let call: any;
	const provider = backupProvider(
		{ provider: "r2", accountId: "a".repeat(32), bucket: "synthetic-bucket" },
		{ accessKeyId: "synthetic", secretAccessKey: "test-only" },
		owner,
		{},
		async (url, init) => {
			call = { url: String(url), init };
			return new Response("ok");
		},
	);
	await provider.write("backup-id", null, "snapshot");
	assert.ok(
		call.url.startsWith(
			"https://" + "a".repeat(32) + ".r2.cloudflarestorage.com/synthetic-bucket/",
		),
	);
	assert.match(call.init.headers.get("authorization"), /^AWS4-HMAC-SHA256 /);
	assert.equal(call.init.redirect, "error");
	assert.equal(call.init.body, "snapshot");
});
test("unknown upload is verified using same reserved object; corrupt bytes never restore", async () => {
	const key = "a".repeat(64),
		id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
	const sealed = await sealBackupSecret(
		await backupEncryptionKey(key),
		owner,
		targetId,
		JSON.stringify({ username: "synthetic", password: "private-test" }),
	);
	const content = JSON.stringify({
		format: "sill-workspace",
		version: 1,
		owner,
		createdAt: new Date().toISOString(),
		workspace: { revision: 1, state: { cards: [], items: {}, preferences: {}, seconds: 4 } },
	});
	let row: any = null,
		remote: string | null = null,
		writes = 0,
		restores = 0;
	const repo: any = {
		workspace: async () => ({
			revision: 2,
			state: { cards: [], items: {}, preferences: {}, seconds: 5 },
		}),
		rpc: async (_name: string, { op, p }: any) => {
			if (op === "target")
				return {
					config: { provider: "webdav", endpoint: "https://dav.jianguoyun.com/dav/" },
					sealed,
				};
			if (op === "by_key") return row;
			if (op === "reserve") {
				row = {
					id,
					target_id: targetId,
					content,
					digest: await backupDigest(content),
					status: "pending",
					remote_id: null,
				};
				return row;
			}
			if (op === "read") return row;
			if (op === "ready") {
				row.status = "ready";
				return row;
			}
			if (op === "restore_status") return null;
			if (op === "restore") {
				restores++;
				return { restored: true };
			}
			throw Error(op);
		},
	};
	const runtime = new BackupRuntime(owner, repo, { backupEncryptionKey: key }, () => ({
		allocate: async () => null,
		check: async () => {},
		read: async () => remote,
		write: async (_id, _remote, text) => {
			writes++;
			remote = text;
			throw Error("connection lost after upload");
		},
	}));
	await assert.rejects(runtime.create(targetId, "synthetic-create-key"), /backup_unknown/);
	const result = await runtime.create(targetId, "synthetic-create-key");
	assert.equal(result.status, "ready");
	assert.equal(writes, 1);
	const preview = await runtime.preview(id);
	remote = content + " ";
	await assert.rejects(
		runtime.restore({
			backupId: id,
			digest: preview.digest,
			expectedRevision: 2,
			confirmed: true,
			idempotencyKey: "synthetic-restore-key",
		}),
		/revision_conflict/,
	);
	assert.equal(restores, 0);
	remote = null;
	row.status = "pending";
	const denied = new BackupRuntime(owner, repo, { backupEncryptionKey: key }, () => ({
		allocate: async () => null,
		check: async () => {},
		read: async () => null,
		write: async () => {
			throw Object.assign(new Error("backup_auth_failed"), {
				code: "backup_auth_failed",
				status: 403,
			});
		},
	}));
	await assert.rejects(denied.create(targetId, "synthetic-create-key"), /backup_auth_failed/);
});
