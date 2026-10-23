/** Real loopback writes feed the same snapshot adoption and rendering used by the Web app. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import { LocalSync } from "../../apps/web/services/local-sync.ts";
import { appFeedMethods } from "../../apps/web/views/app-feed.ts";
import { startLocal } from "../../server/local/index.ts";

test("local API body reaches preview, reader, summary fallback and search after reload", async () => {
	const dir = await mkdtemp(
		(process.platform === "darwin" ? "/private/tmp" : tmpdir()) + "/sill-markdown-",
	);
	const server = await startLocal({ port: 0, file: join(dir, "cards.json") });
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	const card = {
		id: "markdown-local",
		type: "article",
		title: "Local Markdown",
		body: "## Searchable heading\n\n1. **First** item\n2. Second item\n\n> Quote\n\n```js\nconst found = 42;\n```\n\n![Alt](https://example.com/image.png)",
	};
	try {
		const response = await fetch(`${origin}/api/local/operations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operations: [{ op: "card.upsert", card, before: null }] }),
		});
		assert.equal(response.status, 200);
		const snapshot = await fetch(`${origin}/api/local/state`).then((r) => r.json());
		Store.state = Store.fresh();
		LocalSync.app = {
			grid: { dataset: {} },
			applyPreferences() {},
			withFeedAnchor() {},
			checkReminders() {},
		};
		LocalSync.adopt(snapshot);
		const stored = Store.card(card.id);
		assert.equal(stored.body, card.body);
		for (const html of [Panels.preview({}, stored), Panels.reader({}, stored)]) {
			const dom = new JSDOM(html);
			try {
				assert.equal(
					dom.window.document.querySelector(".markdown h2")?.textContent,
					"Searchable heading",
				);
				assert.equal(dom.window.document.querySelectorAll(".markdown ol li").length, 2);
				assert.equal(dom.window.document.querySelectorAll(".markdown img").length, 0);
			} finally {
				dom.window.close();
			}
		}
		const face = new JSDOM(cardHTML(stored));
		assert.equal(
			face.window.document.querySelector(".card-summary")?.textContent,
			"Searchable heading",
		);
		face.window.close();
		assert.ok(appFeedMethods.matches.call({} as never, stored, "first item"));
		assert.ok(appFeedMethods.matches.call({} as never, stored, "const found = 42"));
		assert.equal(
			(await fetch(`${origin}/api/local/state`).then((r) => r.json())).state.cards[0].body,
			card.body,
		);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(dir, { recursive: true, force: true });
	}
});
