import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { copy } from "./copy.ts";
import { type AgentPayload, agentFailure } from "./services/agent-handoff.ts";

const statuses = {
	invalid_request: 400,
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	revision_conflict: 409,
	idempotency_conflict: 409,
	cursor_expired: 410,
	rate_limited: 429,
	backup_auth_failed: 403,
	backup_unknown: 503,
};

/** Preserve definite server rejections, so invalid input never becomes an unknown write. */
export function readCloudResult(result: any) {
	if (result.isError) {
		let value = result.structuredContent;
		if (!value?.error?.code)
			try {
				const block = result.content?.find((c) => c.type === "text");
				if (block?.type === "text") value = JSON.parse(block.text);
			} catch {}
		const raw = value?.error?.code;
		const code = Object.hasOwn(statuses, raw) ? raw : "unavailable";
		throw Object.assign(new Error(copy("web.cloudbridge.c38fb6f884b3")), {
			code,
			status: statuses[code] || 503,
		});
	}
	if (!result.structuredContent)
		throw Object.assign(new Error(copy("web.cloudbridge.477c2c36672e")), { status: 503 });
	return result.structuredContent;
}

type HostBridge = Pick<
	App,
	"getHostCapabilities" | "sendMessage" | "updateModelContext" | "openLink"
>;

/** Use negotiated MCP App capabilities; this does not install an assistant or execute a card. */
export function createHostActions(bridge: HostBridge, ready: Promise<unknown>) {
	const canDiscuss = () => !!bridge.getHostCapabilities()?.message?.text;
	return {
		canDiscuss,
		async discuss(payload: AgentPayload, current: () => boolean) {
			try {
				await ready;
			} catch {
				throw agentFailure("host_unavailable", copy("web.agent.unavailable"));
			}
			if (!canDiscuss()) throw agentFailure("host_unavailable", copy("web.agent.unavailable"));
			if (!current()) throw agentFailure("account_changed", copy("web.agent.accountChanged"));
			if (bridge.getHostCapabilities()?.updateModelContext?.text)
				try {
					await bridge.updateModelContext(
						{ content: [{ type: "text", text: JSON.stringify(payload.reference) }] },
						{ timeout: 10000 },
					);
				} catch {
					// Context is optional; the explicit message below contains the same bounded reference.
				}
			if (!current()) throw agentFailure("account_changed", copy("web.agent.accountChanged"));
			let result: Awaited<ReturnType<App["sendMessage"]>>;
			try {
				result = await bridge.sendMessage(
					{ role: "user", content: [{ type: "text", text: payload.text }] },
					{ timeout: 20000 },
				);
			} catch {
				throw agentFailure("message_unknown", copy("web.agent.unknown"));
			}
			if (result.isError) throw agentFailure("message_rejected", copy("web.agent.rejected"));
		},
		async openLink(url: string) {
			try {
				await ready;
			} catch {
				throw agentFailure("link_unavailable", copy("web.agent.linkUnavailable"));
			}
			if (!bridge.getHostCapabilities()?.openLinks)
				throw agentFailure("link_unavailable", copy("web.agent.linkUnavailable"));
			let result: Awaited<ReturnType<App["openLink"]>>;
			try {
				result = await bridge.openLink({ url }, { timeout: 20000 });
			} catch {
				throw agentFailure("link_unknown", copy("web.agent.linkUnknown"));
			}
			if (result.isError) throw agentFailure("link_rejected", copy("web.agent.linkRejected"));
		},
	};
}

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
		if (path === "/api/v1/backups" || path.startsWith("/api/v1/backups/")) {
			const method = options.method || "GET";
			const expected_owner = new Headers(options.headers).get("X-Sill-Owner") || undefined;
			const body = options.body ? JSON.parse(options.body) : {};
			let name: string | undefined;
			let args: Record<string, unknown> = {};
			const item = /^\/api\/v1\/backups\/([\w-]+)\/(preview|download|check)$/.exec(path);
			const target = /^\/api\/v1\/backups\/targets\/([\w-]+)\/check$/.exec(path);
			if (path === "/api/v1/backups" && method === "GET") name = "sill_listBackups";
			else if (path === "/api/v1/backups" && method === "POST") {
				name = "sill_createBackup";
				args = body;
			} else if (path === "/api/v1/backups/restore" && method === "POST") {
				name = "sill_restoreBackup";
				args = body;
			} else if (path === "/api/v1/backups/restore/status" && method === "POST") {
				name = "sill_getRestoreStatus";
				args = body;
			} else if (item && method === "GET") {
				name = {
					preview: "sill_previewRestore",
					download: "sill_getBackup",
					check: "sill_checkBackup",
				}[item[2]];
				args = { backupId: item[1] };
			} else if (target && method === "POST") {
				name = "sill_checkBackupTarget";
				args = { targetId: target[1] };
			}
			if (!name) throw agentFailure("forbidden", copy("web.agent.invalidRequest"));
			const result = await call({
				name,
				arguments: { ...args, ...(expected_owner ? { expected_owner } : {}) },
			});
			return result;
		}
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
	const call = async (args?: any) => {
		await ready;
		return readCloudResult(await bridge.callServerTool(args));
	};
	const actions = createHostActions(bridge, ready);
	window.__SILL_HOST__ = {
		...actions,
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
			actions.openLink("https://sill-web-preview.scs1213-temp-email.workers.dev/oauth/grants"),
	};
}
