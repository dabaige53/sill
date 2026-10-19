import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardDate, cardDates, detailSource } from "../../apps/web/data/card-source.ts";
import { cloudCard } from "../../apps/web/data/cloud-card.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";

test("publication, source save and Sill write dates stay distinct", () => {
	const dates = cardDates({
		published_at: "2026-10-01",
		saved_at: "2026-10-13",
		created_at: "2026-10-16T01:00:00Z",
		updated_at: "2026-10-17T01:00:00Z",
	});
	assert.equal(dates.published?.text, "2026-10-01");
	assert.equal(dates.saved?.text, "2026-10-13");
	assert.equal(dates.created?.datetime, "2026-10-16T01:00:00.000Z");
	assert.equal(dates.updated?.datetime, "2026-10-17T01:00:00.000Z");
	assert.match(dates.created!.text, /UTC[+-]\d{2}:\d{2}$/);
});

test("ambiguous, invalid and missing timestamps never become invented dates", () => {
	for (const value of [
		undefined,
		null,
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
	assert.equal(cardDate("2026-10-13T01:00:00+08:00")?.datetime, "2026-10-12T17:00:00.000Z");
	const card = cloudCard(
		{ id: "synthetic", type: "article", title: "Synthetic", updated_at: "2026-10-17T01:00:00Z" },
		{ source: "Sill", meta: "" },
	);
	assert.ok(card.time);
	assert.equal(cardDates(card).published, null);
	assert.equal(cardDates(card).created, null);
});

test("preview and reader keep tags under title and labelled dates outside the source header", () => {
	const card = {
		id: "synthetic-metadata",
		type: "article",
		title: "Synthetic article",
		sources: [
			{ name: "Readwise", kind: "readwise" },
			{ name: "Readwise", kind: "readwise" },
		],
		tags: ["Test"],
		meta: "Reader · 2026-10-13 保存 · Reader 标记未打开",
		body: ["Synthetic body"],
		created_at: "2026-10-16T01:00:00Z",
	};
	Store.state.items = {};
	const before = JSON.stringify(card);
	for (const html of [Panels.preview({}, card), Panels.reader({}, card)]) {
		const doc = new JSDOM(html).window.document;
		assert.equal(doc.querySelector(".preview-meta")?.textContent, "Readwise");
		assert.equal(doc.querySelector("h1")?.nextElementSibling?.className, "preview-tags");
		assert.equal(doc.querySelectorAll(".preview-tags").length, 1);
		assert.match(doc.querySelector(".preview-details")!.textContent!, /发布时间未提供/);
		assert.match(doc.querySelector(".preview-details")!.textContent!, /写入 Sill/);
		assert.match(doc.querySelector(".preview-source-note")!.textContent!, /2026-10-13 保存/);
		assert.equal(doc.querySelectorAll("time").length, 1);
	}
	assert.equal(JSON.stringify(card), before);
	assert.equal(detailSource(card), "Readwise");
});

test("metadata escapes source notes and does not repeat identical update time", () => {
	const html = Panels.details({
		type: "article",
		meta: "<img src=x onerror=alert(1)>",
		created_at: "2026-10-16T01:00:00Z",
		updated_at: "2026-10-16T01:00:00Z",
	});
	const doc = new JSDOM(html).window.document;
	assert.equal(doc.querySelector("img"), null);
	assert.equal(doc.querySelectorAll("time").length, 1);
	assert.doesNotMatch(doc.body.textContent!, /更新于/);
});

test("instant formatting follows the device zone without shifting date-only values", () => {
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
