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

test("local, generated cloud, and both login variants select the theme color of their own surface", async () => {
	await buildPage({ cloud: true });
	const pages = [
		await readFile("dist/web/index.html", "utf8"),
		await readFile("dist/cloud/index.html", "utf8"),
		loginPage(),
		loginPage({ setup: true }),
	];
	const tokens = await readFile("apps/web/styles/tokens.css", "utf8");
	for (const [index, html] of pages.entries()) {
		const dom = new JSDOM(html);
		try {
			const themes = [...dom.window.document.querySelectorAll('meta[name="theme-color"]')];
			assert.equal(themes.length, 2, "cloud generation must not duplicate shell colors");
			for (const [scheme, color] of [
				["light", index < 2 ? "#f5f5f7" : "#ffffff"],
				["dark", index < 2 ? "#111113" : "#1c1c1f"],
			]) {
				assert.ok(
					tokens
						.replaceAll("#fff;", "#ffffff;")
						.includes(`--${index < 2 ? "canvas" : "card"}: ${color}`),
					"color comes from the page surface role",
				);
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
