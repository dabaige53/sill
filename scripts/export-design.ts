import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { cloudSchemas, toolInputs } from "../contracts/cloud.ts";

const directory = new URL("../contracts/design/", import.meta.url);
const renamed = (value: string) =>
	value.replace(
		/CreateContent|UpdateContent|DeleteContent|ContentPage|ListContents|\bContent\b/g,
		(name?: any) =>
			({
				CreateContent: "CreateCard",
				UpdateContent: "UpdateCard",
				DeleteContent: "DeleteCard",
				ContentPage: "CardPage",
				ListContents: "ListCards",
				Content: "Card",
			})[name],
	);
const read = (file: string) => JSON.parse(renamed(readFileSync(new URL(file, directory), "utf8")));
const spec = read("openapi-source.json");
spec.components.schemas = Object.fromEntries(
	Object.entries(cloudSchemas).map(([name, schema]: any) => {
		const { $schema, ...value } = z.toJSONSchema(schema, { io: "input" });
		return [name, value];
	}),
);
const normalize = (value: unknown): any =>
	Array.isArray(value)
		? value.map(normalize)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.entries(value).map(([name, entry]: any) => [
						name,
						name === "$ref"
							? String(entry).replace("#/components/schemas/", "#/$defs/")
							: normalize(entry),
					]),
				)
			: value;
const catalog = read("mcp-tools.json");
for (const name of ["sill_getWorkspace", "sill_applyOperations"]) {
	if (!catalog.tools.some((tool: any) => tool.name === name))
		catalog.tools.push({
			name,
			description: name + " through the authorized workspace layer.",
			inputSchema: {},
			outputSchema: { $ref: "#/components/schemas/Workspace" },
		});
}
spec.paths["/workspace"] = {
	get: {
		operationId: "getWorkspace",
		"x-required-scope": "content:read",
		responses: {
			"200": {
				description: "Workspace snapshot",
				content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } },
			},
		},
	},
};
spec.paths["/workspace/operations"] = {
	post: {
		operationId: "applyOperations",
		"x-required-scope": "content:write",
		parameters: [
			{
				name: "Idempotency-Key",
				in: "header",
				required: true,
				schema: { type: "string", pattern: "^[a-zA-Z0-9_-]{8,128}$" },
			},
		],
		requestBody: {
			required: true,
			content: { "application/json": { schema: { $ref: "#/components/schemas/WorkspaceBatch" } } },
		},
		responses: {
			"200": {
				description: "Workspace snapshot",
				content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } },
			},
		},
	},
};
for (const path of Object.values(spec.paths) as any[])
	for (const [method, operation] of Object.entries(path) as any[]) {
		if (!["get", "post", "patch", "delete"].includes(method)) continue;
		operation.parameters = (operation.parameters || []).filter(
			(parameter: any) => parameter.name !== "X-Sill-Owner",
		);
		operation.parameters.push({
			name: "X-Sill-Owner",
			in: "header",
			required: false,
			description:
				"Reject if the authenticated account differs; this condition grants no permissions.",
			schema: { type: "string", minLength: 1, maxLength: 100 },
		});
	}
for (const tool of catalog.tools) {
	if (["sill_getWorkspace", "sill_applyOperations"].includes(tool.name)) {
		tool["x-operationId"] = tool.name.slice(5);
		tool["x-required-scope"] = tool.name === "sill_getWorkspace" ? "content:read" : "content:write";
	}
	tool.inputSchema = z.toJSONSchema(toolInputs[tool.name], { io: "input" });
	tool.outputSchema = {
		type: "object",
		$ref: normalize(tool.outputSchema.$ref),
		$defs: normalize(spec.components.schemas),
	};
	tool.outputSchema.$ref = tool.outputSchema.$ref.replace("#/components/schemas/", "#/$defs/");
}
for (const [file, value] of Object.entries({
	"openapi.json": spec,
	"mcp-tools.json": catalog,
	"fixtures.json": read("fixtures.json"),
})) {
	const target = new URL(file, directory);
	const content = JSON.stringify(value, null, 2) + "\n";
	if (process.argv.includes("--check")) {
		if (readFileSync(target, "utf8") !== content) throw new Error("stale_design_schema:" + file);
	} else writeFileSync(target, content);
}
