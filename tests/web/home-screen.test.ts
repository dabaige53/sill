import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { buildPage } from "../../scripts/build.ts";
import { loginPage } from "../../server/cloud/login-page.ts";

test("standalone metadata is in cloud and login pages, never local or embedded MCP pages", async () => {
	await buildPage({ cloud: true });
	const cloud = await readFile("dist/cloud/index.html", "utf8");
	for (const html of [cloud, loginPage(), loginPage({ setup: true })]) {
		const document = new JSDOM(html).window.document;
		assert.equal(
			document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
			"/manifest.webmanifest",
		);
		assert.equal(
			document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
			"/assets/sill-icon.png",
		);
		assert.equal(
			document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
			"yes",
		);
		assert.equal(
			document
				.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
				?.getAttribute("content"),
			"default",
		);
	}
	execFileSync(process.execPath, ["scripts/build-cloud-app.ts"]);
	const embedded = await readFile("dist/cloud/app.html", "utf8");
	const local = await readFile("dist/web/index.html", "utf8");
	for (const html of [embedded, local]) {
		assert.doesNotMatch(html, /rel="manifest"|apple-mobile-web-app-capable|\{\{HOME_SCREEN\}\}/);
	}
	const png = await readFile("assets/sill-icon.png");
	assert.equal(png.readUInt32BE(16), 256);
	assert.equal(png.readUInt32BE(20), 256);
});

test("workspace and login policies allow only same-origin installation metadata", async () => {
	const source = await readFile("server/cloud/http.ts", "utf8");
	assert.equal((source.match(/manifest-src 'self'/g) || []).length, 2);
	assert.doesNotMatch(source, /manifest-src \*/);
});
