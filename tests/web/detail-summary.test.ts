/** Summary state and preview anchoring use synthetic content, without opening a browser. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: `import {createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {DetailSummary} from './apps/web/cards/card-blocks.tsx';
export function mount(host) {
 const root = createRoot(host);
 flushSync(() => root.render(h(DetailSummary, {card:{
  id:'summary-test', summary:'Short summary.', longSummary:['First point.', 'Second point.']
 }})));
 return {flush:fn => flushSync(fn), close:() => flushSync(() => root.unmount())};
}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SummaryTest",
}).outputFiles[0].text;

// @wu-test type=behavior | scope=detail summary folding | protects=prevents summary text from being clipped or hidden after reopening | debt=impl-detail
test("folding retains nodes and measures layout height independently of the opening scale", async () => {
	const dom = new JSDOM(
		'<dialog class="preview"><div class="preview-sheet"><div id="root"></div></div></dialog>',
		{ url: "https://sill.test", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.document.documentElement.dataset.inputModality = "keyboard";
	w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", {
		get() {
			return this.classList.contains("summary-content-inner") ? 96 : 0;
		},
	});
	w.HTMLElement.prototype.getBoundingClientRect = function () {
		return { top: 0, left: 0, right: 200, bottom: 8, width: 200, height: 8 };
	};
	w.eval(bundle);
	const dialog = w.document.querySelector("dialog");
	Object.defineProperty(dialog, "offsetTop", { configurable: true, value: 120 });
	const api = w.SummaryTest.mount(w.document.querySelector("#root"));
	try {
		const fold = dialog.querySelector(".summary-fold");
		const content = dialog.querySelector(".summary-content");
		const text = content.querySelector("p");
		api.flush(() => fold.click());
		assert.equal(fold.getAttribute("aria-expanded"), "false");
		assert.equal(content.getAttribute("aria-hidden"), "true");
		assert.equal(content.querySelector("p"), text, "folding must retain the content node");
		assert.equal(dialog.style.getPropertyValue("--summary-preview-top"), "120px");
		Object.defineProperty(dialog, "offsetTop", { configurable: true, value: 200 });
		api.flush(() => fold.click());
		assert.equal(fold.getAttribute("aria-expanded"), "true");
		assert.equal(content.querySelector("p"), text);
		assert.equal(dialog.style.getPropertyValue("--summary-preview-top"), "120px");
		await new Promise((resolve) => w.requestAnimationFrame(() => w.requestAnimationFrame(resolve)));
		assert.equal(
			content.style.height,
			"96px",
			"the visible 8px transformed height must not clip the 96px summary",
		);
		api.flush(() => dialog.querySelector(".summary-length").click());
		assert.equal(content.querySelectorAll("li").length, 2);
		assert.equal(dialog.style.getPropertyValue("--summary-preview-top"), "120px");
	} finally {
		api.close();
		assert.equal(dialog.style.getPropertyValue("--summary-preview-top"), "");
		dom.window.close();
	}
});
