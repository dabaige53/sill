/** Detail text renders through one Markdown renderer without HTML, image loading or unsafe links (ADR 0063). */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import MarkdownIt from "markdown-it";
import {
	internalCardRoute,
	markdownBlocks,
	markdownHeadings,
	markdownHtml,
	markdownText,
} from "../../apps/web/atoms/markdown.ts";

const render = (text: string) => new JSDOM(markdownHtml(text)).window.document;

test("card URLs stay in Sill while external articles retain their destination", () => {
	const base = "http://localhost:5173/#feed";
	assert.equal(internalCardRoute("http://127.0.0.1:4318/#card/demo-note", base), "#card/demo-note");
	assert.equal(internalCardRoute("#read/demo-note", base), "#read/demo-note");
	assert.equal(
		internalCardRoute(
			"https://sill-web-preview.scs1213-temp-email.workers.dev/#card/demo-note",
			base,
		),
		"#card/demo-note",
	);
	assert.equal(internalCardRoute("https://example.com/#card/demo-note", base), null);
	assert.equal(internalCardRoute("http://localhost:5173/article#card/demo-note", base), null);
});

test("common Markdown blocks render as structure", () => {
	const doc = render(
		"## Heading\n\n1. First\n2. Second\n\n- Item\n\n> Quote\n\n**Bold** and `code`",
	);
	assert.equal(doc.querySelector("h2")?.textContent, "Heading");
	assert.equal(doc.querySelectorAll("ol li").length, 2);
	assert.equal(doc.querySelector("ul li")?.textContent, "Item");
	assert.equal(doc.querySelector("blockquote p")?.textContent, "Quote");
	assert.equal(doc.querySelector("strong")?.textContent, "Bold");
	assert.equal(doc.querySelector("code")?.textContent, "code");
});

test("tables render inside their own horizontal scroll frame", () => {
	const doc = render("| 项目 | 说明 |\n| --- | --- |\n| A | 一段较长的说明文字 |");
	const frame = doc.querySelector(".markdown-table");
	assert.equal(frame?.firstElementChild?.tagName, "TABLE");
	assert.equal(frame?.querySelectorAll("tbody td").length, 2);
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

/** Counts the Markdown parses `read` causes. */
function parses(read: () => void) {
	const parse = MarkdownIt.prototype.parse;
	let calls = 0;
	MarkdownIt.prototype.parse = function (...args) {
		calls++;
		return parse.apply(this, args);
	};
	try {
		read();
	} finally {
		MarkdownIt.prototype.parse = parse;
	}
	return calls;
}

test("feed faces, reading time and search parse each body once", () => {
	const body = "## Plan\n\nRead **this** body once.";
	const calls = parses(() => {
		const blocks = markdownBlocks(body);
		blocks.push("changed by a caller");
		for (let i = 0; i < 5; i++) {
			assert.deepEqual(markdownBlocks(body), ["Plan", "Read this body once."]);
			assert.equal(markdownText(body), "Plan\nRead this body once.");
		}
	});
	assert.equal(calls, 1);
});

test("searching a large workspace again parses no body twice", () => {
	const bodies = Array.from({ length: 1200 }, (_, i) => `## Card ${i}\n\nWorkspace body ${i}.`);
	const calls = parses(() => {
		for (let pass = 0; pass < 3; pass++) for (const body of bodies) markdownText(body);
	});
	assert.equal(calls, bodies.length);
});

test("bodies unused for ten minutes leave the cache as new bodies arrive", (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 3600000 });
	const stale = "Edited away **long ago**.",
		recent = "Still on the **desk**.";
	markdownText(stale);
	t.mock.timers.tick(11 * 60000);
	markdownText(recent);
	parses(() => {
		for (let i = 0; i < 6000; i++) markdownText(`Arrival ${i}`);
	});
	assert.equal(
		parses(() => markdownText(recent)),
		0,
	);
	assert.equal(
		parses(() => markdownText(stale)),
		1,
	);
});

test("code blocks remain searchable and available as card text", () => {
	assert.deepEqual(markdownBlocks("```js\nconst result = 42;\n```\n\n    indented"), [
		"const result = 42;",
		"indented",
	]);
});

test("an unclosed multiline reference does not stall card text parsing", () => {
	const source = '[a]: https://example.com "' + "x\n".repeat(240000);
	const start = process.cpuUsage();
	const html = markdownHtml(source);
	const usage = process.cpuUsage(start);
	const cpuMs = (usage.user + usage.system) / 1000;
	assert.ok(cpuMs < 2000, `480 KB malformed reference used ${cpuMs} ms of CPU`);
	assert.match(html, /example\.com/);
});

test("article outline targets actual headings including duplicate titles, not code or intro text", () => {
	const source =
		"Intro\n\n## **Chapter**\n\n### Detail `one`\n\n```md\n## Not a chapter\n```\n\n## **Chapter**";
	const headings = markdownHeadings(source);
	const doc = new JSDOM(markdownHtml(source, "reader-section")).window.document;
	assert.deepEqual(
		headings.map((h) => [h.title, h.depth]),
		[
			["Chapter", 2],
			["Detail one", 3],
			["Chapter", 2],
		],
	);
	assert.equal(new Set(headings.map((h) => h.id)).size, 3);
	for (const heading of headings)
		assert.equal(doc.getElementById(heading.id)?.textContent, heading.title);
	assert.deepEqual(markdownHeadings("Just a paragraph"), []);
	assert.equal(new JSDOM(markdownHtml("## Preview")).window.document.querySelector("h2")?.id, "");
});
