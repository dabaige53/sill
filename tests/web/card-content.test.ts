import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { cardDateLabel, cardSummaryText } from "../../apps/web/data/card-source.ts";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";

test("card summaries have a text bound while every detail retains the full summary", () => {
	Store.state = Store.fresh();
	const summary = "结论🙂".repeat(60);
	assert.equal(Array.from(cardSummaryText(summary)).length, 120);
	assert.equal(cardSummaryText("字".repeat(120)), "字".repeat(120));
	for (const seed of SeedCards) {
		const card = { ...seed, summary };
		const before = structuredClone(card);
		for (const html of [
			Panels.preview({}, card),
			...(card.type === "photo" ? [Panels.lightbox(card)] : []),
		]) {
			const dom = new JSDOM(html);
			try {
				assert.equal(dom.window.document.querySelectorAll(".detail-summary").length, 1, card.id);
				assert.equal(
					dom.window.document.querySelector(".detail-summary p")?.textContent,
					summary,
					card.id,
				);
			} finally {
				dom.window.close();
			}
		}
		assert.deepEqual(card, before);
	}
	const article = {
		id: "long-summary",
		type: "article",
		title: "One title",
		summary,
		body: "Full body",
	};
	for (const render of [Panels.preview, Panels.reader]) {
		const dom = new JSDOM(render({}, article));
		try {
			assert.equal(dom.window.document.querySelector("h1")?.textContent, article.title);
			assert.equal(dom.window.document.querySelector(".detail-summary p")?.textContent, summary);
			assert.ok(
				dom.window.document.body.textContent?.indexOf(summary) <
					dom.window.document.body.textContent?.indexOf("Full body"),
			);
		} finally {
			dom.window.close();
		}
	}
	const face = new JSDOM(cardHTML(article));
	try {
		assert.equal(
			face.window.document.querySelector(".card-summary")?.textContent,
			cardSummaryText(summary),
		);
	} finally {
		face.window.close();
	}
});

test("task and reminder types and time placement do not depend on item count or source name", () => {
	Store.state = Store.fresh();
	const due = Date.parse("2026-11-01T10:00:00+08:00");
	for (const type of ["task", "reminder"])
		for (const count of [1, 6]) {
			const card = {
				id: "schedule",
				type,
				title: "Synthetic action",
				due,
				tags: ["Topic"],
				sources: [{ name: "提醒事项", kind: "reminders" }],
				...(type === "task"
					? {
							tasks: Array.from({ length: count }, (_, i) => ({
								id: `step-${i}`,
								text: `Step ${i}`,
							})),
						}
					: {}),
			};
			Store.state.cards = [card];
			for (const render of [cardHTML, (c) => Panels.preview({}, c)]) {
				const dom = new JSDOM(render(card));
				try {
					const d = dom.window.document;
					assert.equal(
						d.querySelector(".card-src,.preview-meta")?.textContent,
						type === "task" ? "待办" : "提醒",
					);
					const title = d.querySelector("h1,h2");
					assert.ok(title);
					assert.equal(title.nextElementSibling?.className, "card-schedule");
					assert.match(
						title.nextElementSibling?.textContent ?? "",
						type === "task" ? /^截止 · / : /^提醒 · /,
					);
					assert.equal(d.querySelector(".card-head-right .reminder-label"), null);
					if (type === "task") assert.equal(d.querySelectorAll(".check-item").length, count);
				} finally {
					dom.window.close();
				}
			}
		}
});

test("legacy long lists display all items without a hidden-count notice", () => {
	Store.state = Store.fresh();
	const card = {
		id: "legacy-list",
		type: "task",
		title: "Legacy work",
		tasks: Array.from({ length: 13 }, (_, i) => ({ id: `t-${i}`, text: `Task ${i}` })),
	};
	const dom = new JSDOM(cardHTML(card, { state: { taskDone: ["t-8"] } }));
	try {
		assert.equal(dom.window.document.querySelectorAll(".check-item").length, 13);
		assert.equal(dom.window.document.querySelector(".more-items"), null);
		assert.equal(
			dom.window.document.querySelector('[data-extra="t-8"]')?.getAttribute("aria-checked"),
			"true",
		);
	} finally {
		dom.window.close();
	}
});

test("insertion fallback is labelled consistently and never uses the update time", () => {
	const card = {
		id: "date",
		type: "note",
		title: "Old note",
		created_at: "2026-10-30T05:00:00Z",
		updated_at: "2026-10-31T05:00:00Z",
	};
	const expected = cardDateLabel(card);
	assert.match(expected, /^加入 · /);
	assert.equal(cardDateLabel({ ...card, updated_at: "2026-11-01T00:00:00Z" }), expected);
	for (const html of [cardHTML(card), Panels.preview({}, card), Panels.reader({}, card)]) {
		const dom = new JSDOM(html);
		try {
			assert.ok(dom.window.document.body.textContent?.includes(expected));
		} finally {
			dom.window.close();
		}
	}
	assert.doesNotMatch(cardDateLabel({ ...card, publishedAt: "2025-01-01" }), /加入/);
});
