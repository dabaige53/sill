import assert from "node:assert/strict";
import test from "node:test";
import { mediaResourceDomains, restrictMediaScripts } from "../../server/cloud/media-policy.ts";

test("MCP media policy uses authorized card origins without allowing those origins to run scripts", () => {
	const origins = mediaResourceDomains([
		{
			images: [
				"https://images.example.org/a.jpg?private=1",
				"coast",
				"https://images.example.org/b.jpg",
			],
			audioUrl: "https://audio.example.org/sample.mp3",
		},
		{
			images: ["https://user:password@secret.example.org/a", "javascript:alert(1)"],
			audioUrl: "http://insecure.example.org/a.mp3",
		},
	]);
	assert.ok(origins.includes("https://images.example.org"));
	assert.ok(origins.includes("https://audio.example.org"));
	assert.equal(origins.filter((origin) => origin === "https://images.example.org").length, 1);
	assert.ok(origins.every((origin) => !/private|secret|insecure|javascript/.test(origin)));
	const html = restrictMediaScripts(
		"<!doctype html><html><head><script>boot()</script></head></html>",
	);
	assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script>"));
	assert.match(html, /script-src 'unsafe-inline' https:\/\/www.youtube.com https:\/\/s.ytimg.com;/);
	assert.doesNotMatch(html, /images.example.org|audio.example.org/);
});
