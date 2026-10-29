// Checks that the design material still points at real things: code marks, tokens, boards, ADRs,
// components and generated previews. Run: node design-system/scripts/check.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const ds = resolve(repo, "design-system");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");
const errors: string[] = [];
const fail = (message: string) => errors.push(message);

// Tokens: every list family plus type styles; `text-<style>` is the CSS name of a type style.
const tokens = JSON.parse(read("design-system/tokens.json"));
const names = new Set<string>();
for (const family of Object.values(tokens) as any[])
	if (Array.isArray(family?.tokens)) for (const token of family.tokens) names.add(token.name);
for (const group of tokens.type.groups)
	for (const style of group.styles) {
		names.add(style.name);
		names.add(`text-${style.name}`);
	}

// Marks: `@design <id>` in code must be registered, and every registered id must be used.
const marks = JSON.parse(read("design-system/marks.json")).marks;
const used = new Map<string, string[]>();
const grep = execFileSync(
	"git",
	["grep", "-n", "-o", "-E", "@design [a-z0-9-]+", "--", "apps", "server"],
	{
		cwd: repo,
		encoding: "utf8",
	},
).trim();
for (const line of grep.split("\n").filter(Boolean)) {
	const [file, , hit] = line.split(":");
	const id = hit.replace("@design ", "");
	used.set(id, [...(used.get(id) || []), file]);
}
for (const id of used.keys())
	if (!marks[id]) fail(`@design ${id} is not in design-system/marks.json`);
const anchor = (heading: string) =>
	heading
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s/g, "-");
for (const [id, mark] of Object.entries(marks) as [string, any][]) {
	if (!used.has(id)) fail(`marks.json ${id} has no @design mark in apps/ or server/`);
	const [file, hash] = mark.rule.split("#");
	if (!existsSync(resolve(ds, file))) fail(`marks.json ${id}: missing ${file}`);
	else if (
		hash &&
		!read(`design-system/${file}`)
			.split("\n")
			.some((l) => /^#+ /.test(l) && anchor(l.replace(/^#+ /, "")) === hash)
	)
		fail(`marks.json ${id}: no heading #${hash} in ${file}`);
	for (const token of mark.tokens)
		if (!names.has(token)) fail(`marks.json ${id}: unknown token ${token}`);
	for (const board of mark.boards)
		if (!existsSync(resolve(ds, "boards", board + ".dc.html")))
			fail(`marks.json ${id}: ${board} is not a current board`);
	if (!readdirSync(resolve(repo, "docs/adr")).some((f) => f.startsWith(mark.adr + "-")))
		fail(`marks.json ${id}: no ADR ${mark.adr}`);
}

// Components: README + preview each; the bundle header lists the same names.
const components = readdirSync(resolve(ds, "components"), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);
for (const name of components) {
	for (const file of ["preview.html"].concat(name === "Cover" ? [] : ["README.md"]))
		if (!existsSync(resolve(ds, "components", name, file)))
			fail(`components/${name}/${file} is missing`);
	if (name === "Cover") continue;
	const readme = read(`design-system/components/${name}/README.md`);
	for (const [, token] of readme.matchAll(/`([a-z]+(?:-[a-z0-9]+)+)`/g))
		if (!names.has(token) && !readme.includes(`.${token}`) && !/^(role|aria)-/.test(token))
			fail(`components/${name}/README.md: \`${token}\` is not a token`);
}
const header = JSON.parse(
	read("design-system/components/bundle.js")
		.split("\n")[0]
		.replace(/^\/\* @ds-bundle: | \*\/$/g, ""),
);
const listed = header.components
	.map((c: any) => c.name)
	.sort()
	.join();
const folders = components
	.filter((n) => n !== "Cover")
	.sort()
	.join();
if (listed !== folders) fail(`bundle.js header lists ${listed}; folders are ${folders}`);

// Rule documents state the present: no dated narrative outside the 更新 line.
for (const file of [
	"docs/specs/DESIGN.md",
	"design-system/README.md",
	...readdirSync(resolve(ds, "handbook")).map((f) => `design-system/handbook/${f}`),
	...components.filter((n) => n !== "Cover").map((n) => `design-system/components/${n}/README.md`),
	...readdirSync(resolve(ds, "boards"))
		.filter((f) => f.endsWith(".dc.html"))
		.map((f) => `design-system/boards/${f}`),
])
	read(file)
		.split("\n")
		.forEach((line, i) => {
			if (/20\d\d-\d\d-\d\d/.test(line) && !line.startsWith("更新："))
				fail(`${file}:${i + 1} has a date`);
		});

// Boards: the canvas index and the two folders agree.
const canvas = JSON.parse(read("design-system/boards/canvas.json"));
for (const [file, board] of Object.entries(canvas.boards) as [string, any][]) {
	const folder = board.page === "history" ? "history" : "boards";
	if (!existsSync(resolve(ds, folder, file)))
		fail(`canvas.json ${file} is not in design-system/${folder}/`);
}
for (const folder of ["boards", "history"])
	for (const file of readdirSync(resolve(ds, folder)).filter((f) => f.endsWith(".dc.html")))
		if (!canvas.boards[file] || (folder === "history") !== (canvas.boards[file].page === "history"))
			fail(`design-system/${folder}/${file} is not on the matching canvas page`);

// Previews are generated; a stale one means the product changed after the last build.
try {
	execFileSync("node", ["--import", "tsx", "design-system/scripts/previews.ts", "--check"], {
		cwd: repo,
		stdio: "pipe",
	});
} catch (error: any) {
	fail(String(error.stderr || error.message).trim() + " (run scripts/design-init.sh build)");
}

if (errors.length) {
	for (const error of errors) console.error("✗ " + error);
	process.exit(1);
}
console.log(
	`design ok: ${Object.keys(marks).length} marks in ${[...used.values()].flat().length} places, ${components.length} components, ${Object.keys(canvas.boards).length} boards`,
);
