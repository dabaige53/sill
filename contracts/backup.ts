import { z } from "zod/v4";
import { workspaceSnapshot } from "./cloud.ts";

export const backupKey = z.string().regex(/^[\w-]{8,128}$/);
export const backupId = z.string().uuid();
export const backupSnapshot = z
	.object({
		format: z.literal("sill-workspace"),
		version: z.literal(1),
		owner: z.string().uuid(),
		createdAt: z.string().datetime({ offset: true }),
		workspace: workspaceSnapshot,
	})
	.strict();
export type BackupSnapshot = z.infer<typeof backupSnapshot>;
export const backupTarget = z.discriminatedUnion("provider", [
	z.object({ provider: z.literal("webdav"), endpoint: z.string().url().max(2048) }).strict(),
	z
		.object({
			provider: z.literal("r2"),
			accountId: z.string().regex(/^[a-f0-9]{32}$/),
			bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
		})
		.strict(),
]);
export type BackupTarget = z.infer<typeof backupTarget>;
// Secret setup is HTTP-only. These schemas are never registered as MCP inputs.
export const backupSetup = z.discriminatedUnion("provider", [
	z
		.object({
			id: backupId.optional(),
			provider: z.literal("webdav"),
			endpoint: z.string().url().max(2048),
			username: z.string().min(1).max(500),
			password: z.string().min(1).max(2000),
		})
		.strict(),
	z
		.object({
			id: backupId.optional(),
			provider: z.literal("r2"),
			accountId: z.string().regex(/^[a-f0-9]{32}$/),
			bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
			accessKeyId: z.string().min(1).max(256),
			secretAccessKey: z.string().min(1).max(512),
		})
		.strict(),
]);
export const backupRestoreRequest = z
	.object({
		backupId,
		expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		digest: z.string().regex(/^[a-f0-9]{64}$/),
		confirmed: z.literal(true),
		idempotencyKey: backupKey,
	})
	.strict();
export const backupToolInputs = {
	sill_checkBackupTarget: z
		.object({ expected_owner: z.string().uuid().optional(), targetId: backupId })
		.strict(),
	sill_getBackup: z.object({ expected_owner: z.string().uuid().optional(), backupId }).strict(),
	sill_getRestoreStatus: backupRestoreRequest.extend({
		expected_owner: z.string().uuid().optional(),
	}),
	sill_listBackups: z.object({ expected_owner: z.string().uuid().optional() }).strict(),
	sill_createBackup: z
		.object({
			expected_owner: z.string().uuid().optional(),
			targetId: backupId,
			idempotencyKey: backupKey,
		})
		.strict(),
	sill_previewRestore: z
		.object({ expected_owner: z.string().uuid().optional(), backupId })
		.strict(),
	sill_restoreBackup: backupRestoreRequest.extend({ expected_owner: z.string().uuid().optional() }),
	sill_checkBackup: z.object({ expected_owner: z.string().uuid().optional(), backupId }).strict(),
};
