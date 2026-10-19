import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";
import { root } from "./build.ts";

const target = process.argv.includes("--cloud") ? "dist/cloud/index.html" : "dist/web/index.html";
const html = await readFile(resolve(root, target), "utf8");
const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, "$1</script>");
if (/<script\b[^>]*\bsrc=/i.test(markup) || /<link\b[^>]*rel=["']stylesheet/i.test(markup))
	throw new Error("external_runtime_asset");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 2 || scripts.some(([, code]) => !code.trim()))
	throw new Error("missing_standalone_scripts");
for (const [, code] of scripts) new Script(code);
if (html.indexOf(scripts[1][0]) < html.indexOf("<body>")) throw new Error("bundle_before_body");
JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
console.log("Standalone scripts and plugin manifest checked.");
