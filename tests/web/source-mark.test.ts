import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { publicationName, sourceBrand, sourceMarkHtml } from "../../apps/web/cards/source-mark.tsx";

test("source brands use explicit identity without treating a generic mailbox as Gmail", () => {
	assert.equal(sourceBrand({ kind: "mail", name: "Work" }), undefined);
	assert.equal(sourceBrand({ kind: "mail", name: "Gmail · Work" }), "gmail");
	assert.equal(sourceBrand({ kind: "youtube", name: "Channel" }), "youtube");
	assert.equal(sourceBrand({ kind: "web", name: "Not GitHub" }), undefined);
	assert.equal(
		publicationName({
			type: "article",
			publisher: { name: "Publisher" },
			authors: [{ name: "Writer" }, { name: "Publisher" }],
		}),
		"Publisher · Writer",
	);
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
