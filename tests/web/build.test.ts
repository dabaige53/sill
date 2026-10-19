import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "../..");
for (const [file, mode] of [["index.html", "feed"]]) {
	test(`${file}: standalone script compiles and has no external runtime dependencies`, () => {
		const html = fs.readFileSync(path.join(root, "dist/web", file), "utf8");
		const dom = new JSDOM(html);
		try {
			const document = dom.window.document;
			const scripts = [...document.querySelectorAll("script")];
			assert.equal(scripts.length, 2);
			for (const script of scripts) {
				assert.equal(script.hasAttribute("src"), false);
				assert.equal(script.type, "");
				assert.ok(script.textContent.trim());
				new vm.Script(script.textContent, { filename: file });
			}
			assert.ok(scripts[0].textContent.includes(`window.__PAGE__="${mode}"`));
			assert.equal(scripts[1].parentElement, document.body);
			assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length, 0);
			for (const image of document.querySelectorAll("img[src]"))
				assert.doesNotMatch(image.getAttribute("src"), /^https?:/i);
		} finally {
			dom.window.close();
		}
	});
}
