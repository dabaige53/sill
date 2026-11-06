import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutSettings } from "../../apps/web/interactions/about-settings.tsx";
import { BackupSettings } from "../../apps/web/interactions/backup-settings.tsx";
import links from "../../design-system/product-links.json" with { type: "json" };
import product from "../../package.json" with { type: "json" };

// @wu-test type=behavior | scope=about settings | protects=Show the current product version and usable project links
test("about settings displays the package version and shared project links", () => {
	const dom = new JSDOM(renderToStaticMarkup(createElement(AboutSettings)));
	try {
		const document = dom.window.document;
		assert.equal(document.querySelector("h2")?.textContent, "关于");
		assert.equal(document.querySelector(".setting-side .num")?.textContent, product.version);
		assert.deepEqual(
			[...document.querySelectorAll("a")].map((link) => link.href),
			links.map((link) => link.url),
		);
		for (const link of document.querySelectorAll("a")) {
			assert.ok(link.textContent?.trim());
			assert.equal(link.target, "_blank");
			assert.ok(link.rel.includes("noopener"));
		}
	} finally {
		dom.window.close();
	}
});

// @wu-test type=boundary | scope=backup settings host mode | protects=Keep credential setup unavailable in the embedded host
test("backup settings keeps setup separate from the overview without exposing host credentials", () => {
	for (const host of [false, true]) {
		const dom = new JSDOM(
			renderToStaticMarkup(
				createElement(BackupSettings, {
					api: async () => ({ targets: [], backups: [] }),
					owner: "synthetic-owner",
					host,
				}),
			),
		);
		try {
			const document = dom.window.document;
			assert.equal(document.querySelector(".backup-overview h2")?.textContent, "备份与恢复");
			assert.deepEqual(
				[...document.querySelectorAll("h3")].map((heading) => heading.textContent),
				["备份记录"],
			);
			assert.equal(document.querySelectorAll("input[type=password]").length, host ? 0 : 2);
			assert.equal(document.querySelectorAll("form").length, host ? 0 : 1);
			assert.equal(document.querySelector("form")?.hidden, host ? undefined : true);
			assert.equal(
				document.querySelector(".backup-create-actions .solid-button")?.textContent,
				"立即备份",
			);
			assert.equal(
				document.querySelector(".backup-create-actions .solid-button")?.hasAttribute("disabled"),
				true,
			);
			assert.equal(document.querySelectorAll(".backup-add-target").length, host ? 0 : 1);
			assert.ok(document.querySelector(".settings-empty")?.textContent?.includes("还没有备份"));
		} finally {
			dom.window.close();
		}
	}
});
