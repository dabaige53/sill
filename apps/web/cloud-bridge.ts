import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { copy } from "./copy.ts";

// A host can finish mounting the view before its tool dispatcher is ready.
// Retry only the first reads, never a write or an authentication denial.
export async function readWhenReady(
	call?: any,
	args?: any,
	{
		sleep = (ms?: any) => new Promise((resolve?: any) => window.setTimeout(resolve, ms)),
	}: any = {},
) {
	for (let attempt = 0; ; attempt++)
		try {
			return await call(args);
		} catch (error) {
			if (
				attempt === 2 ||
				!["sill_open_workspace", "sill_listContents", "sill_getWorkspace"].includes(args.name) ||
				error.status === 401 ||
				error.status === 403 ||
				(error.status && error.status < 500)
			)
				throw error;
			await sleep([300, 900][attempt]);
		}
}

// Only the host owns authentication. The view has no tokens, direct fetch or iframe.
export function createCloudTransport(call?: any) {
	return async function request(path?: any, options: any = {}) {
		if (path === "/auth/session") {
			const access = await call({ name: "sill_open_workspace", arguments: {} });
			return { ...access, userId: access.connected ? access.userId : null };
		}
		if (path === "/api/v1/workspace" && (!options.method || options.method === "GET"))
			return call({
				name: "sill_getWorkspace",
				arguments: {
					...(new Headers(options.headers).get("X-Sill-Owner")
						? { expected_owner: new Headers(options.headers).get("X-Sill-Owner") }
						: {}),
				},
			});
		if (path === "/api/v1/workspace/operations" && options.method === "POST")
			return call({
				name: "sill_applyOperations",
				arguments: {
					idempotency_key: new Headers(options.headers).get("Idempotency-Key"),
					...(new Headers(options.headers).get("X-Sill-Owner")
						? { expected_owner: new Headers(options.headers).get("X-Sill-Owner") }
						: {}),
					body: JSON.parse(options.body),
				},
			});
		const url = new URL(path, "https://sill.invalid"),
			match = url.pathname.match(/^\/api\/v1\/contents(?:\/([\w-]+))?$/);
		if (!match)
			throw Object.assign(new Error(copy("web.cloudbridge.99e278e752d7")), {
				code: "forbidden",
				status: 403,
			});
		const id = match[1],
			method = options.method || "GET";
		let name: any, args: any;
		if (method === "GET") {
			name = id ? "sill_getContent" : "sill_listContents";
			args = id ? { id } : Object.fromEntries(url.searchParams);
		} else {
			name = {
				POST: "sill_createContent",
				PATCH: "sill_updateContent",
				DELETE: "sill_deleteContent",
			}[method];
			if (!name || (method === "POST" && id) || (method !== "POST" && !id))
				throw new Error(copy("web.cloudbridge.c082680b1e42"));
			args = {
				...(id ? { id } : {}),
				idempotency_key: new Headers(options.headers).get("Idempotency-Key"),
				...(new Headers(options.headers).get("X-Sill-Owner")
					? { expected_owner: new Headers(options.headers).get("X-Sill-Owner") }
					: {}),
				body: JSON.parse(options.body),
			};
		}
		return call({
			name,
			arguments: {
				...args,
				...(new Headers(options.headers).get("X-Sill-Owner")
					? { expected_owner: new Headers(options.headers).get("X-Sill-Owner") }
					: {}),
			},
		});
	};
}

export function startCloudBridge() {
	const bridge = new App(
		{ name: copy("web.cloudbridge.d4fc4b75f2fe"), version: "0.5.0" },
		{},
		{ autoResize: false },
	);
	let opening = true,
		initialAccess: any;
	bridge.addEventListener("toolresult", (result?: any) => {
		if (result.structuredContent?.connected === true) initialAccess = result.structuredContent;
	});
	const style = () => {
		const context = bridge.getHostContext();
		if (context?.theme) applyDocumentTheme(context.theme);
		if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
	};
	bridge.addEventListener("hostcontextchanged", style);
	const ready = bridge.connect().then(style);
	// Retain a rejected connection for callers without an unhandled rejection.
	ready.catch(() => {});
	const statuses = {
		unauthenticated: 401,
		forbidden: 403,
		not_found: 404,
		revision_conflict: 409,
		idempotency_conflict: 409,
		rate_limited: 429,
	};
	const call = async (args?: any) => {
		await ready;
		const result = await bridge.callServerTool(args);
		if (result.isError) {
			let value: any;
			try {
				const block = result.content?.find((c) => c.type === "text");
				if (block?.type === "text") value = JSON.parse(block.text);
			} catch {}
			const code = value?.error?.code || "unavailable";
			throw Object.assign(new Error(copy("web.cloudbridge.c38fb6f884b3")), {
				code,
				status: statuses[code] || 503,
			});
		}
		if (!result.structuredContent)
			throw Object.assign(new Error(copy("web.cloudbridge.477c2c36672e")), { status: 503 });
		return result.structuredContent;
	};
	window.__SILL_HOST__ = {
		request: createCloudTransport(async (args?: any) => {
			if (opening && args.name === "sill_open_workspace" && initialAccess) {
				const value = initialAccess;
				initialAccess = null;
				return value;
			}
			const value = await (opening ? readWhenReady(call, args) : call(args));
			if (["sill_listContents", "sill_getWorkspace"].includes(args.name)) opening = false;
			return value;
		}),
		manageAccess: () =>
			bridge.openLink({
				url: "https://sill-web-preview.scs1213-temp-email.workers.dev/oauth/grants",
			}),
	};
}
