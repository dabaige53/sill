import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [destination, revision] = process.argv.slice(2);
if (!destination || !revision)
	throw new Error("Usage: node design-system/scripts/tokens.ts DESTINATION REVISION");
const source = new URL("../tokens.json", import.meta.url);
const tokens = JSON.parse(await readFile(source, "utf8"));
tokens.meta.ref = "main@" + revision;
await mkdir(resolve(destination), { recursive: true });
await writeFile(resolve(destination, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");
