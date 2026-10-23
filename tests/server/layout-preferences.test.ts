import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultAppearance } from "../../contracts/appearance.ts";
import { workspaceBatch } from "../../contracts/cloud.ts";
import { identity, rpc } from "./helpers/boundary-fixture.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";

test("layout preferences survive migration, atomic writes, conflicts and reset", async () => {
	const fixture = await cloudFixture();
	const { db } = fixture;
	try {
		await identity(db);
		const get = () => rpc(db, "sill_get_workspace");
		const before = await get();
		await db.exec("reset role");
		await db.exec(
			await readFile(
				new URL(
					"../../supabase/migrations/20261023111147_sill_layout_preferences.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		await identity(db);
		assert.deepEqual(await get(), before);
		const values = {
			...defaultAppearance,
			cardTextSize: "large",
			cardSpacing: "roomy",
			cardPadding: "compact",
			readerTextSize: "large",
			readerSpacing: "roomy",
			readerWidth: "narrow",
			textWeight: "strong",
		};
		const payload = workspaceBatch.parse({
			expectedRevision: before.revision,
			operations: [{ op: "preferences.patch", values: { ...values, theme: "dark" } }],
		});
		const apply = (value: unknown, key: string) =>
			rpc(db, "sill_apply_operations", [JSON.stringify(value), key]);
		const saved = await apply(payload, "layout-save");
		for (const [key, value] of Object.entries(values))
			assert.equal(saved.state.preferences[key], value);
		assert.deepEqual(await get(), saved);
		assert.deepEqual(await apply(payload, "layout-save"), saved);
		await assert.rejects(
			apply(
				{
					...payload,
					operations: [{ op: "preferences.patch", values: { cardSpacing: "compact" } }],
				},
				"layout-stale",
			),
			/conflict/,
		);
		await assert.rejects(
			apply(
				{
					expectedRevision: saved.revision,
					operations: [
						{ op: "reading.add", seconds: 7 },
						{ op: "preferences.patch", values: { readerTextSize: "huge" } },
					],
				},
				"layout-invalid",
			),
			/invalid_request/,
		);
		assert.deepEqual(await get(), saved);
		const reset = await apply(
			{
				expectedRevision: saved.revision,
				operations: [{ op: "preferences.patch", values: defaultAppearance }],
			},
			"layout-reset",
		);
		assert.equal(reset.state.preferences.theme, "dark");
		for (const [key, value] of Object.entries(defaultAppearance))
			assert.equal(reset.state.preferences[key], value);
	} finally {
		await fixture.close();
	}
});
