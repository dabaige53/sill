import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { searchPage, toolInputs } from "../../contracts/cloud.ts";
import { searchResult } from "../../server/cloud/content-search.ts";
import { applyCardMigrations, identity, rpc, setupBoundary } from "./helpers/boundary-fixture.ts";

test("database keyword search needs every word, ranks title hits then newest, and omits bodies", async () => {
	const db = new PGlite();
	try {
		await setupBoundary(db);
		await applyCardMigrations(db);
		await identity(db);
		const write = async (card: object, key: string, state?: object) =>
			(
				await rpc(db, "sill_write_v1", [
					"create",
					null,
					JSON.stringify({ ...card, ...(state && { state }) }),
					key,
				])
			).body.id;
		const old = await write(
			{
				type: "article",
				title: "Old body",
				body: "## 收集\n\n把**雨水**引入储水桶，再过滤。",
				sources: [{ name: "庭院观察", kind: "web" }],
			},
			"search_old_01",
			{ archived: true, note: "储水 备忘" },
		);
		const titled = await write(
			{
				type: "article",
				title: "雨水储水入门",
				summary: "三步收集雨水。",
				url: "https://example.com/rain",
			},
			"search_title_01",
		);
		const fresh = await write(
			{ type: "note", title: "New body", body: "雨水 储水 计划" },
			"search_new_01",
		);
		await write({ type: "note", title: "Other", body: "与关键词无关" }, "search_other_01");
		const search = async (query: string, limit: number | null = null) =>
			searchResult(await rpc(db, "sill_search_contents", [query, limit]));
		const result = await search("雨水 储水");
		assert.deepEqual(
			result.items.map((hit) => hit.id),
			[titled, fresh, old],
		);
		assert.equal(result.total, 3);
		assert.deepEqual(searchPage.parse(result), result);
		for (const hit of result.items) assert.equal("body" in hit, false);
		const archived = result.items.find((hit) => hit.id === old);
		assert.equal(archived?.archived, true);
		assert.equal(archived?.summary, "收集 把雨水引入储水桶，再过滤。");
		assert.deepEqual(archived?.sources, [{ name: "庭院观察", kind: "web" }]);
		assert.equal((await search("EXAMPLE.com/rain")).items[0].id, titled);
		assert.equal((await search("庭院观察")).items[0].id, old);
		assert.equal((await search("备忘")).items[0].id, old);
		assert.equal((await search("雨水 不存在")).total, 0);
		const limited = await search("雨水", 1);
		assert.equal(limited.items.length, 1);
		assert.equal(limited.total, 3);
		await assert.rejects(search("雨水", 51), /invalid_request/);
	} finally {
		await db.close();
	}
});

test("search input trims plain keywords and caps the page size", () => {
	const input = toolInputs.sill_searchContents;
	assert.deepEqual(input.parse({ query: "  雨水  " }), { query: "雨水" });
	assert.equal(input.safeParse({ query: "   " }).success, false);
	assert.equal(input.safeParse({ query: "雨水", limit: 51 }).success, false);
	assert.equal(input.safeParse({ query: "雨水", type: "article" }).success, false);
});
