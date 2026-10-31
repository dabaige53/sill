/** Outline clicks jump immediately in a synthetic DOM; no browser or workspace data. */
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
import {ReaderLayout} from './apps/web/interactions/reader-layout.tsx';
import {markdownHeadings} from './apps/web/atoms/markdown.ts';
import {appInputMethods} from './apps/web/views/app-input.ts';
export function mount(host) {
 const external = [];
 window.__SILL_HOST__ = {};
 const click = event => appInputMethods.click.call({openExternal:(_, url) => external.push(url)}, event);
 document.addEventListener('click', click);
 const body = '## First\\nFirst text\\n## Second\\nSecond text';
 const headings = markdownHeadings(body);
 const root = createRoot(host);
 flushSync(() => root.render(h(ReaderLayout, {kind:'article', body},
  h('article', null, headings.map(item => h('h2', {key:item.id, id:item.id}, item.title))))));
 return {external, flush:fn => flushSync(fn), close:() => {
  document.removeEventListener('click', click);
  flushSync(() => root.unmount());
 }};
}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "OutlineTest",
}).outputFiles[0].text;

test("mouse and keyboard outline navigation finish before the handler returns", () => {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test/#read/example",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	let measure = () => {};
	w.ResizeObserver = class {
		constructor(callback) {
			measure = callback;
		}
		observe() {}
		disconnect() {}
	};
	w.eval(bundle);
	const api = w.OutlineTest.mount(w.document.querySelector("#root"));
	try {
		const region = w.document.querySelector("#reader-scroll");
		const links = w.document.querySelectorAll(".reader-outline a");
		Object.defineProperties(region, {
			scrollHeight: { value: 1400 },
			clientHeight: { value: 400 },
		});
		region.getBoundingClientRect = () => ({ top: 100 });
		const sections = region.querySelectorAll("h2");
		let secondTop = 716;
		sections[0].getBoundingClientRect = () => ({ top: 116 - region.scrollTop });
		sections[1].getBoundingClientRect = () => ({ top: secondTop - region.scrollTop });
		const nav = w.document.querySelector(".reader-outline");
		Object.defineProperty(nav, "clientHeight", { value: 400 });
		Object.defineProperty(nav.querySelector(".reader-outline-links"), "offsetTop", { value: 30 });
		for (const link of links) Object.defineProperty(link, "offsetHeight", { value: 44 });
		Object.defineProperty(links[1], "offsetTop", { value: 500 });
		measure();
		assert.equal(nav.querySelector(".reader-outline-dot"), null);
		assert.equal(links[1].textContent, "Second");
		assert.equal(links[0].style.height, "", "outline rows keep natural height");
		for (const detail of [1, 0]) {
			region.scrollTop = 0;
			api.flush(() => {
				links[1].dispatchEvent(
					new w.MouseEvent("click", { bubbles: true, cancelable: true, detail }),
				);
				assert.equal(region.scrollTop, secondTop - 116);
			});
			assert.equal(links[1].getAttribute("aria-current"), "location");
			assert.equal(nav.scrollTop, 174);
			assert.equal(w.location.hash, "#read/example");
			assert.deepEqual([...api.external], [], "embedded host must not open local outline links");
			// Layout can move after measurement, before ResizeObserver delivers another callback.
			secondTop += 100;
		}
		region.scrollTop = 1000;
		measure();
		assert.equal(links[1].getAttribute("aria-current"), "location");
		region.scrollTop = 0;
		measure();
		assert.equal(links[0].getAttribute("aria-current"), "location");
		assert.equal(w.document.querySelector(".reader-outline-toggle"), null);
		assert.equal(w.document.querySelector(".reader-outline").hidden, false);
	} finally {
		api.close();
		dom.window.close();
	}
});
