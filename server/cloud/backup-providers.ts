import { AwsClient } from "aws4fetch";
import type { BackupTarget } from "../../contracts/backup.ts";
import { serviceError } from "./supabase-repository.ts";
export const backupMaxBytes = 32 * 1024 * 1024;
export async function backupText(response: Response) {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > backupMaxBytes) throw serviceError("invalid_request");
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	const all = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		all.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(all);
}
export function webdavEndpoint(value: string, hosts: string[]) {
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.port ||
		!hosts.includes(url.hostname) ||
		/%2f|%5c|%2e/i.test(url.pathname)
	)
		throw serviceError("invalid_request");
	url.pathname = url.pathname.replace(/\/?$/, "/");
	return url;
}
export interface BackupProvider {
	check(): Promise<void>;
	allocate(): Promise<string | null>;
	read(id: string, remote: string | null): Promise<string | null>;
	write(id: string, remote: string | null, content: string): Promise<void>;
}
export function backupProvider(
	target: BackupTarget,
	secret: any,
	owner: string,
	config: any,
	send: typeof fetch = fetch,
): BackupProvider {
	async function request(url: string | URL, init: RequestInit = {}) {
		const response = await send(url, {
			...init,
			redirect: "error",
			signal: AbortSignal.timeout(30000),
		});
		if (response.status === 401 || response.status === 403)
			throw serviceError("backup_auth_failed", 403);
		return response;
	}
	const dav =
		target.provider === "webdav"
			? webdavEndpoint(target.endpoint, config.backupWebdavHosts || ["dav.jianguoyun.com"])
			: null;
	const aws =
		target.provider === "r2"
			? new AwsClient({
					accessKeyId: secret.accessKeyId,
					secretAccessKey: secret.secretAccessKey,
					service: "s3",
					region: "auto",
					retries: 0,
				})
			: null;
	function location(id: string) {
		const name = `sill-${owner}-${id}.json`;
		return dav
			? new URL(name, dav)
			: new URL(
					`https://${(target as any).accountId}.r2.cloudflarestorage.com/${(target as any).bucket}/${name}`,
				);
	}
	async function object(url: URL, init: RequestInit = {}) {
		if (aws) {
			const signed = await aws.sign(url.href, init);
			return request(signed.url, {
				method: signed.method,
				headers: signed.headers,
				body: init.body,
			});
		}
		const encoded = btoa(
			String.fromCharCode(...new TextEncoder().encode(`${secret.username}:${secret.password}`)),
		);
		return request(url, {
			...init,
			headers: { Authorization: "Basic " + encoded, ...init.headers },
		});
	}
	return {
		async check() {
			const r = await object(
				dav ||
					new URL(
						`https://${(target as any).accountId}.r2.cloudflarestorage.com/${(target as any).bucket}`,
					),
				dav ? { method: "PROPFIND", headers: { Depth: "0" } } : { method: "HEAD" },
			);
			if (!r.ok) throw serviceError("unavailable");
			await r.body?.cancel();
		},
		async allocate() {
			return null;
		},
		async read(id, remote) {
			const r = await object(location(id));
			if (r.status === 404) {
				await r.body?.cancel();
				return null;
			}
			if (!r.ok) throw serviceError("unavailable");
			return backupText(r);
		},
		async write(id, remote, content) {
			const r = await object(location(id), {
				method: "PUT",
				headers: { "Content-Type": "application/json", "If-None-Match": "*" },
				body: content,
			});
			// Conflict can mean the same deterministic object was already uploaded. Caller verifies bytes.
			if (!r.ok && r.status !== 409 && r.status !== 412) throw serviceError("backup_unknown", 503);
			await r.body?.cancel();
		},
	};
}
