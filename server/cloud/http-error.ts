import { z } from "zod/v4";
import { headers, json } from "./http-response.ts";

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
	const alias = {
		idempotency_expired: "idempotency_conflict",
		event_terminal_conflict: "revision_conflict",
	};
	const known = new Set<any>([
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
	const raw = error instanceof z.ZodError ? "invalid_request" : alias[error.code] || error.code;
	const code = known.has(raw) ? raw : "unavailable";
	const status = error instanceof z.ZodError ? 400 : known.has(raw) ? error.status || 503 : 503;
	return json(status, { error: { code, message: code, request_id: crypto.randomUUID() } });
}
