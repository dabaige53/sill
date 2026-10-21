import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { root } from "./build.ts";

const target = process.argv.includes("--cloud") ? "dist/cloud/index.html" : "dist/web/index.html";
const html = await readFile(resolve(root, target), "utf8");
const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, "$1</script>");
if (/<script\b[^>]*\bsrc=/i.test(markup) || /<link\b[^>]*rel=["']stylesheet/i.test(markup))
	throw new Error("external_runtime_asset");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 2 || scripts.some(([, code]) => !code.trim()))
	throw new Error("missing_standalone_scripts");
for (const [, code] of scripts) new Script(code);
if (html.indexOf(scripts[1][0]) < html.indexOf("<body>")) throw new Error("bundle_before_body");
// Keep the local bundle assertions formerly owned by tests/web/build.test.ts.
if (!process.argv.includes("--cloud")) {
	const dom = new JSDOM(html);
	try {
		const document = dom.window.document;
		const elements = [...document.querySelectorAll("script")];
		assert.equal(elements.length, 2);
		for (const script of elements) {
			assert.equal(script.type, "");
			assert.equal(script.hasAttribute("src"), false);
			assert.ok(script.textContent.trim());
		}
		assert.ok(elements[0].textContent.includes('window.__PAGE__="feed"'));
		assert.equal(elements[1].parentElement, document.body);
		for (const image of document.querySelectorAll("img[src]"))
			assert.doesNotMatch(image.getAttribute("src"), /^https?:/i);
	} finally {
		dom.window.close();
	}
}
JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
console.log("Standalone scripts and plugin manifest checked.");
