import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const bundle = buildSync({
	stdin: {
		contents: `export {createElement as h} from 'react';
export {renderView,renderContent,releaseView} from './apps/web/views/react-renderer.ts';
export {CardView} from './apps/web/cards/components.tsx';
export {PanelViews} from './apps/web/interactions/panels-components.tsx';
export {Store} from './apps/web/data/store.ts';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ReactViewTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM("<!doctype html><main></main>", {
		url: "https://react.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
	w.structuredClone = structuredClone;
	installReactBrowserAPIs(w);
	w.eval(bundle);
	w.ReactViewTest.Store.state = { cards: [], items: {}, preferences: {} };
	w.ReactViewTest.Store.save = () => {};
	return {
		dom,
		view: (dom.window as any).ReactViewTest,
		container: dom.window.document.querySelector("main")!,
	};
}
// @wu-test type=integration | scope=Card rendering | protects=Preserve focus during card updates and escape untrusted titles
test("product card updates preserve task focus and escape untrusted titles", () => {
	const { dom, view, container } = fixture();
	try {
		const card = {
			id: "a",
			type: "task",
			title: "Before",
			tasks: [
				{ id: "step", text: "Keep task focus" },
				{ id: "next", text: "Keep the checklist open" },
			],
		};
		view.Store.state.cards = [card];
		const render = () => view.renderView(container, view.h(view.CardView, { key: card.id, card }));
		render();
		const button = container.querySelector('[data-action="task"]')!;
		button.focus();
		card.title = "<img src=x onerror=alert(1)>";
		view.Store.patch("a", { taskDone: ["step"] });
		render();
		assert.equal(dom.window.document.activeElement, button);
		assert.equal(button.getAttribute("aria-checked"), "true");
		assert.equal(container.querySelector("img"), null);
		assert.equal(container.querySelector(".card-title-button")?.textContent, card.title);
		view.releaseView(container);
		assert.equal(container.childElementCount, 0);
	} finally {
		dom.window.close();
	}
});
// @wu-test type=integration | scope=Panel replacement | protects=Remove old panel content when switching panels
test("switching product details removes the previous body and nested card", () => {
	const { dom, view, container } = fixture();
	try {
		const first = { id: "first", type: "note", title: "First card", body: "Old body" };
		const nested = { id: "nested", type: "note", title: "Nested card", body: "Nested body" };
		const second = { id: "second", type: "note", title: "Second card", body: "Current body" };
		view.Store.state.cards = [first, nested, second];
		view.renderContent(container, view.PanelViews.preview({}, first));
		view.renderView(
			container.querySelector(".preview-body"),
			view.h(view.CardView, { card: nested }),
		);
		assert.match(container.textContent!, /Nested card/);
		view.renderContent(container, view.PanelViews.preview({}, second));
		assert.equal(container.querySelector("#modal-title")?.textContent, "Second card");
		assert.match(container.querySelector(".preview-body")!.textContent!, /Current body/);
		assert.doesNotMatch(container.textContent!, /First card|Old body|Nested card|Nested body/);
		assert.equal(container.querySelectorAll('[data-action="close"]').length, 1);
		view.releaseView(container);
		assert.equal(container.childElementCount, 0);
	} finally {
		dom.window.close();
	}
});
