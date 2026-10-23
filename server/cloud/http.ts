import { createClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { create, event, revision, update, workspaceBatch } from "../../contracts/cloud.ts";
import { remindersWorker } from "../../contracts/reminders-worker.ts";
import { copy } from "../../design-system/copy.ts";
import { callbackFailurePage } from "./auth-page.ts";
import { backupHttp } from "./backup-http.ts";
import { accessName as cookieName, createBrowserSessions, readCookie } from "./browser-session.ts";
import { httpErrorResponse } from "./http-error.ts";
import {
	body,
	cookie,
	cooldownName,
	headers,
	json,
	resendSeconds,
	sameOrigin,
	setupName,
	verifierName,
} from "./http-response.ts";
import { loginPage } from "./login-page.ts";
import { createMcpHandler } from "./mcp.ts";
import { createOAuthController } from "./oauth-controller.ts";
import { authenticateSupabase } from "./supabase-auth.ts";
import { SupabaseRepository, serviceError } from "./supabase-repository.ts";

export function createSillRuntime(
	config?: any,
	{
		clientFactory = createClient,
		html = "",
		appHtml = "",
		repositoryFactory = (client?: any) => new SupabaseRepository(client),
		oauthProviderFactory,
		now = Date.now,
	}: any = {},
) {
	const origin = new URL(config.appOrigin);
	if (
		origin.origin !== config.appOrigin ||
		origin.username ||
		origin.password ||
		(origin.protocol !== "https:" &&
			!(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)))
	)
		throw new Error("Invalid application origin");
	const authUrl = new URL(config.url);
	if (
		authUrl.protocol !== "https:" ||
		authUrl.origin !== config.url ||
		!/^sb_publishable_[\w-]+$/.test(config.publishableKey || "")
	)
		throw new Error("Invalid Supabase configuration");
	function authClient(values: any = new Map<any, any>()) {
		return clientFactory(config.url, config.publishableKey, {
			auth: {
				flowType: "pkce",
				storageKey: "sill-web",
				persistSession: true,
				autoRefreshToken: false,
				detectSessionInUrl: false,
				storage: {
					getItem: (k?: any) => values.get(k) || null,
					setItem: (k?: any, v?: any) => {
						values.set(k, v);
					},
					removeItem: (k?: any) => {
						values.delete(k);
					},
				},
			},
		});
	}
	const sessions = createBrowserSessions(config, { authClient, clientFactory });
	const states = new WeakMap();
	async function authenticate(request?: any): Promise<any> {
		const bearer = request.headers.get("authorization");
		if (bearer) {
			// Explicit bearer access is reserved for separately resource-bound agents.
			if (!config.agentAudience) throw serviceError("forbidden");
			return authenticateSupabase(
				bearer,
				{ ...config, kind: "mcp", audience: config.agentAudience },
				clientFactory,
			);
		}
		return sessions.authenticate(request, states.get(request));
	}
	const oauth = createOAuthController(config, {
		providerFactory: oauthProviderFactory,
		authenticate: async (request?: any) => {
			if (request.headers.has("authorization")) throw serviceError("forbidden");
			const identity = await sessions.authenticate(request, states.get(request));
			const access = await repositoryFactory(identity.client).session();
			if (!access.workspaceRead) throw serviceError("forbidden");
			return identity;
		},
	});
	const mcp = createMcpHandler(config, { clientFactory, appHtml });
	const handle = async (request?: any) => {
		try {
			const url = new URL(request.url),
				path = url.pathname;
			if (url.origin !== config.appOrigin) throw serviceError("forbidden");
			if (request.headers.get("origin") && request.headers.get("origin") !== config.appOrigin)
				throw serviceError("forbidden");
			if (path.startsWith("/oauth/")) return oauth.handle(request);
			if (request.method === "GET" && path === "/reminders-worker.js")
				return new Response(remindersWorker, {
					headers: {
						...headers,
						"Content-Type": "text/javascript; charset=utf-8",
						"Cache-Control": "no-cache",
						"Service-Worker-Allowed": "/",
					},
				});
			if (
				path === "/mcp" ||
				path.startsWith("/mcp/") ||
				path === "/.well-known/oauth-protected-resource/mcp"
			)
				return mcp(request);
			if (path === "/api/v1/health" && request.method === "GET") {
				if (
					request.headers.has("X-Sill-Owner") &&
					request.headers.get("X-Sill-Owner") !== (await authenticate(request)).principal.userId
				)
					throw serviceError("forbidden");
				return json(200, { status: "ready", contract: "sill-v1-draft1" });
			}
			if (request.method === "GET" && path === "/auth/recovery") {
				const reason = url.searchParams.get("reason");
				return new Response(
					callbackFailurePage(
						reason === "forbidden" || reason === "unavailable" || reason === "cancelled"
							? reason
							: "expired",
					),
					{
						headers: {
							...headers,
							"Content-Type": "text/html; charset=utf-8",
							"Content-Security-Policy":
								"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
						},
					},
				);
			}
			if (request.method === "GET" && (path === "/auth/login" || path === "/auth/password/new")) {
				if (path === "/auth/password/new") await authenticate(request);
				else {
					try {
						await authenticate(request);
						return new Response(null, {
							status: 303,
							headers: {
								...headers,
								Location: oauth.resumeLocation(request) || config.appOrigin + "/",
							},
						});
					} catch (error) {
						if (error.code !== "unauthenticated") throw error;
					}
				}
				return new Response(
					loginPage({
						setup: path === "/auth/password/new",
						failed: url.searchParams.has("login_error"),
						authorizing: !!oauth.resumeLocation(request)?.includes("/oauth/consent?"),
					}),
					{
						headers: {
							...headers,
							"Content-Type": "text/html; charset=utf-8",
							"Content-Security-Policy":
								"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
						},
					},
				);
			}
			if (path === "/auth/password" && request.method === "POST") {
				sameOrigin(request, config.appOrigin);
				const credentials = z
					.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) })
					.strict()
					.parse(await body(request));
				const { data, error } = await authClient().auth.signInWithPassword(credentials);
				if (error)
					throw serviceError(
						error.status === 429
							? "rate_limited"
							: error.status >= 500
								? "unavailable"
								: "unauthenticated",
						error.status === 429 ? 429 : error.status >= 500 ? 503 : 401,
					);
				const identity = await authenticateSupabase(
					`Bearer ${data.session.access_token}`,
					{ ...config, kind: "web" },
					clientFactory,
				);
				if (!(await repositoryFactory(identity.client).session()).workspaceRead)
					throw serviceError("forbidden");
				const response = json(200, {
					location: oauth.resumeLocation(request) || config.appOrigin + "/",
				});
				for (const value of sessions.cookies(data.session))
					response.headers.append("Set-Cookie", value);
				response.headers.append("Set-Cookie", oauth.clearReturn());
				response.headers.append("Set-Cookie", cookie(setupName, "", 0));
				return response;
			}
			if (path === "/auth/password/update" && request.method === "POST") {
				sameOrigin(request, config.appOrigin);
				const { password } = z
					.object({ password: z.string().min(12).max(256) })
					.strict()
					.parse(await body(request));
				const identity = await authenticate(request);
				if (!(await repositoryFactory(identity.client).session()).workspaceRead)
					throw serviceError("forbidden");
				const refreshed = states
					.get(request)
					.cookies.find((c?: any) => c.startsWith("__Host-sill-refresh="));
				const refreshToken = refreshed
					? decodeURIComponent(refreshed.split(";")[0].split("=")[1])
					: readCookie(request, "__Host-sill-refresh");
				if (!refreshToken) throw serviceError("unauthenticated", 401);
				const client = authClient();
				const restored = await client.auth.setSession({
					access_token: identity.token,
					refresh_token: refreshToken,
				});
				if (restored.error) throw serviceError("unauthenticated", 401);
				const result = await client.auth.updateUser({ password });
				if (result.error)
					throw serviceError(
						result.error.status === 429 ? "rate_limited" : "invalid_request",
						result.error.status === 429 ? 429 : 400,
					);
				const response = json(200, {
					location: oauth.resumeLocation(request) || config.appOrigin + "/",
				});
				response.headers.append("Set-Cookie", oauth.clearReturn());
				response.headers.append("Set-Cookie", cookie(setupName, "", 0));
				return response;
			}
			if (path === "/auth/login" && request.method === "POST") {
				sameOrigin(request, config.appOrigin);
				const {
					email,
					setupPassword,
					client: loginClient,
				} = z
					.object({
						email: z.string().email().max(254),
						setupPassword: z.boolean().optional(),
						client: z.literal("macos").optional(),
					})
					.strict()
					.parse(await body(request));
				// Preserve the production browser cooldown; provider rate limits remain authoritative.
				const retryAfter = Math.ceil((Number(readCookie(request, cooldownName)) - now()) / 1000);
				if (retryAfter > 0 && retryAfter <= resendSeconds)
					return json(
						429,
						{
							error: {
								code: "rate_limited",
								message: "rate_limited",
								request_id: crypto.randomUUID(),
							},
							retryAfter,
						},
						{ "Retry-After": String(retryAfter) },
					);
				const storage = new Map<any, any>(),
					client = authClient(storage);
				const result = await client.auth.signInWithOtp({
					email,
					options: {
						shouldCreateUser: false,
						emailRedirectTo: `${config.appOrigin}/auth/callback${loginClient === "macos" ? "?client=macos" : ""}`,
					},
				});
				if (result.error?.status === 429)
					return json(
						429,
						{
							error: {
								code: "rate_limited",
								message: "rate_limited",
								request_id: crypto.randomUUID(),
							},
							retryAfter: resendSeconds,
						},
						{ "Retry-After": String(resendSeconds) },
					);
				if (result.error) throw serviceError("unavailable", 503);
				const verifier = storage.get("sill-web-code-verifier");
				if (!verifier || verifier.length > 512) throw serviceError("unavailable");
				const response = json(202, {
					message: copy("server.http.f868232da331"),
					retryAfter: resendSeconds,
				});
				response.headers.append(
					"Set-Cookie",
					cookie(setupName, setupPassword ? "1" : "", setupPassword ? 3600 : 0),
				);
				response.headers.append("Set-Cookie", cookie(verifierName, verifier, 600));
				response.headers.append(
					"Set-Cookie",
					cookie(cooldownName, String(now() + resendSeconds * 1000), resendSeconds),
				);
				return response;
			}
			if (path === "/auth/callback" && request.method === "GET") {
				// Supabase PKCE binds the single-use code to this browser's HttpOnly verifier.
				// Fixed redirect URL needs no wildcard query allowlist or separate echoed state.
				const code = url.searchParams.get("code"),
					verifier = readCookie(request, verifierName);
				if (url.searchParams.get("client") === "macos") {
					if (!code || code.length > 4096 || url.searchParams.getAll("code").length !== 1)
						throw serviceError("unauthenticated");
					if (request.headers.get("X-Sill-Client") !== "macos") {
						// Forward only the one-use code. The native session retains its PKCE verifier.
						return new Response(null, {
							status: 303,
							headers: {
								...headers,
								Location: `sill://auth/callback?code=${encodeURIComponent(code)}`,
							},
						});
					}
					sameOrigin(request, config.appOrigin);
				}
				if (
					!code ||
					url.searchParams.getAll("code").length !== 1 ||
					code.length > 4096 ||
					!verifier ||
					verifier.length > 512
				)
					throw serviceError("unauthenticated");
				const client = authClient(new Map<any, any>([["sill-web-code-verifier", verifier]]));
				const { data, error } = await client.auth.exchangeCodeForSession(code);
				if (error || !data?.session?.access_token) throw serviceError("unauthenticated");
				const token = data.session.access_token;
				const identity = await authenticateSupabase(
					`Bearer ${token}`,
					{ ...config, kind: "web" },
					clientFactory,
				);
				// Login alone does not grant app access. An operator must provision a workspace/grant first.
				const access = await repositoryFactory(identity.client).session();
				if (!access.workspaceRead) throw serviceError("forbidden");
				const setup = readCookie(request, setupName) === "1";
				const response = new Response(null, {
					status: 303,
					headers: {
						...headers,
						Location: setup
							? config.appOrigin + "/auth/password/new"
							: oauth.resumeLocation(request) || config.appOrigin + "/",
					},
				});
				if (config.oauthConsentEnabled && !setup)
					response.headers.append("Set-Cookie", oauth.clearReturn());
				for (const value of sessions.cookies(data.session))
					response.headers.append("Set-Cookie", value);
				response.headers.append("Set-Cookie", cookie(verifierName, "", 0));
				response.headers.append("Set-Cookie", cookie(cooldownName, "", 0));
				return response;
			}
			if (path === "/auth/logout" && request.method === "POST") {
				sameOrigin(request, config.appOrigin);
				let token = readCookie(request, cookieName),
					revoked = true;
				// An expired access token cannot revoke the session; refresh it first when possible.
				try {
					token = (await sessions.authenticate(request, states.get(request))).token;
				} catch (error) {
					revoked = error.code === "unauthenticated";
				}
				if (token) {
					try {
						const result = await authClient().auth.admin.signOut(token, "local");
						revoked = !result.error;
					} catch {
						revoked = false;
					}
				}
				// Always erase local session even if upstream logout fails. Never claim revoked tokens in that case.
				states.get(request).cookies = sessions.clear();
				return json(200, { signedOut: true, revoked });
			}
			if (path === "/auth/session" && request.method === "GET") {
				const identity = await authenticate(request);
				const access = await repositoryFactory(identity.client).session();
				if (!access.workspaceRead) throw serviceError("forbidden");
				return json(200, { ...access, userId: identity.principal.userId });
			}
			if (path.startsWith("/api/v1/")) {
				if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method))
					throw serviceError("invalid_request", 405);
				if (request.method !== "GET" && !request.headers.has("authorization"))
					sameOrigin(request, config.appOrigin);
				const { client, principal } = await authenticate(request),
					repository = repositoryFactory(client);
				if (
					request.headers.has("X-Sill-Owner") &&
					request.headers.get("X-Sill-Owner") !== principal.userId
				)
					throw serviceError("forbidden");
				if (path === "/api/v1/backups" || path.startsWith("/api/v1/backups/"))
					return await backupHttp(request, { client, principal }, repository, config);
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
					if (url.search || !/^[\w-]{8,128}$/.test(key || ""))
						throw serviceError("invalid_request");
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
			if (request.method === "GET" && path === "/")
				return new Response(html, {
					headers: {
						...headers,
						"Content-Type": "text/html; charset=utf-8",
						"Content-Security-Policy":
							"default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; style-src 'unsafe-inline'; img-src 'self' data: https:; manifest-src 'self'; connect-src 'self'; worker-src 'self'; frame-src https://www.youtube-nocookie.com; media-src https: http:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
					},
				});
			throw serviceError("not_found");
		} catch (error) {
			return httpErrorResponse(request, config.appOrigin, error);
		}
	};
	return async (request?: any) => {
		const state = { cookies: [] };
		states.set(request, state);
		try {
			const response = await handle(request);
			for (const value of state.cookies) response.headers.append("Set-Cookie", value);
			return response;
		} finally {
			states.delete(request);
		}
	};
}
