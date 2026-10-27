/** Independent navigation projections over one synthetic card store. */
import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

export const bundle = buildSync({
	stdin: {
		contents:
			"export { AppController } from './apps/web/views/app.ts'; export { Store } from './apps/web/data/store.ts'; export { Panels } from './apps/web/interactions/panels.ts'; export { cardHTML } from './apps/web/cards/templates.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SearchTest",
}).outputFiles[0].text;
export function fixture() {
	const dom = new JSDOM('<!doctype html><div id="feed-grid"></div><dialog id="modal"></dialog>', {
		url: "https://search.test/#search",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.structuredClone = structuredClone;
	w.matchMedia = () => ({ matches: true, addEventListener() {} });
	w.CSS = { escape: (value: string) => value };
	w.HTMLDialogElement.prototype.show = function () {
		this.open = true;
	};
	w.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.show;
	w.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { AppController, Store, Panels, cardHTML } = w.SearchTest;
	Store.state = {
		cards: [
			{ id: "a", type: "article", title: "Alpha", body: "Article", time: Date.now() },
			{
				id: "b",
				type: "task",
				title: "Beta",
				tasks: [{ id: "one", text: "Task" }],
				time: Date.now(),
			},
			{ id: "old", type: "article", title: "Archived Alpha", body: "Article", time: Date.now() },
		],
		items: { old: { archived: true } },
		preferences: {},
	};
	Store.save = () => {};
	const app = new AppController();
	app.grid = w.document.getElementById("feed-grid");
	app.dialog = w.document.getElementById("modal");
	app.dialog.className = "search page";
	app.dialog.innerHTML = Panels.search(app);
	app.dialog.show();
	app.modalKind = "search";
	app.setNav = (key: string) => (app.navKey = key);
	app.revealImages = () => {};
	app.layout = { schedule() {}, layout() {} };
	app.updateFilterIndicator = () => {};
	app.pageLimit = 40;
	app.updateSelection = () => {};
	app.grid.innerHTML = Store.state.cards.map((c) => cardHTML(c)).join("");
	return { dom, w, app, Store, Panels };
}
