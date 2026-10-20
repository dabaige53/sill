/**
 * Writes the Web demo cards (SeedCards + SeedItems) as a local macOS workspace.
 * Usage: node scripts/macos-demo-data.ts <absolute directory>
 * Then: dist/macos/Sill.app/Contents/MacOS/Sill --data-directory <absolute directory>
 * Refuses to replace an existing cards.json.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { SeedCards, SeedItems } from "../apps/web/data/cards.ts";

const directory = process.argv[2];
if (!directory || !isAbsolute(directory)) {
	console.error("Usage: node scripts/macos-demo-data.ts <absolute directory>");
	process.exit(1);
}
const file = resolve(directory, "cards.json");
if (existsSync(file)) {
	console.error(`${file} already exists; choose an empty directory.`);
	process.exit(1);
}
await mkdir(directory, { recursive: true });
const snapshot = {
	revision: 1,
	state: { cards: SeedCards, items: SeedItems, preferences: {}, seconds: 0 },
};
await writeFile(file, `${JSON.stringify(snapshot, null, "\t")}\n`, { flag: "wx" });
console.log(`${SeedCards.length} cards → ${file}`);
