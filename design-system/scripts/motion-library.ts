import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { copy } from "../copy.ts";
import entries from "../motion/catalog.json" with { type: "json" };

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "dist/design/motion");
await mkdir(output, { recursive: true });
const styles: string[] = JSON.parse(
	await readFile(resolve(root, "apps/web/styles/styles.json"), "utf8"),
);
await writeFile(
	resolve(output, "product.css"),
	(await Promise.all(styles.map((file) => readFile(resolve(root, file), "utf8")))).join("\n"),
);
await build({
	absWorkingDir: root,
	entryPoints: {
		index: "apps/web/motion-library/index.tsx",
		example: "apps/web/motion-library/example.tsx",
	},
	outdir: output,
	bundle: true,
	format: "esm",
	splitting: true,
	jsx: "automatic",
	target: "es2022",
	define: { "process.env.NODE_ENV": '"production"' },
	minify: true,
});
const html = (title: string, prefix: string, entry: string) => `<!doctype html>
<html lang="zh-Hans" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title} · Sill</title><link rel="stylesheet" href="${prefix}product.css">
<link rel="stylesheet" href="${prefix}${entry}.css"></head><body><div id="root"></div>
<script type="module" src="${prefix}${entry}.js"></script></body></html>\n`;
await writeFile(resolve(output, "index.html"), html(copy("motion.title"), "./", "index"));
for (const entry of entries) {
	const directory = resolve(output, "examples", entry.id);
	await mkdir(directory, { recursive: true });
	await writeFile(resolve(directory, "index.html"), html(entry.id, "../../", "example"));
}
const paths = [
	...new Set(entries.flatMap((entry) => [entry.component, entry.implementation, entry.native])),
];
const sources = Object.fromEntries(
	await Promise.all(paths.map(async (file) => [file, await readFile(resolve(root, file), "utf8")])),
);
await writeFile(resolve(output, "sources.json"), JSON.stringify(sources));
console.log(`Built ${entries.length} motion examples: ${output}`);
