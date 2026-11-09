/** Long-text results are derived once per distinct string and older bodies leave within a budget. */
import assert from "node:assert/strict";
import test from "node:test";
import MarkdownIt from "markdown-it";
import { markdownBlocks, markdownExcerpt, markdownText } from "../../apps/web/atoms/markdown.ts";
import { textMemo } from "../../apps/web/atoms/text-memo.ts";
import { cardReadingTime, cardSearchText } from "../../apps/web/data/card-source.ts";

// @wu-test type=performance | scope=textMemo | protects=Reuse derived text and evict old bodies within the configured character budget
test("a memo derives each distinct text once and keeps the recently used ones within budget", () => {
	const derived: string[] = [];
	const length = textMemo((text: string) => {
		derived.push(text);
		return text.length;
	}, 6);
	assert.equal(length("abc"), 3);
	assert.equal(length("abc"), 3);
	assert.equal(length("de"), 2);
	assert.deepEqual(derived, ["abc", "de"]);
	// "abc" is used again, so the next addition pushes out "de" instead.
	length("abc");
	length("f");
	length("gh");
	length("abc");
	assert.deepEqual(derived, ["abc", "de", "f", "gh"]);
	length("de");
	assert.deepEqual(derived, ["abc", "de", "f", "gh", "de"]);
	// A text larger than the whole budget is still returned, then replaced by the next one.
	assert.equal(length("longer than six"), 15);
	assert.equal(length("x"), 1);
	assert.equal(length("longer than six"), 15);
	assert.equal(derived.filter((text) => text === "longer than six").length, 2);
});

// @wu-test type=performance | scope=Markdown derived text | protects=Parse a body once across excerpts, search text and reading time
test("one body is parsed once for its text, face excerpt and reading time", () => {
	const body = `## 合成正文缓存检查\n\n${"字".repeat(801)}\n\n- point one\n- point two`;
	const parse = MarkdownIt.prototype.parse;
	let parses = 0;
	MarkdownIt.prototype.parse = function (...args: Parameters<typeof parse>) {
		parses++;
		return parse.apply(this, args);
	};
	try {
		for (let render = 0; render < 3; render++) {
			assert.equal(cardReadingTime({ type: "article", body }), "约 3 分钟阅读");
			assert.equal(markdownExcerpt(body), markdownBlocks(body)[0]);
			assert.equal(markdownText(body), markdownBlocks(body).join("\n"));
		}
	} finally {
		MarkdownIt.prototype.parse = parse;
	}
	assert.equal(parses, 1);
});

// @wu-test type=behavior | scope=cardSearchText | protects=Keep search text current after card fields or personal notes change
test("search text matches the joined card fields and follows note and field changes", () => {
	const card = {
		title: "Synthetic Title",
		summary: "Short summary",
		body: "## Heading\n\nBody **text**",
		sources: [{ name: "Agent", kind: "agent" as const }],
		tags: ["Tag"],
	};
	assert.equal(
		cardSearchText(card, "Note"),
		"synthetic title short summary agent note heading\nbody text tag",
	);
	assert.match(cardSearchText(card, "Changed note"), /changed note/);
	const renamed = { ...card, title: "Renamed" };
	assert.match(cardSearchText(renamed, "Changed note"), /^renamed /);
	// A card edited in place is not served from the previous text either.
	card.summary = "Rewritten summary";
	assert.match(cardSearchText(card, "Changed note"), /rewritten summary/);
});
