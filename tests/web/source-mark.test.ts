import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { publicationName, sourceBrand, sourceMarkHtml } from "../../apps/web/cards/source-mark.tsx";
import marks from "../../design-system/assets/source-marks/marks.json" with { type: "json" };

test("source brands use explicit identity without treating a generic mailbox as Gmail", () => {
	assert.equal(sourceBrand({ kind: "mail", name: "Work" }), undefined);
	assert.equal(sourceBrand({ kind: "mail", name: "Gmail · Work" }), "gmail");
	assert.equal(sourceBrand({ kind: "youtube", name: "Channel" }), "youtube");
	assert.equal(sourceBrand({ kind: "web", name: "Not GitHub" }), undefined);
	assert.equal(
		publicationName({
			type: "article",
			authors: [{ name: "Writer" }, { name: "Publisher" }, { name: "Writer" }],
		}),
		"Writer · Publisher",
	);
});

test("reading, task and note brands match explicit kinds and account names", () => {
	for (const [brand, name, type] of [
		["readwise", "Readwise", "article"],
		["todoist", "Todoist", "task"],
		["dedaobiji", "得到笔记", "note"],
	] as const) {
		assert.equal(sourceBrand({ kind: brand, name: "Personal" }), brand);
		assert.equal(sourceBrand({ kind: "web", name }), brand);
		assert.equal(sourceBrand({ kind: "web", name: ` ${name.toLowerCase()} · Personal ` }), brand);
		assert.equal(sourceBrand({ kind: "web", name: `${name} Notes` }), undefined);
		const doc = new JSDOM(sourceMarkHtml({ type, sources: [{ kind: brand, name }] })).window
			.document;
		assert.equal(doc.querySelector(".source-mark svg path")?.getAttribute("d"), marks[brand].path);
	}
	assert.equal(sourceBrand({ kind: "task", name: "Personal" }), undefined);
	assert.equal(sourceBrand({ kind: "note", name: "Personal" }), undefined);
});

test("source marks limit stacks and never render unknown source text as markup", () => {
	const source = { kind: "unknown", name: '<img src=x onerror="alert(1)">' };
	const doc = new JSDOM(sourceMarkHtml({ type: "article", sources: Array(5).fill(source) })).window
		.document;
	assert.equal(doc.querySelectorAll(".source-mark").length, 3);
	assert.equal(doc.querySelector("img"), null);
	assert.ok(!doc.body.textContent?.includes(source.name));
	assert.ok(!sourceMarkHtml({ type: "task", sources: [source] }).includes('class="source-mark"'));
});
