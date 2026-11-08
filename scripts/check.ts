import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { root } from "./build.ts";

const target = process.argv.includes("--cloud") ? "dist/cloud/index.html" : "dist/web/index.html";
const html = await readFile(resolve(root, target), "utf8");
if (!process.argv.includes("--cloud")) {
	const dom = new JSDOM(html);
	try {
		const document = dom.window.document;
		// @wu-test type=boundary | scope=standalone page image resources | protects=Prevents the standalone page from loading image resources from external origins
		for (const image of document.querySelectorAll("img[src]"))
			assert.doesNotMatch(image.getAttribute("src"), /^https?:/i);
	} finally {
		dom.window.close();
	}
}
console.log("Standalone image resources checked.");
