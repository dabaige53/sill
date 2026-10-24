import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import formats from "ajv-formats";
import { z } from "zod/v4";
import { Card, cardTypes, contractVersion } from "../../contracts/card.ts";
import { cloudPreferences, cloudState, create, toolInputs } from "../../contracts/cloud.ts";
import { toolDescriptions } from "../../contracts/mcp-guidance.ts";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, resource } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const examples = [
	...read("../../skills/sill/references/cards.md").matchAll(/```json\n([\s\S]*?)\n```/g),
].map((match) => JSON.parse(match[1]));
const catalog = JSON.parse(read("../../contracts/design/mcp-tools.json"));

test("skill recipes cover current card kinds and every writable field", () => {
	assert.deepEqual([...new Set(examples.map((card) => card.type))].sort(), [...cardTypes].sort());
	assert.deepEqual(
		examples
			.filter((card) => card.type === "media")
			.map((card) => card.media)
			.sort(),
		["podcast", "video"],
	);
	for (const card of examples) {
		assert.deepEqual(create.parse(card), card);
		const { state: _, ...fields } = card;
		assert.deepEqual(Card.parse({ id: "recipe", ...fields }), { id: "recipe", ...fields });
	}
	const dictionary = read("../../skills/sill/references/fields.md");
	for (const key of Object.keys(Card.shape)) assert.ok(dictionary.includes("`" + key + "`"), key);
	const operations = read("../../skills/sill/references/operations.md");
	for (const key of [...Object.keys(cloudState.shape), ...Object.keys(cloudPreferences.shape)])
		assert.ok(operations.includes("`" + key + "`"), key);
	const transport = [
		...read("../../skills/sill/references/transport.md").matchAll(/```json\n([\s\S]*?)\n```/g),
	].map((match) => JSON.parse(match[1]));
	assert.deepEqual(toolInputs.sill_createContent.parse(transport[0]), transport[0]);
	assert.deepEqual(toolInputs.sill_updateContent.parse(transport[1]), transport[1]);
	assert.ok(transport[0].body.body.includes("\n\n"));
	assert.equal(catalog.contractVersion, contractVersion);
	for (const tool of catalog.tools) {
		assert.equal(tool.description, toolDescriptions[tool.name]);
		assert.deepEqual(tool.inputSchema, z.toJSONSchema(toolInputs[tool.name], { io: "input" }));
	}
});

test("skill recipes round trip through discovered MCP tools, including batch and retry", async () => {
	const f = await cloudFixture();
	const client = new Client({ name: "skill-recipes", version: "1" });
	try {
		await f.db.exec(
			`insert into sill_private.caller_grants values('${A}','oauth:skill-recipes',array['content:read','content:write'],array['*'],'${resource}');`,
		);
		const runtime = createSillRuntime(
			{ ...f.config, mcpEnabled: true },
			{ clientFactory: f.factory },
		);
		await client.connect(
			new StreamableHTTPClientTransport(new URL(resource), {
				requestInit: {
					headers: {
						Authorization: "Bearer " + token({ client_id: "skill-recipes", aud: resource }),
					},
				},
				fetch: (url, init) => runtime(new Request(url, init)),
			}),
		);
		const discovery = await client.listTools();
		const validator = new Ajv2020({ strict: false });
		(formats as unknown as (validator: Ajv2020) => void)(validator);
		const outputs = new Map(
			discovery.tools
				.filter((tool) => Object.hasOwn(toolInputs, tool.name))
				.map((tool) => {
					assert.equal(tool.description, toolDescriptions[tool.name]);
					assert.deepEqual(
						tool.inputSchema,
						catalog.tools.find((entry) => entry.name === tool.name).inputSchema,
					);
					return [tool.name, validator.compile(tool.outputSchema!)];
				}),
		);
		const call = async (name: string, args: Record<string, unknown>) => {
			const result = await client.callTool({ name, arguments: args });
			assert.equal(result.isError, undefined, JSON.stringify(result));
			const value = result.structuredContent as Record<string, any>;
			const validate = outputs.get(name)!;
			assert.ok(validate(value), JSON.stringify(validate.errors));
			return value;
		};
		const compare = (saved: Record<string, any>, expected: Record<string, any>) => {
			for (const [key, value] of Object.entries(expected)) {
				if (key === "state") {
					for (const [field, state] of Object.entries(value))
						assert.deepEqual(saved.state[field], state);
				} else assert.deepEqual(saved[key], value, `${expected.type}.${key}`);
			}
		};
		for (const [index, card] of examples.entries()) {
			const args = { idempotency_key: `skill-recipe-${index}`, body: card };
			const created = await call("sill_createContent", args);
			compare(await call("sill_getContent", { id: created.id }), card);
			if (card.type === "note") {
				assert.equal((await call("sill_createContent", args)).id, created.id);
				const updateArgs = {
					id: created.id,
					idempotency_key: "skill-recipe-edit",
					body: {
						expectedRevision: created.revision,
						changes: { body: "## 更新\n\n保留来源。", state: { note: "个人备注" } },
					},
				};
				await call("sill_updateContent", updateArgs);
				compare(await call("sill_getContent", { id: created.id }), {
					...card,
					body: updateArgs.body.changes.body,
					state: { note: "个人备注" },
				});
				const conflict = await client.callTool({
					name: "sill_updateContent",
					arguments: { ...updateArgs, idempotency_key: "skill-recipe-stale" },
				});
				assert.equal(conflict.isError, true);
				assert.match(JSON.stringify(conflict.content), /revision_conflict/);
			}
		}
		const workspace = await call("sill_getWorkspace", {});
		const operations = examples.flatMap(({ state, ...card }, index) => {
			const id = `batch-recipe-${index}`;
			return [
				{ op: "card.upsert", card: { ...card, id }, before: null },
				...(state ? [{ op: "item.patch", id, values: state }] : []),
			];
		});
		const batch = await call("sill_applyOperations", {
			idempotency_key: "skill-recipes-batch",
			body: { expectedRevision: workspace.revision, operations },
		});
		for (const [index, { state, ...card }] of examples.entries()) {
			const id = `batch-recipe-${index}`;
			compare(
				batch.state.cards.find((entry) => entry.id === id),
				card,
			);
			if (state)
				for (const [key, value] of Object.entries(state))
					assert.deepEqual(batch.state.items[id][key], value);
		}
	} finally {
		await client.close();
		await f.db.close();
	}
});
