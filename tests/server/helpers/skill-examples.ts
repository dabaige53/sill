import { readdirSync, readFileSync } from "node:fs";

const directory = new URL("../../../skills/sill-cards/references/cards/", import.meta.url);

/** Every JSON example in the per-type card templates, in file order. */
export const skillExamples = readdirSync(directory)
	.filter((name) => name.endsWith(".md"))
	.sort()
	.flatMap((name) =>
		[...readFileSync(new URL(name, directory), "utf8").matchAll(/```json\n([\s\S]*?)\n```/g)].map(
			(match) => JSON.parse(match[1]),
		),
	);
