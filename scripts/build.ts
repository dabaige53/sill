import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import copy from "../design-system/copy/zh-Hans.json" with { type: "json" };

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
	);

export const root = resolve(import.meta.dirname, "..");
export async function buildPage({ cloud = false, check = false }: any = {}) {
	const scripts = await build({
		entryPoints: [resolve(root, cloud ? "apps/web/cloud-entry.ts" : "apps/web/index.ts")],
		bundle: true,
		write: false,
		platform: "browser",
		target: "es2022",
		format: "iife",
	});
	const stylePaths: string[] = JSON.parse(
		await readFile(resolve(root, "apps/web/styles/styles.json"), "utf8"),
	);
	const styles = await Promise.all(
		stylePaths.map((path?: any) => readFile(resolve(root, path), "utf8")),
	);
	if (cloud) styles.push(await readFile(resolve(root, "apps/web/cloud.css"), "utf8"));
	const script = scripts.outputFiles[0].text;
	const css = styles.join("\n\n");
	if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw new Error("unsafe_inline_tag");
	const template = await readFile(resolve(root, "apps/web/shell.html"), "utf8");
	const localized = template.replace(/\{\{COPY:([^}]+)\}\}/g, (_match, key: string) => {
		if (!Object.hasOwn(copy, key)) throw new Error(`missing_copy:${key}`);
		return escapeHtml(copy[key]);
	});
	const html = localized
		.replaceAll("{{PAGE}}", "feed")
		.replaceAll(
			"{{TITLE}}",
			escapeHtml(copy[cloud ? "web.pageTitle.cloud" : "web.pageTitle.local"]),
		)
		.replace("{{STYLES}}", css)
		.replace("{{SCRIPT}}", script);
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
	await buildPage({ check: process.argv.includes("--check") });
