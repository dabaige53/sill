import { z } from "zod/v4";
import { backupId, backupKey } from "../../contracts/backup.ts";
import { BackupRuntime } from "./backup-runtime.ts";
import { body, json } from "./http-response.ts";
import { serviceError } from "./supabase-repository.ts";
export async function backupHttp(request: Request, identity: any, repo: any, config: any) {
	const url = new URL(request.url),
		path = url.pathname,
		method = request.method;
	const runtime = new BackupRuntime(identity.principal.userId, repo, config);
	const browserOnly = () => {
		if (request.headers.has("authorization")) throw serviceError("forbidden");
	};
	if (url.search) throw serviceError("invalid_request");
	if (path === "/api/v1/backups" && method === "GET") return json(200, await runtime.list());
	if (path === "/api/v1/backups/targets" && method === "POST") {
		browserOnly();
		return json(200, await runtime.save(await body(request)));
	}
	if (path === "/api/v1/backups" && method === "POST") {
		const p = z
			.object({ targetId: backupId, idempotencyKey: backupKey })
			.strict()
			.parse(await body(request));
		return json(200, await runtime.create(p.targetId, p.idempotencyKey));
	}
	if (path === "/api/v1/backups/restore" && method === "POST")
		return json(200, await runtime.restore(await body(request)));
	if (path === "/api/v1/backups/restore/status" && method === "POST")
		return json(200, { result: await runtime.status(await body(request)) });
	const target = /^\/api\/v1\/backups\/targets\/([\w-]+)\/check$/.exec(path);
	if (target && method === "POST") return json(200, await runtime.checkTarget(target[1]));
	const item = /^\/api\/v1\/backups\/([\w-]+)\/(preview|download|check)$/.exec(path);
	if (item && method === "GET") {
		if (item[2] === "preview") return json(200, await runtime.preview(item[1]));
		if (item[2] === "check") return json(200, await runtime.check(item[1]));
		const { content } = await runtime.read(item[1]);
		return new Response(content, {
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="sill-${item[1]}.json"`,
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	}
	throw serviceError("not_found");
}
