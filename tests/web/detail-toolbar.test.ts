import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import { CardActions } from "../../contracts/card-actions.ts";
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
	const event = toolbar(seed("event"));
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
