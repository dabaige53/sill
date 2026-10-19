import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import type { Card } from "../../contracts/card.ts";
import { type CardAction, CardActions } from "../../contracts/card-actions.ts";
import { Preferences } from "../../contracts/local.ts";

const toolbar = (card: any) => {
	const dom = new JSDOM(Panels.preview({}, card));
	const bar = dom.window.document.querySelector(".float-bar");
	const names = (selector: string) =>
		[...(bar?.querySelectorAll(selector) || [])].map((n) => n.getAttribute("data-action"));
	return {
		document: dom.window.document,
		shared: names(".icon-button:not(.is-own)"),
		own: names(".icon-button.is-own"),
		rule: bar?.querySelectorAll(".toolbar-sep").length || 0,
		close: () => dom.window.close(),
	};
};
const seed = (type: string) => SeedCards.find((card: any) => card.type === type);

test("card detail: shared verbs in ink, a rule, then at most three own verbs; no solid buttons", () => {
	Store.state = Store.fresh();
	for (const card of SeedCards.filter((c: any) => c.type !== "photo")) {
		const bar = toolbar(card);
		try {
			assert.deepEqual(bar.shared, ["bookmark", "edit", "later"], card.type);
			assert.ok(bar.own.length <= 3, card.type);
			assert.equal(bar.rule, bar.own.length ? 1 : 0, card.type);
			assert.equal(
				bar.document.querySelectorAll(".preview-body .solid-button").length,
				0,
				card.type,
			);
			assert.equal(bar.document.querySelectorAll(".reminder-actions").length, 0, card.type);
		} finally {
			bar.close();
		}
	}
});

test("mail replies, the event downloads and reminders remind again from the toolbar", () => {
	Store.state = Store.fresh();
	const mail = toolbar(seed("mail"));
	const event = toolbar({ ...seed("event"), start: Date.now() + 60 * 60000 });
	const reminder = toolbar(seed("reminder"));
	try {
		assert.deepEqual(mail.own, ["external"]);
		assert.equal(mail.document.querySelector(".is-own")?.getAttribute("aria-label"), "回复");
		assert.ok(event.own.includes("download-calendar"));
		assert.ok(event.own.includes("snooze"));
		assert.deepEqual(reminder.own, ["snooze", "dismiss-reminder"]);
		// Done is the circle before the title, as on the card; it only changes Sill.
		assert.ok(
			reminder.document.querySelector(
				'.preview-title-row [data-action="complete-reminder"] + #modal-title',
			),
		);
	} finally {
		mail.close();
		event.close();
		reminder.close();
	}
});

test("settings can hide any toolbar verb; the rule goes when one side is empty", () => {
	Store.state = Store.fresh();
	Store.setPref("hiddenActions", ["bookmark", "tag", "later"]);
	const mail = toolbar(seed("mail"));
	try {
		assert.deepEqual(mail.shared, []);
		assert.deepEqual(mail.own, ["external"]);
		assert.equal(mail.rule, 0);
	} finally {
		mail.close();
	}
	Store.setPref("hiddenActions", [...CardActions]);
	const note = new JSDOM(Panels.preview({}, seed("note")));
	try {
		assert.equal(note.window.document.querySelector(".float-bar"), null);
	} finally {
		note.window.close();
	}
	Store.state = Store.fresh();
});

test("hiddenActions is a closed list in the shared preference contract", () => {
	assert.ok(Preferences.safeParse({ hiddenActions: ["reply", "download"] }).success);
	assert.ok(!Preferences.safeParse({ hiddenActions: ["delete"] }).success);
});

test("card action examples describe types without changing switch names or preferences", () => {
	Store.state = Store.fresh();
	Store.setPref("hiddenActions", ["tag"]);
	const dom = new JSDOM(Panels.settings({}, "desk"));
	const examples = [
		"所有卡片",
		"所有卡片",
		"所有卡片",
		"邮件",
		"文章、视频等",
		"日程",
		"待办、日程、提醒",
		"日程",
		"待办、日程、提醒",
	];
	try {
		const switches = [...dom.window.document.querySelectorAll('[data-action="action-toggle"]')];
		assert.equal(switches.length, 9);
		for (const [index, toggle] of switches.entries()) {
			assert.equal(toggle.getAttribute("data-id"), CardActions[index]);
			const row = toggle.closest(".setting-row");
			assert.equal(row?.querySelector("small")?.textContent, examples[index]);
			assert.equal(toggle.getAttribute("aria-describedby"), row?.querySelector("small")?.id);
			assert.equal(
				row?.firstElementChild?.firstChild?.textContent,
				toggle.getAttribute("aria-label"),
			);
			assert.equal(
				toggle.getAttribute("aria-checked"),
				CardActions[index] === "tag" ? "false" : "true",
			);
		}
		assert.deepEqual(Store.pref("hiddenActions"), ["tag"]);
	} finally {
		dom.window.close();
		Store.state = Store.fresh();
	}
});

test("photo lightbox shares toolbar state and hides empty tools without hiding thumbnails", () => {
	const photo: Card = { ...seed("photo"), photos: ["architecture", "coast"] };
	for (const hidden of [[], ["tag"], ["bookmark", "tag", "later"]] as CardAction[][]) {
		Store.state = Store.fresh();
		Store.setPref("hiddenActions", hidden);
		Store.patch(photo.id, { bookmarked: true, later: true });
		const dom = new JSDOM(Panels.lightbox(photo, 1));
		try {
			const document = dom.window.document;
			const expected = ["bookmark", "edit", "later"].filter(
				(action) => !hidden.includes(action === "edit" ? "tag" : (action as CardAction)),
			);
			assert.deepEqual(
				[...document.querySelectorAll(".float-bar button")].map((n) =>
					n.getAttribute("data-action"),
				),
				expected,
			);
			assert.equal(document.querySelectorAll(".float-bar").length, expected.length ? 1 : 0);
			assert.equal(document.querySelectorAll(".toolbar-sep,.is-own").length, 0);
			assert.equal(document.querySelectorAll(".lightbox-thumbs button").length, 2);
			assert.equal(document.querySelector(".lightbox-thumbs .on")?.getAttribute("data-extra"), "1");
			if (!hidden.includes("bookmark")) {
				assert.equal(
					document.querySelector('[data-action="bookmark"]')?.getAttribute("aria-label"),
					"取消收藏",
				);
				assert.ok(document.querySelector('[data-action="bookmark"]')?.classList.contains("active"));
			}
		} finally {
			dom.window.close();
		}
	}
	Store.state = Store.fresh();
});

test("imminent event prioritizes dismiss over download only when join is available", () => {
	const now = Date.now();
	const event = {
		...seed("event"),
		start: now + 5 * 60000,
		end: now + 65 * 60000,
		meeting: { name: "合成会议", url: "https://example.com/meeting" },
	};
	const cases: { card: typeof event; hidden: CardAction[]; expected: string[] }[] = [
		{ card: event, hidden: [], expected: ["join", "snooze", "dismiss-reminder"] },
		{
			card: { ...event, start: now + 60 * 60000 },
			hidden: [],
			expected: ["snooze", "download-calendar", "dismiss-reminder"],
		},
		{
			card: { ...event, meeting: undefined },
			hidden: [],
			expected: ["snooze", "download-calendar", "dismiss-reminder"],
		},
		{ card: event, hidden: ["dismiss"], expected: ["join", "snooze", "download-calendar"] },
		{
			card: event,
			hidden: ["snooze"],
			expected: ["join", "dismiss-reminder", "download-calendar"],
		},
	];
	for (const { card, hidden, expected } of cases) {
		Store.state = Store.fresh();
		Store.setPref("hiddenActions", hidden);
		const bar = toolbar(card);
		try {
			assert.deepEqual(bar.own, expected);
			assert.deepEqual(bar.shared, ["bookmark", "edit", "later"]);
		} finally {
			bar.close();
		}
	}
	Store.state = Store.fresh();
});
