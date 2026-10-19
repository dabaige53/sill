import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: `export {createElement as h} from 'react'; export {renderView,renderContent,releaseView} from './apps/web/views/react-renderer.ts';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
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
	dom.window.eval(bundle);
	return {
		dom,
		view: (dom.window as any).ReactViewTest,
		container: dom.window.document.querySelector("main")!,
	};
}
test("keyed React updates preserve the focused card while escaping untrusted titles", () => {
	const { dom, view, container } = fixture();
	try {
		const card = (title: string, done = false) =>
			view.h(
				"article",
				{ key: "a", "data-card": "a" },
				view.h("button", { "data-action": "task", "aria-checked": done }, title),
			);
		view.renderView(container, [card("Before")]);
		const button = container.querySelector("button")!;
		button.focus();
		view.renderView(container, [card("<img src=x onerror=alert(1)>", true)]);
		assert.equal(container.querySelector("button"), button);
		assert.equal(dom.window.document.activeElement, button);
		assert.equal(button.getAttribute("aria-checked"), "true");
		assert.equal(container.querySelector("img"), null);
		assert.equal(button.textContent, "<img src=x onerror=alert(1)>");
		view.releaseView(container);
		assert.equal(container.childElementCount, 0);
	} finally {
		dom.window.close();
	}
});
test("panel replacement disposes nested roots and resets uncontrolled draft fields", () => {
	const { dom, view, container } = fixture();
	try {
		const panel = (value: string) =>
			view.h(
				"section",
				null,
				view.h("input", { defaultValue: value }),
				view.h("div", { id: "results" }),
			);
		view.renderContent(container, panel("first"));
		container.querySelector("input")!.value = "unsaved";
		view.renderView(container.querySelector("#results"), view.h("button", null, "result"));
		view.renderContent(container, panel("second"));
		assert.equal(container.querySelector("input")!.value, "second");
		assert.equal(container.querySelector("#results")!.childElementCount, 0);
		view.releaseView(container);
		assert.equal(container.childElementCount, 0);
	} finally {
		dom.window.close();
	}
});
