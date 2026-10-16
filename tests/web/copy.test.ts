import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { buildSync, transformSync } from "esbuild";
import { JSDOM } from "jsdom";
import { avatars, dateLabel, duration } from "../../apps/web/atoms/primitives.ts";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import { copy, errorMessage } from "../../apps/web/copy.ts";
import { CardTypes, SourceKinds } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import { cardTypes, sourceKinds } from "../../contracts/card.ts";
import messages from "../../design-system/copy/zh-Hans.json" with { type: "json" };

const root = resolve(import.meta.dirname, "../..");
function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? sourceFiles(resolve(directory, entry.name))
			: [resolve(directory, entry.name)],
	);
}

test("active copy references and shell markers use existing shared keys", () => {
	for (const file of ["apps/web", "server", "scripts", "contracts"]
		.flatMap((directory) => sourceFiles(resolve(root, directory)))
		.filter((file) => /\.(?:ts|html)$/.test(file) && !file.endsWith("/assets.ts"))) {
		const body = readFileSync(file, "utf8");
		for (const match of body.matchAll(/copy\(["']([^"']+)["']\)|\{\{COPY:([^}]+)\}\}/g)) {
			assert.ok(Object.hasOwn(messages, match[1] || match[2]), `${file}: ${match[1] || match[2]}`);
		}
	}
	for (const value of Object.values(messages)) {
		assert.equal(typeof value, "string");
		assert.doesNotMatch(value, /<\/?[a-z][^>]*>/i);
	}
});

test("local error codes use shared messages and unknown values never appear in the UI", () => {
	for (const [key, value] of Object.entries(messages).filter(([key]) => key.startsWith("error."))) {
		assert.equal(errorMessage(key.slice(6)), value);
	}
	assert.equal(errorMessage("<script>private failure</script>"), copy("error.unavailable"));
	assert.equal(errorMessage(undefined), copy("error.unavailable"));
});

test("shared card and source labels exactly cover the contract kinds", () => {
	assert.deepEqual(
		Object.keys(messages)
			.filter((key) => key.startsWith("card.type."))
			.map((key) => key.slice(10))
			.sort(),
		[...cardTypes].sort(),
	);
	assert.deepEqual(
		Object.keys(messages)
			.filter((key) => key.startsWith("source.type."))
			.map((key) => key.slice(12))
			.sort(),
		[...sourceKinds].sort(),
	);
	for (const kind of cardTypes) assert.equal(CardTypes[kind].label, copy(`card.type.${kind}`));
	for (const kind of sourceKinds)
		assert.equal(SourceKinds[kind].label, copy(`source.type.${kind}`));
});

test("Web user-facing Chinese stays in shared copy rather than source literals", () => {
	for (const file of sourceFiles(resolve(root, "apps/web")).filter(
		(file) => file.endsWith(".ts") && !file.endsWith("/assets.ts"),
	)) {
		const result = transformSync(readFileSync(file, "utf8"), {
			loader: "ts",
			charset: "utf8",
			minifyWhitespace: true,
			legalComments: "none",
		}).code.replace("/现在|到期/", "");
		assert.doesNotMatch(result, /\p{Script=Han}/u, file);
	}
	assert.doesNotMatch(
		readFileSync(resolve(root, "apps/web/shell.html"), "utf8"),
		/\p{Script=Han}/u,
	);
});

test("Apple keys and values remain unchanged during Web copy extraction", () => {
	const apple = Object.entries(messages)
		.filter(([key]) => key.startsWith("apple."))
		.sort();
	assert.equal(apple.length, 57);
	assert.equal(
		createHash("sha256").update(JSON.stringify(apple)).digest("hex"),
		"730bd061e40498185da99eb87b67019545b3e28ecb33632dc3d99c24014fec1c",
	);
});

test("browser copy bundle preserves every string without Node or DOM globals", () => {
	const script = buildSync({
		stdin: {
			contents: "export { copy } from './apps/web/copy.ts';",
			resolveDir: root,
			loader: "ts",
		},
		bundle: true,
		write: false,
		platform: "browser",
		format: "iife",
		globalName: "Copy",
	}).outputFiles[0].text;
	const context = vm.createContext({});
	vm.runInContext(script, context);
	for (const [key, value] of Object.entries(messages)) assert.equal(context.Copy.copy(key), value);
	assert.doesNotMatch(script, /ZodError|node:|require\(/);
});

test("translated HTML keeps dynamic values, escaping and nested expressions", () => {
	Store.state = Store.fresh();
	const title = 'Literal ` ${notEvaluated} <script> & "quoted"';
	const card = {
		id: "copy-safe",
		type: "mail",
		title,
		sender: title,
		attachment: title,
		summary: title,
	};
	const document = new JSDOM(cardHTML(card)).window.document;
	assert.equal(document.querySelector("h2")?.textContent, title);
	assert.equal(document.querySelector(".sender b")?.textContent, title);
	assert.equal(document.querySelector(".sender small")?.textContent, copy("web.mail"));
	assert.equal(document.querySelectorAll("script").length, 0);
	const participant = new JSDOM(avatars(["A", "B"])).window.document;
	assert.equal(participant.querySelector("[role=img]")?.getAttribute("aria-label"), "2 位参与者");
	const read = new JSDOM(Panels.readButton(card, { progress: 0.42, read: false })).window.document;
	assert.match(read.querySelector("button")?.textContent || "", /42%/);
	assert.equal(duration(61), "1:01");
	assert.match(dateLabel(new Date(2026, 9, 16).getTime()), /10月16日/);
});

test("ended events and read cards fade without a status label", () => {
	Store.state = Store.fresh();
	const event = { id: "ended", type: "event", title: "回顾", start: 1000, end: 2000 };
	const ended = new JSDOM(cardHTML(event, { now: 2000 })).window.document;
	assert.ok(ended.querySelector(".feed-card")?.classList.contains("is-ended"));
	assert.equal(ended.querySelector(".event-relative"), null);
	const live = new JSDOM(cardHTML(event, { now: 1500 })).window.document;
	assert.equal(live.querySelector(".feed-card")?.classList.contains("is-ended"), false);
	assert.ok(live.querySelector(".event-relative")?.textContent);
	const read = new JSDOM(
		cardHTML({ id: "done", type: "article", title: "读过" }, { state: { read: true } }),
	).window.document;
	assert.doesNotMatch(read.body.textContent || "", /已读/);
});
