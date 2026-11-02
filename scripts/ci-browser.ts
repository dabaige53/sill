import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Each existing entry runs once, in a separate process. Groups run on separate runners.
const groups = {
	motion: ["motion-material-browser.ts", "browser.ts"],
	navigation: [
		"drawer-browser.ts",
		"search-browser.ts",
		"search-filters-browser.ts",
		"refresh-motion-browser.ts",
	],
	layout: [
		"material-density-browser.ts",
		"pwa-touch-browser.ts",
		"photo-toolbar-browser.ts",
		"card-actions-settings-browser.ts",
		"home-tabs-browser.ts",
		"selection-browser.ts",
	],
};

const group = process.argv[2] ?? "all";
if (group === "--list") {
	console.log(JSON.stringify(groups, null, 2));
} else {
	if (group !== "all" && !Object.hasOwn(groups, group))
		throw new Error(`Unknown browser group: ${group}`);
	const entries: string[] = group === "all" ? Object.values(groups).flat() : groups[group];
	const root = resolve(import.meta.dirname, "..");
	const results: { file: string; seconds: number; passed: boolean }[] = [];
	for (const file of entries) {
		console.log(`::group::Browser entry: ${file}`);
		const start = performance.now();
		const result = spawnSync(process.execPath, [resolve(root, "tests/e2e", file)], {
			cwd: root,
			stdio: "inherit",
		});
		const seconds = (performance.now() - start) / 1000;
		const passed = result.status === 0;
		results.push({ file, seconds, passed });
		if (result.error) console.error(result.error.message);
		console.log(`Browser entry ${file}: ${passed ? "PASS" : "FAIL"} (${seconds.toFixed(1)}s)`);
		console.log("::endgroup::");
	}
	const directory = resolve(root, "tests/artifacts/ci");
	mkdirSync(directory, { recursive: true });
	writeFileSync(resolve(directory, `${group}.json`), JSON.stringify(results, null, 2));
	// The standalone scripts expose one result per entry, not individual assertions.
	const failures = results.filter((result) => !result.passed).length;
	const cases = results.map(
		(result) =>
			`<testcase classname="browser-entry" name="${result.file}" time="${result.seconds}">${result.passed ? "" : '<failure message="Browser entry failed; inspect job log"/>'}</testcase>`,
	);
	writeFileSync(
		resolve(directory, `${group}.xml`),
		`<testsuite name="browser-entries" tests="${results.length}" failures="${failures}">${cases.join("")}</testsuite>\n`,
	);
	if (failures) process.exitCode = 1;
}
