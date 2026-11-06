/** Startup sequencing in a synthetic DOM; no browser or real local data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "../..");

for (const slow of [false, true]) {
}

// @wu-test type=behavior | scope=Theme bootstrap | protects=Apply the saved or system theme before app rendering
test("the head resolves the cached or system theme before application rendering", () => {
	const html = readFileSync(path.join(root, "apps/web/index.html"), "utf8");
	const script = html.match(/<script id="sill-theme-bootstrap">([\s\S]*?)<\/script>/)![1];
	for (const [preference, systemDark, expected] of [
		["dark", false, "dark"],
		["light", true, "light"],
		["system", true, "dark"],
	] as const) {
		const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
			url: "https://sill.test",
			runScripts: "outside-only",
		});
		try {
			dom.window.localStorage.setItem("sill-theme", preference);
			dom.window.matchMedia = () => ({ matches: systemDark }) as MediaQueryList;
			dom.window.eval(script);
			assert.equal(dom.window.document.documentElement.dataset.theme, expected);
			assert.equal(dom.window.document.documentElement.style.colorScheme, expected);
		} finally {
			dom.window.close();
		}
	}
});
