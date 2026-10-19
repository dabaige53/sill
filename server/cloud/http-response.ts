import { serviceError } from "./supabase-repository.ts";

export const headers = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
};
export const verifierName = "__Host-sill-pkce",
	cooldownName = "__Host-sill-login-until";
export const setupName = "__Host-sill-password-setup";
export const resendSeconds = 60;
export const cookie = (name?: any, value?: any, maxAge?: any) =>
	`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`;
export const json = (status?: any, data?: any, extra: any = {}) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra },
	});
export async function body(request?: any) {
	if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
		throw serviceError("invalid_request", 415);
	const reader = request.body?.getReader();
	if (!reader) throw serviceError("invalid_request");
	let size = 0;
	const chunks = [];
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > 524288) {
			await reader.cancel();
			throw serviceError("invalid_request", 413);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.length;
	}
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw serviceError("invalid_request");
	}
}
export function sameOrigin(request?: any, origin?: any) {
	if (
		request.headers.get("origin") !== origin ||
		request.headers.get("sec-fetch-site") === "cross-site"
	)
		throw serviceError("forbidden");
}
