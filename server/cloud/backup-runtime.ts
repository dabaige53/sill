import {
	backupId,
	backupKey,
	backupRestoreRequest,
	backupSetup,
	backupSnapshot,
	backupTarget,
} from "../../contracts/backup.ts";
import { type BackupProvider, backupProvider } from "./backup-providers.ts";
import { backupDigest } from "./backup-service.ts";
import { backupEncryptionKey, openBackupSecret, sealBackupSecret } from "./backup-vault.ts";
import { type SupabaseRepository, serviceError } from "./supabase-repository.ts";
export class BackupRuntime {
	private owner: string;
	private repo: SupabaseRepository;
	private config: any;
	private providerFactory: typeof backupProvider;
	constructor(
		owner: string,
		repo: SupabaseRepository,
		config: any,
		providerFactory = backupProvider,
	) {
		this.owner = owner;
		this.repo = repo;
		this.config = config;
		this.providerFactory = providerFactory;
	}
	rpc(op: string, p: any = {}) {
		return this.repo.rpc("sill_backup_operation", { op, p });
	}
	async list() {
		return this.rpc("list");
	}
	async target(id: string) {
		return this.rpc("target", { id: backupId.parse(id) });
	}
	async provider(id: string): Promise<BackupProvider> {
		const target = await this.target(id);
		const key = await backupEncryptionKey(this.config.backupEncryptionKey);
		const secret = JSON.parse(await openBackupSecret(key, this.owner, id, target.sealed));
		return this.providerFactory(backupTarget.parse(target.config), secret, this.owner, this.config);
	}
	async save(input: unknown) {
		const data = backupSetup.parse(input);
		const { id, username, password, accessKeyId, secretAccessKey, ...config } = data as any;
		return this.saveTarget(
			config,
			data.provider === "webdav" ? { username, password } : { accessKeyId, secretAccessKey },
			id,
		);
	}
	async saveTarget(config: any, secret: any, existingId?: string) {
		config = backupTarget.parse(config);
		const key = await backupEncryptionKey(this.config.backupEncryptionKey);
		const provider = this.providerFactory(config, secret, this.owner, this.config);
		await provider.check();
		const id = existingId ? backupId.parse(existingId) : crypto.randomUUID();
		return this.rpc("save_target", {
			id,
			config,
			sealed: await sealBackupSecret(key, this.owner, id, JSON.stringify(secret)),
		});
	}
	async checkTarget(id: string) {
		await (await this.provider(id)).check();
		return { connected: true };
	}
	async create(targetId: string, key: string) {
		backupId.parse(targetId);
		backupKey.parse(key);
		let row = await this.rpc("by_key", { key });
		if (row && row.target_id !== targetId) throw serviceError("idempotency_conflict");
		const provider = await this.provider(targetId);
		if (!row)
			row = await this.rpc("reserve", {
				id: crypto.randomUUID(),
				targetId,
				key,
				remoteId: await provider.allocate(),
			});
		if (row.status === "ready") return this.metadata(row);
		await this.verify(row, row.content);
		// A replay reads the fixed remote object before it writes the same immutable bytes.
		const previous = await provider.read(row.id, row.remote_id);
		if (previous !== null) {
			await this.verify(row, previous);
			return this.metadata(await this.rpc("ready", { id: row.id, digest: row.digest }));
		}
		try {
			await provider.write(row.id, row.remote_id, row.content);
		} catch (error) {
			if (error.code === "backup_auth_failed") throw error;
			throw serviceError("backup_unknown", 503);
		}
		try {
			return await this.check(row.id);
		} catch (error) {
			if (error.code === "revision_conflict") throw error;
			throw serviceError("backup_unknown", 503);
		}
	}
	metadata(row: any) {
		return {
			id: row.id,
			targetId: row.target_id,
			createdAt: row.created_at,
			status: row.status,
			digest: row.digest,
		};
	}
	async verify(row: any, content: string) {
		if ((await backupDigest(content)) !== row.digest) throw serviceError("revision_conflict");
		const snapshot = backupSnapshot.parse(JSON.parse(content));
		if (snapshot.owner !== this.owner) throw serviceError("forbidden");
		return snapshot;
	}
	async read(id: string) {
		const row = await this.rpc("read", { id: backupId.parse(id) });
		const provider = await this.provider(row.target_id);
		const content = await provider.read(id, row.remote_id);
		if (content === null) throw serviceError("not_found");
		const snapshot = await this.verify(row, content);
		return { row, snapshot, content };
	}
	async check(id: string) {
		const { row } = await this.read(id);
		return this.metadata(await this.rpc("ready", { id, digest: row.digest }));
	}
	async preview(id: string) {
		const { row, snapshot } = await this.read(id);
		const current = await this.repo.workspace();
		const oldIds = new Set<string>(current.state.cards.map((c: any) => c.id));
		const newIds = new Set(snapshot.workspace.state.cards.map((c) => c.id));
		return {
			backupId: id,
			digest: row.digest,
			expectedRevision: current.revision,
			createdAt: snapshot.createdAt,
			cards: newIds.size,
			added: [...newIds].filter((id) => !oldIds.has(id)).length,
			removed: [...oldIds].filter((id) => !newIds.has(id)).length,
			seconds: snapshot.workspace.state.seconds,
		};
	}
	async restore(input: unknown) {
		const request = backupRestoreRequest.parse(input);
		const previous = await this.rpc("restore_status", request);
		if (previous) return previous;
		const { row } = await this.read(request.backupId);
		if (row.digest !== request.digest) throw serviceError("revision_conflict");
		await this.rpc("ready", { id: row.id, digest: row.digest });
		return this.rpc("restore", request);
	}
	status(input: unknown) {
		return this.rpc("restore_status", backupRestoreRequest.parse(input));
	}
}
