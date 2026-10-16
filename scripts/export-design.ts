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
const spec = read("openapi.json");
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
for (const tool of catalog.tools) {
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
