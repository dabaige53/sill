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
		[...(bar?.querySelectorAll(selector) || [])].map(
			(n) => n.getAttribute("data-action") || (n.hasAttribute("href") ? "external" : null),
		);
	return {
		document: dom.window.document,
		shared: names(".icon-button:not(.is-own)"),
		own: names(".icon-button.is-own"),
		rule: bar?.querySelectorAll(".toolbar-sep").length || 0,
		close: () => dom.window.close(),
	};
};
const seed = (type: string) => SeedCards.find((card: any) => card.type === type);

// @wu-test type=behavior | scope=detail toolbar | protects=prevents common card actions from disappearing | debt=D6
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

// @wu-test type=behavior | scope=card-specific detail actions | protects=prevents users from losing mail, calendar, or reminder actions | debt=D9
test("mail opens its web page, events download and reminders remind again from the toolbar", () => {
	Store.state = Store.fresh();
	const mailURL = "https://mail.example.com/message/1";
	const mail = toolbar({ ...seed("mail"), url: mailURL });
	const event = toolbar({ ...seed("event"), start: Date.now() + 60 * 60000 });
	const reminder = toolbar(seed("reminder"));
	try {
		assert.deepEqual(mail.own, ["external"]);
		assert.equal(mail.document.querySelector(".is-own")?.getAttribute("aria-label"), "打开邮件");
		assert.equal(mail.document.querySelector(".is-own")?.getAttribute("href"), mailURL);
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

// @wu-test type=behavior | scope=legacy detail action preferences | protects=prevents old hidden-action preferences from hiding current actions
test("legacy hidden preferences do not remove shared or own detail actions", () => {
	Store.state = Store.fresh();
	Store.setPref("hiddenActions", ["bookmark", "tag", "later"]);
	const mailURL = "https://mail.example.com/message/1";
	const mail = toolbar({ ...seed("mail"), url: mailURL });
	try {
		assert.deepEqual(mail.shared, ["bookmark", "edit", "later"]);
		assert.deepEqual(mail.own, ["external"]);
		assert.equal(mail.rule, 1);
	} finally {
		mail.close();
	}
	Store.setPref("hiddenActions", [...CardActions]);
	const note = new JSDOM(Panels.preview({}, seed("note")));
	try {
		assert.ok(note.window.document.querySelector('.float-bar [data-action="bookmark"]'));
		assert.equal(note.window.document.querySelector(".toolbar-sep"), null);
	} finally {
		note.window.close();
	}
	Store.state = Store.fresh();
});

// @wu-test type=boundary | scope=legacy preference contract | protects=prevents valid legacy preferences from being rejected while rejecting unknown actions
test("legacy hiddenActions remains readable in the shared preference contract", () => {
	assert.ok(Preferences.safeParse({ hiddenActions: ["reply", "download"] }).success);
	assert.ok(!Preferences.safeParse({ hiddenActions: ["delete"] }).success);
});

// @wu-test type=behavior | scope=legacy action settings | protects=prevents removed controls from returning or saved legacy preferences from being changed
test("settings omit action hiding controls and preserve saved legacy preferences", () => {
	Store.state = Store.fresh();
	Store.setPref("hiddenActions", ["tag"]);
	const dom = new JSDOM(Panels.settings({}, "desk"));
	try {
		assert.equal(dom.window.document.querySelectorAll('[data-action="action-toggle"]').length, 0);
		assert.ok(dom.window.document.querySelector('[data-action="pref-toggle"][data-id="stack"]'));
		assert.deepEqual(Store.pref("hiddenActions"), ["tag"]);
	} finally {
		dom.window.close();
		Store.state = Store.fresh();
	}
});

// @wu-test type=behavior | scope=photo lightbox actions | protects=prevents legacy preferences from hiding photo actions or losing bookmark state
test("photo lightbox shows every shared tool despite legacy hidden preferences", () => {
	const photo: Card = { ...seed("photo"), images: ["architecture", "coast"] };
	for (const hidden of [[], ["tag"], ["bookmark", "tag", "later"]] as CardAction[][]) {
		Store.state = Store.fresh();
		Store.setPref("hiddenActions", hidden);
		Store.patch(photo.id, { bookmarked: true, later: true });
		const dom = new JSDOM(Panels.lightbox(photo, 1));
		try {
			const document = dom.window.document;
			const expected = ["bookmark", "edit", "later"];
			assert.deepEqual(
				[...document.querySelectorAll(".float-bar .icon-button")].map((n) =>
					n.getAttribute("data-action"),
				),
				expected,
			);
			assert.equal(document.querySelectorAll(".float-bar").length, expected.length ? 1 : 0);
			assert.equal(document.querySelectorAll(".toolbar-sep,.is-own").length, 0);
			assert.equal(document.querySelectorAll(".lightbox-thumbs button").length, 2);
			assert.equal(document.querySelector(".lightbox-thumbs .on")?.getAttribute("data-extra"), "1");
			assert.equal(
				document.querySelector('[data-action="bookmark"]')?.getAttribute("aria-label"),
				"取消收藏",
			);
			assert.ok(document.querySelector('[data-action="bookmark"]')?.classList.contains("active"));
		} finally {
			dom.window.close();
		}
	}
	Store.state = Store.fresh();
});

// @wu-test type=behavior | scope=event detail actions | protects=prevents an imminent meeting from showing the wrong primary actions | debt=D9
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
		{ card: event, hidden: ["dismiss"], expected: ["join", "snooze", "dismiss-reminder"] },
		{
			card: event,
			hidden: ["snooze"],
			expected: ["join", "snooze", "dismiss-reminder"],
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
