import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("cloud HTTP entry loads with native Node TypeScript stripping", () => {
	const entry = new URL("../../server/cloud/http.ts", import.meta.url).href;
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`const runtime = await import(${JSON.stringify(entry)}); console.log(typeof runtime.createSillRuntime);`,
		],
		{ encoding: "utf8" },
	);
	assert.equal(output.trim(), "function");
});
