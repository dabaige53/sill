import assert from "node:assert/strict";
import test from "node:test";
import { searchPage, toolInputs } from "../../contracts/cloud.ts";
import { searchCards } from "../../server/cloud/content-search.ts";

const card = (id: string, created: string, fields: Record<string, unknown>) => ({
	id,
	type: "article",
	title: id,
	body: "",
	state: {},
	revision: 1,
	created_at: created,
	updated_at: created,
	deleted: false,
	...fields,
});
const snapshot = {
	revision: 3,
	state: {
		cards: [
			card("old-body", "2026-10-01T00:00:00Z", {
				body: "## 收集\n\n把**雨水**引入储水桶，再过滤。",
				sources: [{ name: "庭院观察", kind: "web" }],
			}),
			card("new-body", "2026-10-20T00:00:00Z", { body: "雨水 储水 计划" }),
			card("title-hit", "2026-09-01T00:00:00Z", {
				title: "雨水储水入门",
				summary: "三步收集雨水。",
				url: "https://example.com/rain",
			}),
			card("other", "2026-10-25T00:00:00Z", { body: "与关键词无关" }),
		],
		items: { "old-body": { archived: true, note: "储水 备忘" } },
		preferences: {},
		seconds: 0,
	},
};

test("keyword search needs every word, ranks title hits then newest, and omits bodies", () => {
	const result = searchCards(snapshot, "雨水 储水");
	assert.deepEqual(
		result.items.map((hit) => hit.id),
		["title-hit", "new-body", "old-body"],
	);
	assert.equal(result.total, 3);
	assert.deepEqual(searchPage.parse(result), result);
	for (const hit of result.items) assert.equal("body" in hit, false);
	const archived = result.items.find((hit) => hit.id === "old-body");
	assert.equal(archived?.archived, true);
	assert.equal(archived?.summary, "收集 把雨水引入储水桶，再过滤。");
	assert.deepEqual(archived?.sources, [{ name: "庭院观察", kind: "web" }]);
	assert.equal(searchCards(snapshot, "example.com/rain").items[0].id, "title-hit");
	assert.equal(searchCards(snapshot, "庭院观察").items[0].id, "old-body");
	assert.equal(searchCards(snapshot, "雨水 不存在").total, 0);
	assert.equal(searchCards(snapshot, "雨水", 1).items.length, 1);
	assert.equal(searchCards(snapshot, "雨水", 1).total, 3);
});

test("search input trims plain keywords and caps the page size", () => {
	const input = toolInputs.sill_searchContents;
	assert.deepEqual(input.parse({ query: "  雨水  " }), { query: "雨水" });
	assert.equal(input.safeParse({ query: "   " }).success, false);
	assert.equal(input.safeParse({ query: "雨水", limit: 51 }).success, false);
	assert.equal(input.safeParse({ query: "雨水", type: "article" }).success, false);
});
