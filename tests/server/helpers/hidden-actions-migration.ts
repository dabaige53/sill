import assert from "node:assert/strict";

const migration = "20261018060000_sill_hidden_card_actions.sql";
const actions = [
	"bookmark",
	"tag",
	"later",
	"reply",
	"open",
	"join",
	"snooze",
	"download",
	"dismiss",
];
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
type Snapshot = { revision: number; state: { preferences: Record<string, unknown> } };

/** The same public-RPC assertions run in PGlite locally and isolated PostgreSQL in CI. */
export async function verifyHiddenActionsMigration({
	sql,
	migrate,
	identity,
	owner,
}: {
	sql: (statement: string) => Promise<string>;
	migrate: (name: string) => Promise<unknown>;
	identity: string;
	owner: string;
}) {
	const get = async (): Promise<Snapshot> =>
		JSON.parse(await sql(identity + "select public.sill_get_workspace() as value;"));
	const apply = async (
		snapshot: Snapshot,
		values: unknown,
		key: string,
		reading = false,
	): Promise<Snapshot> => {
		const operations = [
			...(reading ? [{ op: "reading.add", seconds: 7 }] : []),
			{ op: "preferences.patch", values },
		];
		const payload = { operations, expectedRevision: snapshot.revision };
		return JSON.parse(
			await sql(
				identity +
					`select public.sill_apply_operations(${quote(JSON.stringify(payload))}::jsonb,${quote(key)}) as value;`,
			),
		);
	};
	const legacy = await get();
	assert.equal(Object.hasOwn(legacy.state.preferences, "hiddenActions"), false);
	await assert.rejects(
		apply(legacy, { hiddenActions: ["reply"] }, "hidden-before"),
		/invalid_request/,
	);
	assert.deepEqual(await get(), legacy, "pre-migration rejection leaves workspace unchanged");
	await migrate(migration);
	const initial = await get();
	assert.deepEqual(initial, {
		...legacy,
		state: { ...legacy.state, preferences: { ...legacy.state.preferences, hiddenActions: [] } },
	});
	const saved = await apply(initial, { hiddenActions: actions, theme: "dark" }, "hidden-save");
	assert.deepEqual(saved.state.preferences.hiddenActions, actions);
	assert.equal(saved.state.preferences.theme, "dark");
	assert.ok(saved.revision > initial.revision);
	assert.deepEqual(await get(), saved, "public read returns saved preferences");
	assert.deepEqual(
		await apply(initial, { hiddenActions: actions, theme: "dark" }, "hidden-save"),
		saved,
		"replay does not apply twice",
	);
	for (const [index, value] of [
		["reply", "unlisted-action"],
		"reply",
		[1],
		Array(10).fill("reply"),
	].entries()) {
		const key = `hidden-invalid-${index}`;
		await assert.rejects(apply(saved, { hiddenActions: value }, key, true), /invalid_request/);
		assert.deepEqual(
			await get(),
			saved,
			"invalid preferences roll back reading time and revision too",
		);
		assert.equal(
			await sql(
				`reset role;select count(*) as value from sill_private.receipts where owner_id=${quote(owner)}::uuid and idempotency_key=${quote(key)};`,
			),
			"0",
			"failed batch creates no receipt",
		);
	}
	const cleared = await apply(saved, { hiddenActions: [] }, "hidden-clear");
	assert.deepEqual(cleared.state.preferences.hiddenActions, []);
	assert.equal(
		cleared.state.preferences.theme,
		"dark",
		"clearing hidden actions preserves other preferences",
	);
	assert.deepEqual(await get(), cleared);
}
