import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";
import { buildPage } from "../../scripts/build.ts";
import { loginPage } from "../../server/cloud/login-page.ts";

let cloud: string;
let embedded: string;
before(async () => {
	await buildPage({ cloud: true });
	execFileSync(process.execPath, ["scripts/build-cloud-app.ts"]);
	[cloud, embedded] = await Promise.all(
		["dist/cloud/index.html", "dist/cloud/app.html"].map((file) => readFile(file, "utf8")),
	);
});

// @wu-test type=behavior | scope=home screen installation metadata | protects=Provide installation metadata on supported standalone pages and omit it from the embedded page
test("standalone metadata is in cloud and login pages, never the embedded MCP page", async () => {
	for (const html of [cloud, loginPage(), loginPage({ setup: true })]) {
		const dom = new JSDOM(html);
		try {
			const document = dom.window.document;
			assert.equal(
				document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
				"/manifest.webmanifest",
			);
			assert.equal(
				document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
				"/assets/sill-icon.png",
			);
			assert.equal(
				document
					.querySelector('meta[name="apple-mobile-web-app-capable"]')
					?.getAttribute("content"),
				"yes",
			);
			assert.equal(
				document
					.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
					?.getAttribute("content"),
				"black-translucent",
			);
		} finally {
			dom.window.close();
		}
	}
	for (const html of [embedded]) {
		assert.doesNotMatch(html, /rel="manifest"|apple-mobile-web-app-capable|\{\{HOME_SCREEN\}\}/);
	}
	const png = await readFile("assets/sill-icon.png");
	assert.equal(png.readUInt32BE(16), 256);
	assert.equal(png.readUInt32BE(20), 256);
});

// @wu-test type=behavior | scope=home screen theme colors | protects=Provide the correct light and dark theme colors on supported pages
test("generated cloud and both login variants select the theme color of their own surface", async () => {
	const pages = [cloud, loginPage(), loginPage({ setup: true })];
	for (const [index, html] of pages.entries()) {
		const dom = new JSDOM(html);
		try {
			const themes = [...dom.window.document.querySelectorAll('meta[name="theme-color"]')];
			assert.equal(themes.length, 2, "cloud generation must not duplicate shell colors");
			for (const [scheme, color] of [
				["light", index < 1 ? "#f5f5f7" : "#ffffff"],
				["dark", index < 1 ? "#111113" : "#1c1c1f"],
			]) {
				assert.equal(
					themes
						.find((meta) => meta.getAttribute("media") === `(prefers-color-scheme: ${scheme})`)
						?.getAttribute("content"),
					color,
				);
			}
		} finally {
			dom.window.close();
		}
	}
});
