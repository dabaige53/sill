import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./search-state-fixture.ts";

// @wu-test type=performance | scope=feed refresh | protects=Avoid scanning the entire card store for every rendered card
test("refreshing one card looks up the feed snapshot once instead of scanning the store per card", () => {
	const f = fixture();
	try {
		const now = Date.now();
		for (let i = 0; i < 120; i++)
			f.Store.state.cards.push({
				id: `note-${i}`,
				type: "note",
				title: `Synthetic note ${i}`,
				body: "Body",
				time: now - i - 1,
			});
		f.app.mode = "test";
		f.app.pageLimit = 200;
		f.app.renderCurrent(false);
		const card = f.Store.card;
		let lookups = 0;
		f.Store.card = function (id: string) {
			lookups++;
			return card.call(this, id);
		};
		try {
			f.Store.patch("a", { read: true });
			f.app.refreshCard("a");
		} finally {
			f.Store.card = card;
		}
		assert.ok(lookups < 20, `${lookups} store scans for one card refresh`);
		assert.ok(f.app.grid.querySelector('[data-card="note-119"]'));
	} finally {
		f.dom.window.close();
	}
});
