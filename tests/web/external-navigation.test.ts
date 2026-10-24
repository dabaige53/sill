/** Synthetic link clicks; no browser navigation or host requests. */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Store } from "../../apps/web/data/store.ts";
import { openCardLink } from "../../apps/web/services/agent-handoff.ts";
import { appInputMethods } from "../../apps/web/views/app-input.ts";

test("embedded body and attachment links use host navigation, while card links stay local", () => {
	const dom = new JSDOM(
		`<div class="markdown"><a id="internal" href="https://sill.test/#card/local-card">Card</a><a id="body" href="https://example.com/article">Article</a></div><a id="file" href="https://example.com/file.pdf">File</a>`,
		{ url: "https://sill.test" },
	);
	const oldWindow = globalThis.window;
	const oldLocation = globalThis.location;
	const oldState = Store.state;
	Object.assign(globalThis, { window: dom.window, location: dom.window.location });
	(window as any).__SILL_HOST__ = {};
	Store.state = Store.fresh();
	Store.state.cards = [{ id: "local-card", type: "note", title: "Local" }];
	const destinations: string[] = [],
		routes: string[] = [];
	const app = {
		openExternal: (_card: unknown, url: string) => destinations.push(url),
		navigate: (route: string) => routes.push(route),
	};
	try {
		for (const id of ["body", "file", "internal"]) {
			let prevented = false;
			appInputMethods.click.call(
				app as any,
				{
					target: dom.window.document.getElementById(id),
					preventDefault: () => {
						prevented = true;
					},
					stopPropagation: () => {},
				} as any,
			);
			assert.equal(prevented, true);
		}
		assert.deepEqual(destinations, ["https://example.com/article", "https://example.com/file.pdf"]);
		assert.deepEqual(routes, ["#card/local-card"]);
	} finally {
		Store.state = oldState;
		Object.assign(globalThis, { window: oldWindow, location: oldLocation });
		dom.window.close();
	}
});

test("mailto uses host openLink and rejected host navigation never opens a popup", async () => {
	let popups = 0;
	const links: string[] = [];
	const host = {
		openLink: async (url: string) => {
			links.push(url);
		},
	};
	assert.equal(await openCardLink("mailto:reader@example.com", host, () => popups++), true);
	assert.deepEqual(links, ["mailto:reader@example.com"]);
	await assert.rejects(
		openCardLink(
			"https://example.com",
			{
				openLink: async () => {
					throw new Error("denied");
				},
			},
			() => popups++,
		),
		/denied/,
	);
	assert.equal(popups, 0);
});
