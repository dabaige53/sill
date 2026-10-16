import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";
import { root } from "./build.ts";

const html = await readFile(resolve(root, "dist/web/index.html"), "utf8");
for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Script(code);
JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
console.log("Standalone scripts and plugin manifest checked.");
