import { z } from "zod/v4";
import { create, event, revision, update, workspaceBatch } from "../../contracts/cloud.ts";
import { body, json } from "./http-response.ts";
import { type SupabaseRepository, serviceError } from "./supabase-repository.ts";

/** Content routes receive an already authenticated and owner-checked repository. */
export async function contentHttp(
	request: Request,
	repository: SupabaseRepository,
): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;
	const content = /^\/api\/v1\/contents\/([\w-]{1,100})$/.exec(path),
		eventPath = /^\/api\/v1\/events\/([\w-]{1,100})$/.exec(path);
	if (request.method === "GET") {
		if (path === "/api/v1/workspace") {
			if (url.search) throw serviceError("invalid_request");
			return json(200, await repository.workspace());
		}
		if (path === "/api/v1/contents") {
			const query = z
				.object({
					cursor: z.string().min(1).max(2048).optional(),
					since: z.string().min(1).max(2048).optional(),
					limit: z
						.string()
						.regex(/^(?:[1-9][0-9]?|100)$/)
						.transform(Number)
						.optional(),
				})
				.strict()
				.parse(Object.fromEntries(url.searchParams));
			return json(200, await repository.list(query));
		}
		if (url.search) throw serviceError("invalid_request");
		if (content) return json(200, await repository.get(content[1]));
		if (eventPath) return json(200, await repository.getEvent(eventPath[1]));
	}
	const key = request.headers.get("idempotency-key");
	if (path === "/api/v1/workspace/operations" && request.method === "POST") {
		if (url.search || !/^[\w-]{8,128}$/.test(key || "")) throw serviceError("invalid_request");
		return json(
			200,
			await repository.applyOperations(workspaceBatch.parse(await body(request)), key),
		);
	}
	let op: any,
		payload: any,
		resource = null;
	if (request.method === "POST" && path === "/api/v1/contents") {
		op = "create";
		payload = create.parse(await body(request));
	} else if (request.method === "PATCH" && content) {
		op = "update";
		resource = content[1];
		payload = update.parse(await body(request));
	} else if (request.method === "DELETE" && content) {
		op = "delete";
		resource = content[1];
		payload = z
			.object({ expectedRevision: revision })
			.strict()
			.parse(await body(request));
	} else if (request.method === "POST" && path === "/api/v1/events") {
		op = "submit_event";
		payload = event.parse(await body(request));
	}
	if (op) {
		if (!/^[\w-]{8,128}$/.test(key || "")) throw serviceError("invalid_request");
		const result = await repository.write(op, resource, payload, key);
		return json(result.status_code, result.body);
	}
	throw serviceError("not_found");
}
