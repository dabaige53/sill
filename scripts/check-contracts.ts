import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import formats from "ajv-formats";
import { toolInputs } from "../contracts/cloud.ts";

const read = (name: string) =>
	JSON.parse(readFileSync(new URL("../contracts/design/" + name, import.meta.url), "utf8"));
const spec = read("openapi.json");
const catalog = read("mcp-tools.json");
const fixtures = read("fixtures.json");
const validator = new Ajv2020({ strict: false });
(formats as unknown as (validator: Ajv2020) => void)(validator);
export const normalizeRefs = (value: unknown): any =>
	Array.isArray(value)
		? value.map(normalizeRefs)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.entries(value).map(([key, entry]: any) => [
						key,
						key === "$ref"
							? String(entry).replace("#/components/schemas/", "#/$defs/")
							: normalizeRefs(entry),
					]),
				)
			: value;
export function validateDesign(schemaName: string, value: unknown) {
	const schema = { $ref: "#/$defs/" + schemaName, $defs: normalizeRefs(spec.components.schemas) };
	const check = validator.compile(schema);
	assert.ok(check(value), JSON.stringify(check.errors));
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
	if (process.argv[2] === "sample") {
		const sample = fixtures.cases.find((entry: any) => entry.name === process.argv[3]);
		assert.ok(sample, "unknown_sample");
		console.log(JSON.stringify(sample, null, 2));
	} else {
		const operations = new Map<string, any>();
		for (const [path, methods] of Object.entries<any>(spec.paths))
			for (const [method, operation] of Object.entries<any>(methods)) {
				if (!["get", "post", "patch", "delete"].includes(method)) continue;
				// @wu-test type=boundary | scope=public HTTP design operations | protects=Prevents duplicate operation identifiers from routing a tool to the wrong operation
				assert.ok(!operations.has(operation.operationId));
				operations.set(operation.operationId, { path, method, operation });
				// @wu-test type=boundary | scope=public HTTP write design | protects=Prevents write operations from omitting the required idempotency key
				if (method !== "get")
					assert.ok(
						operation.parameters.some(
							(parameter: any) => parameter.name === "Idempotency-Key" && parameter.required,
						),
					);
			}
		// @wu-test type=boundary | scope=public MCP tool catalog | protects=Prevents a public tool from being missing or unexpectedly added to the catalog
		assert.deepEqual(
			catalog.tools.map((tool: any) => tool.name).sort(),
			Object.keys(toolInputs).sort(),
		);
		// @wu-test type=boundary | scope=public MCP to HTTP mapping | protects=Prevents a published tool from referencing a nonexistent HTTP operation
		for (const tool of catalog.tools) {
			const route = operations.get(tool["x-operationId"]);
			assert.ok(route);
			// @wu-test type=boundary | scope=public MCP permission mapping | protects=Prevents a tool from advertising a permission scope inconsistent with its HTTP operation
			assert.equal(tool["x-required-scope"], route.operation["x-required-scope"]);
			// @wu-test type=boundary | scope=public MCP schemas | protects=Prevents invalid public input or output schemas from being published
			validator.compile(tool.inputSchema);
			validator.compile(tool.outputSchema);
		}
		// @wu-test type=boundary | scope=public MCP input schema samples | protects=Prevents published argument examples from violating their tool input schemas
		for (const sample of fixtures.cases) {
			const tool = catalog.tools.find(
				(entry: any) => entry["x-operationId"] === sample.operationId,
			);
			const check = validator.compile(tool.inputSchema);
			assert.ok(check(sample.arguments), JSON.stringify(check.errors));
			// @wu-test type=boundary | scope=public MCP response schema samples | protects=Prevents published success or error examples from violating response schemas
			const responseCheck = validator.compile(
				sample.status < 300
					? tool.outputSchema
					: { $ref: "#/$defs/Error", $defs: normalizeRefs(spec.components.schemas) },
			);
			assert.ok(responseCheck(sample.response), JSON.stringify(responseCheck.errors));
		}
		console.log(
			`PASS: ${operations.size} HTTP designs, ${catalog.tools.length} MCP mappings, ${fixtures.cases.length} synthetic responses`,
		);
	}
}
