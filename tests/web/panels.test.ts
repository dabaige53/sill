/** Preview extraction keeps card content, escaping and assistant placement across card types. */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { CardTypes, SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";

const cards = Object.keys(CardTypes).map((type) => SeedCards.find((card) => card.type === type));
cards.push(SeedCards.find((card) => card.type === "media" && card.media === "podcast"));
for (const [index, seed] of cards.entries()) {
	test(`preview preserves escaped content and one assistant action: ${seed.type}/${index}`, () => {
		Store.state = Store.fresh();
		const text = 'Synthetic <script> & "quoted" ${literal}';
		const card = {
			...seed,
			title: text,
			tags: [text],
			body: text,
			summary: text,
			why: { reason: "Synthetic reason", basis: ["Keep evidence"] },
		};
		const before = JSON.stringify(card);
		const dom = new JSDOM(
			Panels.preview({ agentAction: () => "<button data-agent-test>Assistant</button>" }, card),
		);
		try {
			const document = dom.window.document;
			assert.equal(document.querySelectorAll("#modal-title").length, 1);
			assert.equal(document.querySelector("#modal-title")?.textContent, text);
			assert.equal(document.querySelectorAll("script").length, 0);
			assert.equal(document.querySelectorAll("[data-agent-test]").length, 1);
			assert.ok(document.querySelector(".sheet-scroll[tabindex='0']"));
			assert.equal(document.querySelectorAll("input:not([type=range]),textarea").length, 0);
			assert.equal(document.querySelector('[data-action="why"]'), null);
			assert.deepEqual(card.why, { reason: "Synthetic reason", basis: ["Keep evidence"] });
			assert.equal(JSON.stringify(card), before);
		} finally {
			dom.window.close();
		}
	});
}

test("quote and repeated summaries stay out of the preview lead; suggestions link only known cards", () => {
	Store.state = Store.fresh();
	const article = {
		id: "preview-text",
		type: "article",
		title: "Synthetic",
		body: "Repeated",
		summary: "Repeated",
	};
	const related = {
		id: "preview-related",
		type: "note",
		title: "<img src=x> & reference",
		body: "Reference",
	};
	Store.state.cards.push(related);
	for (const card of [
		article,
		{ ...article, type: "note", form: "quote", summary: "Quote attribution" },
	]) {
		const dom = new JSDOM(Panels.preview({}, card));
		try {
			assert.equal(dom.window.document.querySelector(".preview-lead"), null);
		} finally {
			dom.window.close();
		}
	}
	const dom = new JSDOM(
		Panels.preview({}, { ...article, type: "suggestion", related: [related.id, "missing"] }),
	);
	try {
		const links = dom.window.document.querySelectorAll('.detail-related [data-action="card-open"]');
		assert.equal(links.length, 1);
		assert.equal(links[0].getAttribute("data-id"), related.id);
		assert.equal(
			links[0].querySelector(":scope > span:not(.row-icon)")?.textContent,
			related.title,
		);
		assert.equal(links[0].querySelector("img"), null);
	} finally {
		dom.window.close();
	}
});

test("task checks and completed reminder controls reflect stored state without changing the card", () => {
	Store.state = Store.fresh();
	const task = SeedCards.find((card) => card.type === "task"),
		reminder = SeedCards.find((card) => card.type === "reminder");
	Store.item(task.id).taskDone = [task.tasks[0].id];
	Store.item(reminder.id).reminderDone = true;
	const before = JSON.stringify([task, reminder]);
	const taskDom = new JSDOM(Panels.preview({}, task));
	const reminderDom = new JSDOM(Panels.preview({}, reminder));
	try {
		assert.equal(
			taskDom.window.document
				.querySelector(`[data-action="task"][data-extra="${task.tasks[0].id}"]`)
				?.getAttribute("aria-checked"),
			"true",
		);
		assert.ok(
			reminderDom.window.document.querySelector(
				'.preview-title-row [data-action="restore-reminder"]',
			),
		);
		assert.equal(
			reminderDom.window.document.querySelector('.float-bar [data-action="dismiss-reminder"]'),
			null,
		);
		assert.equal(JSON.stringify([task, reminder]), before);
	} finally {
		taskDom.window.close();
		reminderDom.window.close();
	}
});

test("reason entry is removed while existing feedback actions remain available", async () => {
	const { cardsActions } = await import("../../apps/web/views/actions/cards.ts");
	assert.equal("why" in Panels, false);
	assert.equal("whyLink" in Panels, false);
	assert.equal("why" in cardsActions, false);
	assert.equal(typeof cardsActions["less-like"], "function");
	assert.equal(typeof cardsActions["never-show"], "function");
});

test("article preview puts the cover before its ruled header; reading puts it after", () => {
	Store.state = Store.fresh();
	const card = {
		...SeedCards.find((c) => c.type === "article" && c.image),
		summary: "Distinct lead",
		body: "Full body",
	};
	const dom = new JSDOM(Panels.preview({}, card));
	const doc = dom.window.document;
	const scroll = doc.querySelector(".sheet-scroll")!;
	assert.ok(scroll.firstElementChild?.matches(".preview-cover"));
	assert.ok(doc.querySelector(".detail-header.ruled-header h1"));
	assert.equal(doc.querySelector(".preview-lead"), null);
	assert.equal(doc.querySelector(".preview-full")?.textContent, "Full body\n");
	dom.window.close();
	const reader = new JSDOM(Panels.reader({}, card));
	assert.ok(
		reader.window.document
			.querySelector(".detail-header")
			?.nextElementSibling?.matches(".preview-cover"),
	);
	reader.window.close();
});

test("task detail shows the complete checklist before body without the card summary", () => {
	Store.state = Store.fresh();
	const card = {
		...SeedCards.find((c) => c.type === "task"),
		summary: "Task summary",
		body: "Task body",
	};
	const dom = new JSDOM(Panels.preview({}, card));
	const doc = dom.window.document;
	assert.equal(doc.querySelector(".preview-lead"), null);
	assert.ok(doc.querySelector(".detail-task-list")?.nextElementSibling?.matches(".preview-full"));
	assert.equal(doc.querySelectorAll(".detail-task-list [role=checkbox]").length, card.tasks.length);
	dom.window.close();
});

test("all detail types keep card summaries out of the authored body", () => {
	Store.state = Store.fresh();
	for (const seed of cards) {
		const card = { ...seed, summary: "CARD_ONLY_SENTINEL", body: "Authored detail body" };
		const dom = new JSDOM(Panels.preview({}, card));
		assert.equal(
			dom.window.document.body.textContent?.includes("CARD_ONLY_SENTINEL"),
			false,
			card.type,
		);
		dom.window.close();
	}
});

test("video and PR details respect edited tags instead of source tags", () => {
	Store.state = Store.fresh();
	for (const type of ["media", "pr"]) {
		const card = {
			...SeedCards.find((c) => c.type === type),
			id: `edited-${type}`,
			tags: ["source-tag"],
		};
		Store.state.cards.push(card);
		Store.item(card.id).tagsEdited = true;
		Store.item(card.id).tags = ["personal-tag"];
		const dom = new JSDOM(Panels.preview({}, card));
		assert.equal(dom.window.document.querySelector(".preview-tags")?.textContent, "#personal-tag");
		assert.equal(dom.window.document.body.textContent?.includes("#source-tag"), false);
		dom.window.close();
	}
});
