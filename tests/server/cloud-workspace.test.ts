import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { cloudState, workspaceBatch } from "../../contracts/cloud.ts";
import { A, B, claims, identity, rpc, setupBoundary } from "./helpers/boundary-fixture.ts";

test("workspace atomic operations, state validation, old API, replay and owner boundary", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		for (const name of [
			"20261016052843_sill_rich_cards.sql",
			"20261016092653_sill_workspace_operations.sql",
		])
			await db.exec(
				await readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"),
			);
		await identity(db);
		const get = async () =>
			(await db.query<{ v: any }>("select public.sill_get_workspace() v")).rows[0].v as any;
		const apply = async (payload: any, key = "workspace-test-key") =>
			(
				await db.query<{ v: any }>("select public.sill_apply_operations($1::jsonb,$2) v", [
					JSON.stringify(payload),
					key,
				])
			).rows[0].v as any;
		assert.equal((await get()).revision, 0);
		const body = {
			operations: [
				{
					op: "card.upsert",
					card: {
						id: "task-one",
						type: "task",
						title: "Hello",
						tasks: [{ id: "t1", text: "One", done: true }],
						futureField: { keep: true },
					},
					before: null,
				},
			],
		};
		const first = await apply(body);
		assert.equal(first.revision, 1);
		assert.deepEqual(first.state.items["task-one"].taskDone, ["t1"]);
		assert.deepEqual(await apply(body), first);
		await assert.rejects(apply({ ...body, expectedRevision: 1 }), /idempotency_conflict/);
		await assert.rejects(apply(body, "workspace-create-dup"), /revision_conflict/);
		const patch = {
			operations: [
				{
					op: "item.patch",
					id: "task-one",
					values: { bookmarked: true, archived: true, lessLike: true, taskDone: ["t1"] },
					before: first.state.items["task-one"],
				},
				{ op: "preferences.patch", values: { theme: "dark" }, before: {} },
				{ op: "reading.add", seconds: 8 },
			],
			expectedRevision: 1,
		};
		const next = await apply(patch, "workspace-patch-key");
		assert.equal(next.state.seconds, 8);
		assert.equal(next.state.preferences.theme, "dark");
		assert.equal(next.state.items["task-one"].bookmarked, true);
		assert.equal(next.state.cards.length, 1);
		await assert.rejects(
			apply(
				{
					operations: [
						{ op: "reading.add", seconds: 1 },
						{ op: "item.patch", id: "task-one", values: { taskDone: ["other"] } },
					],
					expectedRevision: next.revision,
				},
				"workspace-rollback",
			),
			/invalid_request/,
		);
		assert.deepEqual(await get(), next);
		await assert.rejects(
			apply(
				{ operations: [{ op: "item.patch", id: "task-one", values: { read: true }, before: {} }] },
				"workspace-blind-key",
			),
			/invalid_request/,
		);
		await assert.rejects(
			apply(
				{
					operations: [{ op: "preferences.patch", values: { theme: "purple" } }],
					expectedRevision: next.revision,
				},
				"workspace-bad-pref",
			),
			/invalid_request/,
		);
		await assert.rejects(
			apply(
				{ operations: [{ op: "reading.add", seconds: 1 }], expectedRevision: 0 },
				"workspace-stale-key",
			),
			/revision_conflict/,
		);
		let card = next.state.cards[0];
		const old = await rpc(db, "sill_write_v1", [
			"update",
			card.id,
			{
				expectedRevision: card.revision,
				changes: { state: { note: "old API", reminderDone: true } },
			},
			"legacy-update-key",
		]);
		assert.equal(old.body.state.note, "old API");
		const shared = await get();
		assert.equal(shared.state.items[card.id].note, "old API");
		assert.ok(shared.revision > next.revision);
		card = shared.state.cards[0];
		const clean = { ...card, title: "Updated" };
		for (const key of ["revision", "state", "created_at", "updated_at", "deleted"])
			delete clean[key];
		delete clean.futureField;
		const edited = await apply(
			{ operations: [{ op: "card.upsert", card: clean, before: card }] },
			"workspace-edit-key",
		);
		assert.deepEqual(edited.state.cards[0].futureField, { keep: true });
		await db.exec("reset role");
		await db.exec(
			`update sill_private.caller_grants set scopes=array_append(scopes,'event:result') where owner_id='${A}';insert into sill_private.destinations values('${A}','result-target','user:${A}',array['summarize'],true)`,
		);
		await identity(db);
		const eventCard = edited.state.cards[0];
		await rpc(db, "sill_write_v1", [
			"submit_event",
			null,
			{
				event_id: "result-event",
				card_id: eventCard.id,
				card_version: eventCard.revision,
				action: "summarize",
				destination_ref: "result-target",
			},
			"workspace-event-key",
		]);
		await assert.rejects(
			rpc(db, "sill_write_v1", [
				"update",
				eventCard.id,
				{
					expectedRevision: eventCard.revision,
					changes: { state: { reminderDone: true } },
					metadata: { event_id: "result-event", outcome: "failed", summary: "failed" },
				},
				"workspace-failed-event",
			]),
			/invalid_request/,
		);
		const partial = await apply(
			{
				operations: [
					{ op: "preferences.patch", values: { theme: "light" }, before: { theme: "dark" } },
				],
			},
			"workspace-partial-pref",
		);
		assert.equal(partial.state.preferences.theme, "light");
		const reading = await apply(
			{ operations: [{ op: "reading.add", seconds: 3 }] },
			"workspace-reading-key",
		);
		assert.equal(reading.state.seconds, 11);
		await assert.rejects(
			apply(
				{
					operations: [
						{ op: "preferences.patch", values: { theme: "system" }, before: { theme: "dark" } },
					],
				},
				"workspace-stale-pref",
			),
			/revision_conflict/,
		);
		const taskBefore = (await get()).state.cards[0];
		await rpc(db, "sill_write_v1", [
			"update",
			taskBefore.id,
			{ expectedRevision: taskBefore.revision, changes: { state: { done: true } } },
			"workspace-task-complete",
		]);
		const taskComplete = await get();
		assert.deepEqual(taskComplete.state.items[taskBefore.id].taskDone, ["t1"]);
		assert.equal(taskComplete.state.items[taskBefore.id].done, true);
		const taskOpen = await apply(
			{
				operations: [
					{
						op: "item.patch",
						id: taskBefore.id,
						values: { taskDone: [] },
						before: { taskDone: ["t1"] },
					},
				],
			},
			"workspace-task-reopen",
		);
		assert.equal(taskOpen.state.items[taskBefore.id].done, false);
		assert.equal((await rpc(db, "sill_get_content", [taskBefore.id])).state.done, false);
		await assert.rejects(
			apply(
				{
					operations: [
						{ op: "item.patch", id: taskBefore.id, values: { taskDone: ["t1"], done: false } },
					],
					expectedRevision: taskOpen.revision,
				},
				"workspace-task-inconsistent",
			),
			/invalid_request/,
		);
		for (const [index, operation] of [
			{ op: "item.patch", id: taskBefore.id },
			{ op: "item.patch", id: taskBefore.id, values: null },
			{ op: "item.patch", id: taskBefore.id, values: { read: true }, before: null },
			{ op: "preferences.patch" },
			{ op: "preferences.patch", values: {}, before: null },
			{ op: "preferences.patch", values: null },
		].entries())
			await assert.rejects(
				apply(
					{ operations: [operation], expectedRevision: taskOpen.revision },
					"workspace-invalid-" + index,
				),
				/invalid_request/,
			);
		assert.deepEqual(await get(), taskOpen);
		await identity(db, claims(B));
		assert.equal((await get()).state.cards.length, 0);
		await assert.rejects(
			apply(
				{
					operations: [{ op: "item.patch", id: card.id, values: { read: true } }],
					expectedRevision: 0,
				},
				"workspace-other-key",
			),
			/not_found/,
		);
		await db.exec("reset role");
		await db.exec(
			`update sill_private.caller_grants set resources=array['task-one'] where owner_id='${A}'`,
		);
		await identity(db);
		await assert.rejects(get(), /forbidden/);
		await assert.rejects(apply(body), /forbidden/);
	} finally {
		await db.close();
	}
});
test("workspace request schemas reject forged server metadata and unknown state", () => {
	assert.equal(cloudState.safeParse({ lessLike: true }).success, true);
	assert.equal(cloudState.safeParse({ unknown: true }).success, false);
	assert.equal(
		workspaceBatch.safeParse({
			operations: [
				{
					op: "card.upsert",
					card: { id: "a", type: "note", title: "A", revision: 10 },
					before: null,
				},
			],
		}).success,
		false,
	);
});

test("workspace HTTP uses the same validation, session and receipt boundary", async () => {
	const { cloudFixture } = await import("./helpers/cloud-fixture.ts");
	const { createSillRuntime } = await import("../../server/cloud/http.ts");
	const { token } = await import("./helpers/signed-auth.ts");
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory });
		const url = f.config.appOrigin + "/api/v1/workspace/operations";
		const headers = {
			Cookie: "__Host-sill-access=" + token(),
			Origin: f.config.appOrigin,
			"Content-Type": "application/json",
			"Idempotency-Key": "http-workspace-key",
		};
		const body = JSON.stringify({
			operations: [
				{ op: "card.upsert", card: { id: "http-card", type: "note", title: "HTTP" }, before: null },
			],
		});
		const request = (extra: any = {}) =>
			new Request(url, { method: "POST", headers: { ...headers, ...extra }, body });
		const first = await runtime(request());
		assert.equal(first.status, 200);
		const snapshot = await first.json();
		assert.deepEqual(await (await runtime(request())).json(), snapshot);
		const sessionResponse = await runtime(
			new Request(f.config.appOrigin + "/auth/session", { headers: { Cookie: headers.Cookie } }),
		);
		const session = await sessionResponse.json();
		assert.equal(session.userId, A);
		assert.equal(session.workspaceRead, true);
		assert.equal(session.workspaceWrite, true);
		assert.ok(session.scopes.includes("content:write"));
		for (const [method, path] of [
			["POST", "/contents"],
			["PATCH", "/contents/http-card"],
			["DELETE", "/contents/http-card"],
			["POST", "/events"],
			["POST", "/workspace/operations"],
		]) {
			const denied = await runtime(
				new Request(f.config.appOrigin + "/api/v1" + path, {
					method,
					headers: { ...headers, "X-Sill-Owner": B },
					body: "{}",
				}),
			);
			assert.equal(denied.status, 403);
			assert.equal((await denied.json()).error.code, "forbidden");
		}
		for (const path of ["/workspace", "/contents", "/contents/http-card", "/health"]) {
			const readDenied = await runtime(
				new Request(f.config.appOrigin + "/api/v1" + path, {
					headers: { Cookie: headers.Cookie, "X-Sill-Owner": B },
				}),
			);
			assert.equal(readDenied.status, 403);
		}
		const sameOwner = await runtime(request({ "X-Sill-Owner": A }));
		assert.equal(sameOwner.status, 200);
		assert.deepEqual(await sameOwner.json(), snapshot);
		const switched = await runtime(
			request({ Cookie: "__Host-sill-access=" + token({ sub: B }), "X-Sill-Owner": A }),
		);
		assert.equal(switched.status, 403);
		const other = await runtime(
			new Request(f.config.appOrigin + "/api/v1/workspace", {
				headers: { Cookie: "__Host-sill-access=" + token({ sub: B }) },
			}),
		);
		assert.deepEqual((await other.json()).state.cards, []);
		const unchanged = await runtime(
			new Request(f.config.appOrigin + "/api/v1/workspace", {
				headers: { Cookie: headers.Cookie },
			}),
		);
		assert.deepEqual(await unchanged.json(), snapshot);

		assert.equal((await runtime(request({ "Idempotency-Key": "bad" }))).status, 400);
		assert.equal((await runtime(request({ Origin: "https://other.example" }))).status, 403);
		assert.equal(
			(
				await runtime(
					new Request(url, {
						method: "POST",
						headers,
						body: JSON.stringify({
							operations: [{ op: "item.patch", id: "http-card", values: { unexpected: true } }],
							expectedRevision: 1,
						}),
					}),
				)
			).status,
			400,
		);
	} finally {
		await f.close();
	}
});
