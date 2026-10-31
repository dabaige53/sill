import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {Markdown} from './apps/web/cards/markdown.tsx'; export {appInputMethods} from './apps/web/views/app-input.ts'; export {createRoot} from 'react-dom/client'; export {flushSync} from 'react-dom'; export {createElement} from 'react';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	loader: { ".png": "empty" },
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "MarkdownTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM('<div id="article"></div>', {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.HTMLDialogElement.prototype.showModal = function () {
		this.setAttribute("open", "");
	};
	w.HTMLDialogElement.prototype.close = function () {
		this.removeAttribute("open");
	};
	w.eval(bundle);
	const api = w.MarkdownTest;
	const article = w.document.getElementById("article");
	const root = api.createRoot(article);
	api.flushSync(() =>
		root.render(
			api.createElement(api.Markdown, {
				text: "Before\n\n![Diagram](https://example.com/image.png)\n\nAfter",
			}),
		),
	);
	const img = article.querySelector("img");
	const fire = (node: Element, name: string, options = {}) =>
		api.flushSync(() => node.dispatchEvent(new w.Event(name, { bubbles: true, ...options })));
	return {
		dom,
		w,
		api,
		root,
		article,
		img,
		fire,
		close: () => {
			api.flushSync(() => root.unmount());
			dom.window.close();
		},
	};
}

test("Markdown image loading and failures leave surrounding text and alt text available", () => {
	const f = fixture();
	try {
		const wrapper = f.img.closest(".markdown-image");
		assert.equal(wrapper.dataset.imageState, "loading");
		f.fire(f.img, "error");
		assert.equal(wrapper.dataset.imageState, "error");
		assert.equal(f.img.alt, "Diagram");
		assert.match(f.article.textContent, /Before/);
		assert.match(f.article.textContent, /After/);
		assert.ok(wrapper.querySelector('[role="status"]'));
	} finally {
		f.close();
	}
});

test("opening and closing a full image preserves article nodes, scroll and image focus", () => {
	const f = fixture();
	try {
		const paragraph = f.article.querySelector("p");
		f.article.scrollTop = 240;
		Object.defineProperty(f.img, "naturalWidth", { value: 800 });
		f.fire(f.img, "load");
		assert.equal(f.img.closest(".markdown-image").dataset.imageState, "loaded");
		let propagated = false;
		f.w.document.addEventListener(
			"click",
			() => {
				propagated = true;
			},
			{ once: true },
		);
		f.fire(f.img, "click");
		const viewer = f.w.document.querySelector(".markdown-image-viewer");
		assert.ok(viewer?.open);
		assert.equal(propagated, false);
		assert.equal(viewer.querySelector("img").src, f.img.src);
		f.fire(viewer.querySelector("button"), "click");
		assert.equal(f.w.document.querySelector(".markdown-image-viewer"), null);
		assert.equal(f.article.querySelector("p"), paragraph);
		assert.equal(f.article.scrollTop, 240);
		assert.equal(f.w.document.activeElement, f.img);
	} finally {
		f.close();
	}
});

test("source anchors keep native browser navigation and use the existing host action when embedded", () => {
	const f = fixture();
	try {
		const link = f.w.document.createElement("a");
		link.href = "https://example.com/article?view=full&lang=zh#section";
		link.dataset.action = "external";
		link.dataset.id = "article";
		f.w.document.body.append(link);
		const actions: string[][] = [];
		const app = { action: (...args: string[]) => actions.push(args) };
		const click = () => {
			const event = new f.w.MouseEvent("click", { bubbles: true, cancelable: true });
			// Dispatch without JSDOM's unrelated asynchronous navigation implementation.
			Object.defineProperty(event, "target", { value: link });
			f.api.appInputMethods.click.call(app, event);
			return event;
		};
		assert.equal(click().defaultPrevented, false);
		assert.deepEqual(actions, []);
		f.w.__SILL_HOST__ = {};
		assert.equal(click().defaultPrevented, true);
		assert.deepEqual(actions, [["external", "article"]]);
	} finally {
		f.close();
	}
});
