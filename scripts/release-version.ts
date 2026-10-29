import { readFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (process.env.GITHUB_REF !== `refs/tags/v${version}`)
	throw new Error(`Release must run on the existing v${version} tag`);
console.log(`Release version: v${version}; commit: ${process.env.GITHUB_SHA}`);
