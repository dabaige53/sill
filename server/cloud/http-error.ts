import { z } from "zod/v4";
import { headers, json } from "./http-response.ts";

const alias: Record<string, string> = {
	idempotency_expired: "idempotency_conflict",
	event_terminal_conflict: "revision_conflict",
};
const codes = new Set([
	"invalid_request",
	"unauthenticated",
	"forbidden",
	"not_found",
	"revision_conflict",
	"idempotency_conflict",
	"cursor_expired",
	"rate_limited",
	"backup_auth_failed",
	"backup_unknown",
	"unavailable",
]);

/** Safe error body shared by HTTP and MCP. Validation failures name the rejected input paths. */
export function errorResult(error: any) {
	const invalid = error instanceof z.ZodError;
	const raw = invalid ? "invalid_request" : alias[error?.code] || error?.code;
	const known = codes.has(raw);
	const code = known ? raw : "unavailable";
	const issues = invalid
		? error.issues.slice(0, 20).map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message.slice(0, 300),
			}))
		: undefined;
	return {
		known,
		body: {
			error: { code, message: code, request_id: crypto.randomUUID(), ...(issues && { issues }) },
		},
	};
}

/** Map runtime failures to safe JSON or the browser callback recovery page. */
export function httpErrorResponse(request: Request, appOrigin: string, error: any): Response {
	// Browser recovery does not clear an existing session or accept a failed code.
	const failedUrl = new URL(request.url);
	if (
		failedUrl.origin === appOrigin &&
		failedUrl.pathname === "/auth/callback" &&
		request.method === "GET" &&
		request.headers.get("accept")?.includes("text/html")
	) {
		return new Response(null, {
			status: 303,
			headers: {
				...headers,
				Location:
					appOrigin +
					"/auth/recovery?reason=" +
					(failedUrl.searchParams.get("error") === "access_denied"
						? "cancelled"
						: error.status === 403
							? "forbidden"
							: error.status >= 500
								? "unavailable"
								: "expired"),
			},
		});
	}
	const { body, known } = errorResult(error);
	const status = error instanceof z.ZodError ? 400 : known ? error.status || 503 : 503;
	return json(status, body);
}
