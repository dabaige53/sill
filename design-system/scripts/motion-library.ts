import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import entries from "../motion/catalog.json" with { type: "json" };

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "dist/design/motion");
const source = "design-system/motion/workbench";
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await build({
	absWorkingDir: root,
	entryPoints: { index: source + "/index.tsx", example: source + "/example.tsx" },
	outdir: output,
	bundle: true,
	format: "esm",
	splitting: true,
	jsx: "automatic",
	target: "es2022",
	define: { "process.env.NODE_ENV": '"production"' },
	minify: true,
	metafile: true,
});
// Product renderers are read-only dependencies of design examples, never an app entry.
const styles: string[] = JSON.parse(
	await readFile(resolve(root, "apps/web/styles/styles.json"), "utf8"),
);
await writeFile(
	resolve(output, "product.css"),
	(await Promise.all(styles.map((file) => readFile(resolve(root, file), "utf8")))).join("\n"),
);
execFileSync(
	process.execPath,
	[
		resolve(root, "node_modules/@tailwindcss/cli/dist/index.mjs"),
		"-i",
		source + "/library.css",
		"-o",
		output + "/index.css",
		"--minify",
	],
	{ cwd: root, stdio: "inherit" },
);
await writeFile(
	resolve(output, "example.css"),
	await readFile(resolve(root, source, "example.css"), "utf8"),
);
const html = (entry: string, prefix: string) => `<!doctype html>
<html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sill · 动画工作台</title><link rel="stylesheet" href="${prefix}${entry === "example" ? "product" : "index"}.css">${entry === "example" ? `<link rel="stylesheet" href="${prefix}example.css">` : ""}</head>
<body><div id="root"></div><script type="module" src="${prefix}${entry}.js"></script></body></html>\n`;
await writeFile(resolve(output, "index.html"), html("index", "./"));
for (const entry of entries) {
	const directory = resolve(output, "examples", entry.id);
	await mkdir(directory, { recursive: true });
	await writeFile(resolve(directory, "index.html"), html("example", "../../"));
}
const paths = [source + "/runtime.tsx", source + "/tuning.ts", source + "/references.ts"];
await writeFile(
	resolve(output, "sources.json"),
	JSON.stringify(
		Object.fromEntries(
			await Promise.all(
				paths.map(async (file) => [file, await readFile(resolve(root, file), "utf8")]),
			),
		),
	),
);
await writeFile(resolve(output, "metafile.json"), JSON.stringify(result.metafile));
console.log(`Built ${entries.length} isolated design demonstrations: ${output}`);
