/** Detail text renders through one Markdown renderer without HTML, image loading or unsafe links (ADR 0063). */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { markdownBlocks, markdownHtml, markdownText } from "../../apps/web/atoms/markdown.ts";
import { normalizeCard } from "../../contracts/card-migration.ts";

const render = (text: string) => new JSDOM(markdownHtml(text)).window.document;

test("common Markdown blocks render as structure", () => {
	const doc = render("## Heading\n\n1. First\n2. Second\n\n- Item\n\n> Quote\n\n**Bold** and `code`");
	assert.equal(doc.querySelector("h2")?.textContent, "Heading");
	assert.equal(doc.querySelectorAll("ol li").length, 2);
	assert.equal(doc.querySelector("ul li")?.textContent, "Item");
	assert.equal(doc.querySelector("blockquote p")?.textContent, "Quote");
	assert.equal(doc.querySelector("strong")?.textContent, "Bold");
	assert.equal(doc.querySelector("code")?.textContent, "code");
});

test("raw HTML stays text, images are not loaded and only safe links open", () => {
	const doc = render(
		'<script>alert(1)</script> <img src="https://example.com/x.png">\n\n![Alt](https://example.com/y.png)\n\n[Safe](https://example.com) [Mail](mailto:a@example.com) [Bad](javascript:alert(1)) [File](file:///etc/passwd)',
	);
	assert.equal(doc.querySelectorAll("script, img").length, 0);
	assert.match(doc.body.textContent, /<script>alert\(1\)<\/script>/);
	assert.match(doc.body.textContent, /Alt/);
	const links = [...doc.querySelectorAll("a")];
	assert.deepEqual(
		links.map((link) => link.getAttribute("href")),
		["https://example.com", "mailto:a@example.com"],
	);
	for (const link of links) {
		assert.equal(link.getAttribute("target"), "_blank");
		assert.equal(link.getAttribute("rel"), "noopener noreferrer");
	}
});

test("plain text drops markup for search, excerpts and the card face", () => {
	const text = "## Title\n\n1. **One** point\n2. Two\n\nA [link](https://example.com)\nwraps";
	assert.deepEqual(markdownBlocks(text), ["Title", "One point", "Two", "A link wraps"]);
	assert.equal(markdownText(text), "Title\nOne point\nTwo\nA link wraps");
});

test("legacy body arrays and points become one Markdown body when read", () => {
	const card = normalizeCard({
		id: "legacy",
		type: "digest",
		title: "Legacy",
		points: ["A", "B"],
		body: ["First", " ", "Second"],
	} as unknown as Parameters<typeof normalizeCard>[0]);
	assert.equal(card.body, "1. A\n2. B\n\nFirst\n\nSecond");
	assert.equal("points" in card, false);
	const empty = normalizeCard({ id: "e", type: "note", title: "E", body: [] } as never);
	assert.equal("body" in empty, false);
	const current = normalizeCard({ id: "c", type: "note", title: "C", body: "Kept" });
	assert.equal(current.body, "Kept");
});
