import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function exportDesignData(check = false) {
	for (const [output, sources] of [
		[
			"copy/zh-Hans.json",
			["apple", "cards", "web-services", "web", "web-ai", "shared", "ai"].map(
				(name) => `copy/zh-Hans/${name}.json`,
			),
		],
		[
			"tokens.json",
			["foundation", "color", "spacing", "apple"].map((name) => `tokens/${name}.json`),
		],
	] as [string, string[]][]) {
		const merged: Record<string, unknown> = {};
		for (const source of sources) {
			const values = JSON.parse(readFileSync(new URL(`../${source}`, import.meta.url), "utf8"));
			for (const [key, value] of Object.entries(values)) {
				if (Object.hasOwn(merged, key)) throw new Error(`Duplicate design key: ${key}`);
				merged[key] = value;
			}
		}
		const target = new URL(`../${output}`, import.meta.url);
		const content = JSON.stringify(merged, null, "\t") + "\n";
		if (check) {
			if (readFileSync(target, "utf8") !== content) throw new Error(`Stale design data: ${output}`);
		} else writeFileSync(target, content);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url))
	exportDesignData(process.argv.includes("--check"));
