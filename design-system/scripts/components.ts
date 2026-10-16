import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const destination = process.argv[2];
if (!destination) throw new Error("Usage: node design-system/scripts/components.ts DESTINATION");
const source = fileURLToPath(new URL("../components/", import.meta.url));
const target = resolve(destination, "components");
if (target === resolve(source)) throw new Error("source_and_destination_must_differ");
await mkdir(target, { recursive: true });
for (const entry of await readdir(source))
	await cp(resolve(source, entry), resolve(target, entry), { recursive: true });
console.log("Copied maintained component previews");
