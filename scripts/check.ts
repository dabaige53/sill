import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";
import { JSDOM } from "jsdom";
import { root } from "./build.ts";

const target = process.argv.includes("--cloud") ? "dist/cloud/index.html" : "dist/web/index.html";
const html = await readFile(resolve(root, target), "utf8");
const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, "$1</script>");
// CSS minification must retain the standard blur declaration, not only the Safari prefix.
const css = [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
	.map(([, value]) => value)
	.join("\n");
const topBlur = css.match(/\.home-top::?before\s*\{([^}]+)\}/)?.[1];
assert.ok(topBlur, "missing_top_bar_blur_layer");
assert.match(
	topBlur,
	/(?:^|;)\s*backdrop-filter\s*:\s*var\(--edge-blur-soft\)/,
	"missing_standard_top_bar_backdrop_filter",
);
if (/<script\b[^>]*\bsrc=/i.test(markup) || /<link\b[^>]*rel=["']stylesheet/i.test(markup))
	throw new Error("external_runtime_asset");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 3 || scripts.some(([, code]) => !code.trim()))
	throw new Error("missing_standalone_scripts");
for (const [, code] of scripts) new Script(code);
assert.match(scripts[0][0], /id="sill-theme-bootstrap"/, "missing_theme_bootstrap");
assert.ok(html.indexOf(scripts[0][0]) < html.indexOf("<body>"), "theme_bootstrap_after_body");
if (html.indexOf(scripts[2][0]) < html.indexOf("<body>")) throw new Error("bundle_before_body");
// Keep the local bundle assertions formerly owned by tests/web/build.test.ts.
if (!process.argv.includes("--cloud")) {
	const dom = new JSDOM(html);
	try {
		const document = dom.window.document;
		const elements = [...document.querySelectorAll("script")];
		assert.equal(elements.length, 3);
		for (const script of elements) {
			assert.equal(script.type, "");
			assert.equal(script.hasAttribute("src"), false);
			assert.ok(script.textContent.trim());
		}
		assert.equal(elements[0].id, "sill-theme-bootstrap");
		assert.equal(elements[0].parentElement, document.head);
		assert.ok(elements[1].textContent.includes('window.__PAGE__="feed"'));
		assert.equal(elements[2].parentElement, document.body);
		for (const image of document.querySelectorAll("img[src]"))
			assert.doesNotMatch(image.getAttribute("src"), /^https?:/i);
	} finally {
		dom.window.close();
	}
}
JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
console.log("Standalone scripts and plugin manifest checked.");
