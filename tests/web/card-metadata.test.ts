import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Card } from "../../contracts/card.ts";
import {
	cardDate,
	cardDates,
	cardReadingTime,
	detailSource,
} from "../../apps/web/data/card-source.ts";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";

const article: Card = {
	id: "explicit-article",
	type: "article",
	title: "Article",
	sources: [{ kind: "readwise", name: "Reader" }],
	authors: [{ name: "Writer" }],
	publisher: { name: "Publisher" },
	body: ["Body"],
	bodyCoverage: "full",
	readingEstimate: { seconds: 360, origin: "provided", scope: "full" },
	tags: ["Tag"],
};

test("publication, source save and system times stay distinct without aliases", () => {
	const dates = cardDates({
		publishedAt: "2026-10-01",
		savedAt: "2026-10-13",
		created_at: "2026-10-16T01:00:00Z",
		updated_at: "2026-10-17T01:00:00Z",
	});
	assert.equal(dates.published?.text, "2026-10-01");
	assert.equal(dates.saved?.text, "2026-10-13");
	assert.equal(dates.created?.datetime, "2026-10-16T01:00:00.000Z");
	assert.equal(cardDates({ published_at: "2026-10-01" }).published, null);
});

test("invalid and ambiguous content dates never become invented timestamps", () => {
	for (const value of [
		null,
		undefined,
		"",
		false,
		"2026-02-30",
		"2026-02-30T12:00:00Z",
		"2026-10-13T12:00:00",
		Infinity,
		-1,
	])
		assert.equal(cardDate(value), null, String(value));
	assert.equal(cardDate("2024-02-29")?.text, "2024-02-29");
});

test("all reading surfaces use the same explicit estimate and never infer notes or legacy metadata", () => {
	Store.state = Store.fresh();
	Store.state.items[article.id] = { note: "Personal <script> & note" };
	const before = JSON.stringify(article);
	const card = new JSDOM(cardHTML(article)).window.document;
	assert.ok(card.body.textContent!.includes("Reader · 约 6 分钟阅读"));
	assert.ok(!card.body.textContent!.includes("Personal"));
	const blocks = [Panels.preview({}, article), Panels.reader({}, article)].map((html) => {
		const doc = new JSDOM(html).window.document;
		assert.equal(doc.querySelector(".preview-meta")?.textContent, "Reader · 约 6 分钟阅读");
		assert.ok(doc.querySelector(".preview-published")?.textContent.includes("作者 · Writer"));
		assert.ok(doc.querySelector(".preview-published")?.textContent.includes("发布方 · Publisher"));
		const note = doc.querySelector("aside.preview-note")!;
		assert.equal(note.querySelector(".preview-note-label")?.textContent, "备注");
		assert.equal(note.querySelector("p")?.textContent, "Personal <script> & note");
		assert.equal(doc.querySelector("script"), null);
		const body = doc.querySelector(".preview-body,.reader-body") as HTMLElement;
		assert.ok(body.textContent!.indexOf("Body") < body.textContent!.indexOf("Personal"));
		return Array.from(body.children)
			.filter((n) => n.id !== "reader-end")
			.map((n) => [n.tagName, n.className, n.textContent]);
	});
	assert.deepEqual(blocks[0], blocks[1]);
	assert.equal(JSON.stringify(article), before);
	assert.equal(detailSource(article), "Reader");
	assert.equal(Card.safeParse({ ...article, meta: "6min" }).success, false);
});

test("scope, missing estimates and explicit clears keep their distinct meaning", () => {
	assert.equal(cardReadingTime({ ...article, readingEstimate: null }), "");
	assert.equal(cardReadingTime({ readingEstimate: undefined }), "");
	assert.equal(
		cardReadingTime({
			...article,
			readingEstimate: { seconds: 61, origin: "provided", scope: "available" },
		}),
		"当前内容约 2 分钟阅读",
	);
});

test("date-only precision stays unchanged across device zones", () => {
	const original = process.env.TZ;
	try {
		process.env.TZ = "Asia/Shanghai";
		assert.equal(cardDate("2026-10-13T20:30:00Z")?.text, "2026-10-14 04:30 UTC+08:00");
		assert.equal(cardDate("2026-10-13")?.text, "2026-10-13");
		process.env.TZ = "America/Los_Angeles";
		assert.equal(cardDate("2026-10-13T01:30:00Z")?.text, "2026-10-12 18:30 UTC-07:00");
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
});

test("specialized mail and file views retain estimates; podcasts retain personal notes", () => {
	Store.state = Store.fresh();
	for (const card of [
		{
			id: "estimated-mail",
			type: "mail",
			title: "Mail",
			body: ["Body"],
			readingEstimate: { seconds: 360, origin: "provided" as const, scope: "full" as const },
		},
		{
			id: "estimated-file",
			type: "file",
			title: "File",
			files: [{ name: "report.pdf" }],
			readingEstimate: { seconds: 360, origin: "provided" as const, scope: "full" as const },
		},
	]) {
		assert.match(
			new JSDOM(Panels.preview({}, card)).window.document.body.textContent!,
			/约 6 分钟阅读/,
		);
		assert.match(new JSDOM(cardHTML(card)).window.document.body.textContent!, /约 6 分钟阅读/);
	}
	const podcast: Card = {
		id: "noted-podcast",
		type: "media",
		media: "podcast",
		title: "Podcast",
		body: [],
	};
	Store.state.items[podcast.id] = { note: "Personal podcast note" };
	const doc = new JSDOM(Panels.preview({}, podcast)).window.document;
	assert.equal(doc.querySelector("aside.preview-note p")?.textContent, "Personal podcast note");
	assert.equal(doc.querySelector(".preview-note-label")?.textContent, "备注");
});
