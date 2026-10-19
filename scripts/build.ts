import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { repositoryRoot, webConfig } from "../apps/web/vite.config.ts";
import { exportDesignData } from "../design-system/scripts/export-data.ts";

export const root = repositoryRoot;
export async function buildPage({
	cloud = false,
	check = false,
}: {
	cloud?: boolean;
	check?: boolean;
} = {}) {
	exportDesignData(true);
	const config = webConfig({ cloud });
	const result = await build({
		...config,
		configFile: false,
		build: { ...config.build, write: false },
	});
	if ("on" in result) throw new Error("unexpected_watch_build");
	const outputs = Array.isArray(result) ? result : [result];
	const entry = outputs
		.flatMap((output) => output.output)
		.find((output) => output.type === "asset" && output.fileName === "index.html");
	if (!entry || entry.type !== "asset") throw new Error("missing_html_build");
	const html =
		typeof entry.source === "string" ? entry.source : new TextDecoder().decode(entry.source);
	const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, "$1</script>");
	if (/<script\s+[^>]*src=/i.test(markup) || /<link\s+[^>]*rel=["']stylesheet/i.test(markup))
		throw new Error("external_runtime_asset");
	const directory = resolve(root, cloud ? "dist/cloud" : "dist/web");
	const target = resolve(directory, "index.html");
	if (check) {
		if ((await readFile(target, "utf8")) !== html) throw new Error("stale_build");
	} else {
		await mkdir(directory, { recursive: true });
		await writeFile(target, html);
	}
	console.log(check ? "Build verified" : `Built ${target}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
	await buildPage({
		check: process.argv.includes("--check"),
		cloud: process.argv.includes("--cloud"),
	});
