// Prepares a design publish and records it afterwards. The shell cannot write to claude.ai, so
// Claude publishes from the plan this writes (see .claude/skills/design-publish/SKILL.md).
//   node design-system/scripts/stage.ts [note]                       → dist/design/{ds,canvas}/project/…, dist/design/plan.json
//   node design-system/scripts/stage.ts record <ds-ver> <canvas-ver> [ADR] → design-system/published.json, docs/design/versions.md
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const ds = resolve(repo, "design-system");
const out = resolve(repo, "dist/design");
const publishedFile = resolve(ds, "published.json");
const DS_URL = "https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb";
const CANVAS_URL = "https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b";
const hash = (file: string) => createHash("sha1").update(readFileSync(file)).digest("hex");
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = resolve(dir, name);
		return statSync(path).isDirectory() ? walk(path) : name === ".DS_Store" ? [] : [path];
	});
const publication = existsSync(publishedFile)
	? JSON.parse(readFileSync(publishedFile, "utf8"))
	: { ds: {}, canvas: {} };
const published = Object.fromEntries(
	["ds", "canvas"].map((name) => [
		name,
		Array.isArray(publication[name])
			? Object.assign(
					{},
					...publication[name].map((file: string) =>
						JSON.parse(readFileSync(resolve(ds, file), "utf8")),
					),
				)
			: typeof publication[name] === "string"
				? JSON.parse(readFileSync(resolve(ds, publication[name]), "utf8"))
				: publication[name],
	]),
);

if (process.argv[2] === "record") record(process.argv[3], process.argv[4], process.argv[5]);
else stage(process.argv.slice(2).join(" "));

function stage(note: string) {
	// Keep build outputs used by boards; only replace the publish staging directories.
	for (const name of ["ds", "canvas", "tokens"])
		rmSync(resolve(out, name), { recursive: true, force: true });
	const index = JSON.parse(readFileSync(resolve(ds, "design-system.json"), "utf8"));
	const uploaded = new Set(Object.keys(index.assetGroups?.Icons?.files || {}));
	// Design System: the brand book, its sections, tokens, components and icons that are not uploads.
	const dsFiles = new Map<string, string>();
	const take = (path: string) => dsFiles.set("project/" + relative(ds, path), path);
	take(resolve(ds, "README.md"));
	for (const f of walk(resolve(ds, "handbook"))) take(f);
	for (const f of walk(resolve(ds, "references"))) take(f);
	take(resolve(ds, "tokens.json"));
	// The page only rebuilds tokens.css when someone edits a token there, so publish it compiled.
	writeOut(
		"tokens",
		"tokens.css",
		tokensCss(JSON.parse(readFileSync(resolve(ds, "tokens.json"), "utf8"))),
	);
	dsFiles.set("project/tokens.css", resolve(out, "tokens/tokens.css"));
	for (const f of walk(resolve(ds, "components"))) take(f);
	const warnings: string[] = [];
	for (const f of walk(resolve(ds, "assets"))) {
		const name = relative(resolve(ds, "assets/Icons"), f);
		if (!uploaded.has(name)) take(f);
		else if (
			published.ds["project/assets/Icons/" + name] &&
			published.ds["project/assets/Icons/" + name] !== hash(f)
		)
			warnings.push(
				`icon ${name} changed; upload it as an asset and update its blob id in the index`,
			);
	}
	// Canvas: every board on both pages and their image folders, flat under project/ as online.
	const canvasFiles = new Map<string, string>();
	for (const folder of ["boards", "history"])
		for (const f of walk(resolve(ds, folder))) {
			const path = relative(resolve(ds, folder), f);
			// support.js comes from the canvas type online; index.html is the local board index.
			if (/^(index\.html|canvas\.json|README\.md|support\.js)$/.test(path)) continue;
			canvasFiles.set("project/" + path, f);
		}
	// The local board loader resolves the generated bundle through serve-boards.
	// Publishing carries the bundle at that loader's relative URL instead.
	const readingBundle = resolve(out, "expanded-reading/interactions.js");
	if (canvasFiles.has("project/expanded-reading/interactions.js")) {
		if (!existsSync(readingBundle))
			throw new Error("Run design-init.sh build before staging boards");
		canvasFiles.set("project/expanded-reading/interactions.js", readingBundle);
	}
	canvasFiles.set("project/assets/sill-icon.png", resolve(repo, "assets/sill-icon.png"));
	const plan = {
		note,
		ds: part("ds", dsFiles, DS_URL),
		canvas: part("canvas", canvasFiles, CANVAS_URL),
		warnings,
	};
	// Indexes go last, in a call of their own.
	const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
	const by = execFileSync("git", ["config", "user.name"], { cwd: repo, encoding: "utf8" }).trim();
	index.lastChange = { at, by, via: "Claude Code · design-init", ...(note ? { note } : {}) };
	writeOut("ds", "project/design-system.json", JSON.stringify(index, null, 2) + "\n");
	writeOut(
		"canvas",
		"project/canvas.json",
		readFileSync(resolve(ds, "boards/canvas.json"), "utf8"),
	);
	writeFileSync(resolve(out, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
	const count = (p: any) => `${p.files.length} 个改动，${p.delete.length} 个删除`;
	console.log(
		`Design System：${count(plan.ds)}\n设计画布：${count(plan.canvas)}\n计划：dist/design/plan.json`,
	);
	for (const warning of warnings) console.log("! " + warning);
	if (
		!plan.ds.files.length &&
		!plan.ds.delete.length &&
		!plan.canvas.files.length &&
		!plan.canvas.delete.length
	)
		console.log("线上已是最新，只需发布索引时才发布。");
}

function part(name: "ds" | "canvas", files: Map<string, string>, url: string) {
	const hashes: Record<string, string> = {};
	const changed: string[] = [];
	for (const [path, source] of files) {
		let content = readFileSync(source);
		if (name === "canvas" && path.endsWith(".html")) {
			content = Buffer.from(
				content
					.toString("utf8")
					.replaceAll("/dist/design/expanded-reading/interactions.js", "interactions.js")
					.replaceAll("../../../assets/sill-icon.png", "../assets/sill-icon.png"),
			);
		}
		hashes[path] = createHash("sha1").update(content).digest("hex");
		writeOut(name, path, content);
		if (published[name][path] !== hashes[path]) changed.push(path);
	}
	writeFileSync(resolve(out, `${name}-hashes.json`), JSON.stringify(hashes, null, 2) + "\n");
	const gone = Object.keys(published[name]).filter(
		(path) => !files.has(path) && !path.startsWith("project/assets/Icons/"),
	);
	return {
		url,
		root: `dist/design/${name}`,
		index: name === "ds" ? "project/design-system.json" : "project/canvas.json",
		files: changed,
		delete: gone,
	};
}

function writeOut(name: string, path: string, content: string | Buffer) {
	const target = resolve(out, name, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function record(dsVersion?: string, canvasVersion?: string, adrNumber?: string) {
	if (!dsVersion || !canvasVersion)
		throw new Error("Usage: stage.ts record <ds-version> <canvas-version> [ADR]");
	const plan = JSON.parse(readFileSync(resolve(out, "plan.json"), "utf8"));
	const next = {
		ds: JSON.parse(readFileSync(resolve(out, "ds-hashes.json"), "utf8")),
		canvas: JSON.parse(readFileSync(resolve(out, "canvas-hashes.json"), "utf8")),
	};
	// Uploaded icons stay recorded so a later change to one is noticed.
	for (const [path, value] of Object.entries(published.ds))
		if (path.startsWith("project/assets/Icons/") && !next.ds[path]) next.ds[path] = value;
	for (const f of walk(resolve(ds, "assets/Icons")))
		next.ds["project/assets/Icons/" + relative(resolve(ds, "assets/Icons"), f)] = hash(f);
	const reading = Object.fromEntries(
		Object.entries(next.canvas).filter(([path]) => path.startsWith("project/expanded-reading/")),
	);
	const canvas = Object.fromEntries(
		Object.entries(next.canvas).filter(([path]) => !path.startsWith("project/expanded-reading/")),
	);
	for (const [name, entries] of Object.entries({ ds: next.ds, canvas, "canvas-reading": reading }))
		writeFileSync(resolve(ds, `published-${name}.json`), JSON.stringify(entries, null, 2) + "\n");
	writeFileSync(
		publishedFile,
		JSON.stringify(
			{
				note: "上次发布到线上的文件指纹，由 design-init.sh record 写入。",
				ds: "published-ds.json",
				canvas: ["published-canvas.json", "published-canvas-reading.json"],
			},
			null,
			2,
		) + "\n",
	);
	copyFileSync(resolve(out, "ds/project/design-system.json"), resolve(ds, "design-system.json"));
	const versions = resolve(repo, "docs/design/versions.md");
	const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
	const adr = readdirSync(resolve(repo, "docs/adr"))
		.filter((f) => (adrNumber ? f.startsWith(adrNumber.padStart(4, "0") + "-") : /^\d{4}-/.test(f)))
		.sort()
		.at(-1);
	const row = `| ${day} | [ADR ${adr.slice(0, 4)}](../adr/${adr}) | ${dsVersion} | ${canvasVersion} | ${plan.note || "未写说明"} |`;
	writeFileSync(versions, readFileSync(versions, "utf8").trimEnd() + "\n" + row + "\n");
	console.log(
		"已记录：design-system/published.json、design-system/design-system.json、docs/design/versions.md\n" +
			row,
	);
}

// Same layout as the page's own build ("tokens.css as compiled" in the type's format reference).
function tokensCss(tokens: any) {
	const note = (t: any) => (t.usage ? ` /* ${String(t.usage).replace(/\*\//g, "* /")} */` : "");
	const theme = tokens.color.themes[0].id;
	const value = (t: any) => (typeof t.value === "string" ? t.value : t.value[theme]);
	const line = (t: any) => `  --${t.name}: ${value(t)};${note(t)}`;
	const lists = Object.entries(tokens).filter(
		([key, family]: [string, any]) =>
			Array.isArray(family?.tokens) && key !== "color" && key !== "shadow",
	);
	lists.sort(([a], [b]) => (a === "spacing" ? -1 : b === "spacing" ? 1 : 0));
	const styles = tokens.type.groups.flatMap((group: any) =>
		group.styles.map((style: any) => ({ ...style, family: style.family || group.family })),
	);
	return [
		`/* ${tokens.name} — generated from tokens.json */`,
		`:root, [data-theme="${theme}"] {`,
		...tokens.color.tokens.map(line),
		...(tokens.shadow?.tokens || []).map(line),
		"}",
		":root {",
		...lists.flatMap(([, family]: [string, any]) => family.tokens.map(line)),
		...Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`),
		...styles.map(
			(s: any) =>
				`  --text-${s.name}: ${s.fontWeight || 400} ${s.fontSize}/${s.lineHeight} var(--font-${s.family});${note(s)}`,
		),
		"}",
		...styles.map(
			(s: any) =>
				`.${s.name} {\n  font-family: var(--font-${s.family});\n  font-size: ${s.fontSize};\n  line-height: ${s.lineHeight};\n  font-weight: ${s.fontWeight || 400};\n  letter-spacing: ${s.letterSpacing || 0};\n}`,
		),
		"",
	].join("\n");
}
