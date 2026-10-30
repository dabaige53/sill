import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { backupToolInputs } from "../../contracts/backup.ts";
import { toolInputs as inputs } from "../../contracts/cloud.ts";
import contract from "../../contracts/design/mcp-tools.json" with { type: "json" };
import {
	backupToolDescriptions,
	serverInstructions,
	toolDescriptions,
} from "../../contracts/mcp-guidance.ts";
import { copy } from "../../design-system/copy.ts";
import product from "../../package.json" with { type: "json" };
import { BackupRuntime } from "./backup-runtime.ts";
import { errorResult } from "./http-error.ts";
import { mediaFrameDomains, mediaResourceDomains, restrictMediaScripts } from "./media-policy.ts";
import { authenticateSupabase } from "./supabase-auth.ts";
import { SupabaseRepository } from "./supabase-repository.ts";

const scopes = {
	sill_getWorkspace: "content:read",
	sill_applyOperations: "content:read",
	sill_listContents: "content:read",
	sill_searchContents: "content:read",
	sill_getContent: "content:read",
	sill_createContent: "content:write",
	sill_updateContent: "content:write",
	sill_deleteContent: "content:delete",
	sill_submitEvent: "event:submit",
	sill_getEvent: "event:read",
};
const safeError = (error?: any) => errorResult(error).body;
const readOnlyTools = [
	"sill_getWorkspace",
	"sill_listContents",
	"sill_searchContents",
	"sill_getContent",
	"sill_getEvent",
];
// Creating a card or queuing an event only adds records; it never replaces or removes data.
const additiveTools = ["sill_createContent", "sill_submitEvent"];
const result = (value?: any) => ({
	content: [{ type: "text", text: JSON.stringify(value) }],
	structuredContent: value,
});
export const workspaceUri = `ui://sill/cloud-workspace-${product.version}.html`;
// The version busts host caches, but installed hosts can still request older URLs.
// All aliases resolve to the current app under the same per-request authorization.
const workspaceResource = /^ui:\/\/sill\/cloud-workspace-(?:v3|\d+\.\d+\.\d+)\.html$/;
const workspaceMime = "text/html;profile=mcp-app";
const workspaceMeta = {
	ui: {
		csp: {
			connectDomains: [],
			resourceDomains: mediaResourceDomains(),
			frameDomains: mediaFrameDomains,
			baseUriDomains: [],
		},
		permissions: {},
	},
	"openai/ui": { availableDisplayModes: ["fullscreen"], preferredDisplayMode: "fullscreen" },
};
const workspaceTools = [
	["sill_open_workspace", copy("server.loginpage.d4fc4b75f2fe"), "global"],
	["sill_open_cards", copy("server.mcp.3bc24d7318eb"), "thread"],
].map(([name, title, type]: any) => ({
	name,
	title,
	description: copy("server.mcp.ff9db1ca72af"),
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		openWorldHint: false,
		idempotentHint: true,
	},
	_meta: {
		ui: { resourceUri: workspaceUri, visibility: ["model", "app"] },
		"openai/ui": { entrypoints: [{ type }] },
	},
}));
export function createMcpHandler(config?: any, { clientFactory, appHtml = "" }: any = {}) {
	const resource = config.appOrigin + "/mcp",
		metadata = config.appOrigin + "/.well-known/oauth-protected-resource/mcp";
	const icons = [
		{ src: config.appOrigin + "/assets/sill-icon.png", mimeType: "image/png", sizes: ["256x256"] },
	];
	const entrypointIcons = [
		{
			src: config.appOrigin + "/assets/sill-line.svg",
			mimeType: "image/svg+xml",
			sizes: ["any"],
			theme: "light",
		},
		{
			src: config.appOrigin + "/assets/sill-line-dark.svg",
			mimeType: "image/svg+xml",
			sizes: ["any"],
			theme: "dark",
		},
	];
	const response = (status?: any, value?: any, extra: any = {}) =>
		Response.json(value, {
			status,
			headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
		});
	return async (request?: any) => {
		const url = new URL(request.url);
		if (
			url.origin !== config.appOrigin ||
			(request.headers.get("origin") && request.headers.get("origin") !== config.appOrigin)
		)
			return response(403, { error: "forbidden" });
		// Fail closed until real issuer/resource/client compatibility and production consent are verified.
		if (!config.mcpEnabled || config.agentAudience !== resource)
			return response(503, { error: "mcp_not_enabled" });
		if (url.pathname === "/.well-known/oauth-protected-resource/mcp" && request.method === "GET")
			return response(200, {
				resource,
				authorization_servers: [config.url + "/auth/v1"],
				bearer_methods_supported: ["header"],
				resource_name: "Sill",
			});
		if (url.pathname !== "/mcp" || url.search) return response(404, { error: "not_found" });
		let server: any;
		try {
			const { client } = await authenticateSupabase(
				request.headers.get("authorization"),
				{ ...config, kind: "mcp", audience: resource },
				clientFactory,
			);
			const repo = new SupabaseRepository(client),
				access = await repo.session();
			const backup = new BackupRuntime(access.userId, repo, config);
			const backupAllowed = (name: string) =>
				!!config.backupEncryptionKey &&
				access.workspaceRead &&
				access.scopes.includes("content:read") &&
				(["sill_listBackups", "sill_getBackup", "sill_checkBackupTarget"].includes(name) ||
					name === "sill_previewRestore" ||
					(access.workspaceWrite &&
						access.scopes.includes("content:write") &&
						(!["sill_restoreBackup", "sill_getRestoreStatus"].includes(name) ||
							access.scopes.includes("content:delete"))));
			const allowed = (name?: any) =>
				access.scopes.includes(scopes[name]) &&
				(![
					"sill_listContents",
					"sill_searchContents",
					"sill_getWorkspace",
					"sill_applyOperations",
				].includes(name) ||
					access.workspaceRead) &&
				(name !== "sill_createContent" || access.workspaceWrite) &&
				(name !== "sill_applyOperations" || access.scopes.includes("content:write"));
			// Stateless request-scoped transport: every request revalidates identity and current grants.
			server = new Server(
				{ name: "sill", version: product.version, icons },
				{
					capabilities: { tools: {}, resources: {} },
					instructions: serverInstructions,
					jsonSchemaValidator: {
						getValidator() {
							throw new Error("Unsupported capability");
						},
					},
				},
			);
			const canOpen = () =>
				!!appHtml && access.workspaceRead && access.scopes.includes("content:read");
			server.setRequestHandler(ListResourcesRequestSchema, async () => ({
				resources: canOpen()
					? [
							{
								uri: workspaceUri,
								name: copy("server.loginpage.d4fc4b75f2fe"),
								mimeType: workspaceMime,
								_meta: workspaceMeta,
							},
						]
					: [],
			}));
			server.setRequestHandler(ReadResourceRequestSchema, async (request?: any) => {
				if (!canOpen() || !workspaceResource.test(request.params.uri))
					throw new Error("Resource unavailable");
				const snapshot = await repo.workspace();
				const meta = {
					...workspaceMeta,
					ui: {
						...workspaceMeta.ui,
						csp: {
							...workspaceMeta.ui.csp,
							resourceDomains: mediaResourceDomains(snapshot.state.cards),
						},
					},
				};
				return {
					contents: [
						{
							uri: request.params.uri,
							mimeType: workspaceMime,
							text: restrictMediaScripts(appHtml),
							_meta: meta,
						},
					],
				};
			});
			server.setRequestHandler(ListToolsRequestSchema, async () => ({
				tools: [
					...Object.entries(backupToolInputs)
						.filter(([name]) => backupAllowed(name))
						.map(([name, schema]) => ({
							name,
							description: backupToolDescriptions[name],
							inputSchema: z.toJSONSchema(schema),
							annotations: {
								readOnlyHint: [
									"sill_listBackups",
									"sill_previewRestore",
									"sill_getBackup",
									"sill_checkBackupTarget",
									"sill_getRestoreStatus",
								].includes(name),
								destructiveHint: name === "sill_restoreBackup",
								idempotentHint: true,
								openWorldHint: true,
							},
						})),
					...(canOpen() ? workspaceTools.map((t?: any) => ({ ...t, icons: entrypointIcons })) : []),
					...contract.tools
						.filter((t?: any) => allowed(t.name))
						.map((t?: any) => ({
							...t,
							description: toolDescriptions[t.name],
							annotations: {
								readOnlyHint: readOnlyTools.includes(t.name),
								destructiveHint: ![...readOnlyTools, ...additiveTools].includes(t.name),
								idempotentHint: true,
								openWorldHint: false,
							},
						})),
				],
			}));
			server.setRequestHandler(CallToolRequestSchema, async (request?: any) => {
				try {
					const name = request.params.name;
					if (workspaceTools.some((t?: any) => t.name === name)) {
						if (!canOpen()) throw Object.assign(new Error("forbidden"), { code: "forbidden" });
						z.object({})
							.strict()
							.parse(request.params.arguments || {});
						return result({
							connected: true,
							userId: access.userId,
							scopes: access.scopes,
							workspaceRead: access.workspaceRead,
							workspaceWrite: access.workspaceWrite,
						});
					}
					if (Object.hasOwn(backupToolInputs, name)) {
						if (!backupAllowed(name))
							throw Object.assign(new Error("forbidden"), { code: "forbidden" });
						const a = (backupToolInputs as any)[name].parse(request.params.arguments || {});
						if (a.expected_owner && a.expected_owner !== access.userId)
							throw Object.assign(new Error("forbidden"), { code: "forbidden" });
						const { expected_owner, ...p } = a;
						if (name === "sill_getBackup") return result((await backup.read(p.backupId)).snapshot);
						if (name === "sill_checkBackupTarget")
							return result(await backup.checkTarget(p.targetId));
						if (name === "sill_getRestoreStatus") return result({ result: await backup.status(p) });
						return result(
							name === "sill_listBackups"
								? await backup.list()
								: name === "sill_createBackup"
									? await backup.create(p.targetId, p.idempotencyKey)
									: name === "sill_previewRestore"
										? await backup.preview(p.backupId)
										: name === "sill_checkBackup"
											? await backup.check(p.backupId)
											: await backup.restore(p),
						);
					}
					if (!Object.hasOwn(inputs, name) || !allowed(name))
						throw Object.assign(new Error("forbidden"), { code: "forbidden" });
					const a = inputs[name].parse(request.params.arguments || {});
					if (a.expected_owner !== undefined && a.expected_owner !== access.userId)
						throw Object.assign(new Error("forbidden"), { code: "forbidden" });
					let value: any;
					if (name === "sill_getWorkspace") value = await repo.workspace();
					else if (name === "sill_applyOperations")
						value = await repo.applyOperations(a.body, a.idempotency_key);
					else if (name === "sill_listContents") value = await repo.list(a);
					else if (name === "sill_searchContents") value = await repo.search(a.query, a.limit);
					else if (name === "sill_getContent") value = await repo.get(a.id);
					else if (name === "sill_getEvent") value = await repo.getEvent(a.id);
					else
						value = (
							await repo.write(
								{
									sill_createContent: "create",
									sill_updateContent: "update",
									sill_deleteContent: "delete",
									sill_submitEvent: "submit_event",
								}[name],
								a.id || null,
								a.body,
								a.idempotency_key,
							)
						).body;
					return result(value);
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify(safeError(error)) }],
						isError: true,
					};
				}
			});
			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
				maxRequestBodySize: 524288,
			});
			await server.connect(transport);
			const output = await transport.handleRequest(request);
			output.headers.set("Cache-Control", "no-store");
			return output;
		} catch (error) {
			const status = [401, 403].includes(error.status) ? error.status : 503;
			return response(
				status,
				safeError(error),
				status === 401 ? { "WWW-Authenticate": `Bearer resource_metadata="${metadata}"` } : {},
			);
		} finally {
			await server?.close();
		}
	};
}
