import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Prepare one immutable candidate. Deployment and host verification have separate receipts.
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (args.some((arg) => !["--plugin", "--macos"].includes(arg)))
	throw new Error("Usage: npm run release:prepare -- [--plugin] [--macos]");
const product = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const identity = JSON.parse(await readFile(resolve(root, "deploy/sill/release.json"), "utf8"));
function git(...parameters: string[]) {
	const result = spawnSync("git", parameters, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) throw new Error("Cannot read release source revision");
	return result.stdout.trim();
}
await mkdir(resolve(root, "dist/release"), { recursive: true });
const directory = await mkdtemp(resolve(root, "dist/release/candidate-"));
const manifest = {
	version: product.version,
	createdAt: new Date().toISOString(),
	commit: git("rev-parse", "HEAD"),
	workingTree: git("status", "--porcelain"),
	identity,
	status: "preparing",
	checks: [] as { command: string; status: string; durationMs: number }[],
	artifacts: [] as string[],
	deployment: "not_started",
	hostVerification: "not_started",
};
async function save() {
	await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
async function run(command: string, parameters: string[]) {
	console.log(`Release check: ${command} ${parameters.join(" ")}`);
	const started = Date.now();
	const result = spawnSync(command, parameters, { cwd: root, stdio: "inherit" });
	manifest.checks.push({
		command: [command, ...parameters].join(" "),
		status: result.status === 0 ? "passed" : "failed",
		durationMs: Date.now() - started,
	});
	await save();
	if (result.status !== 0) throw new Error(`Release stopped: ${command} ${parameters.join(" ")}`);
}
async function retain(source: string, target: string) {
	await cp(resolve(root, source), resolve(directory, target), { recursive: true });
	manifest.artifacts.push(target);
}
try {
	await save();
	for (const check of ["files:check", "contracts:check", "typecheck", "test:core", "test:server"])
		await run("npm", ["run", check]);
	await run("npm", ["run", "build:release"]);
	await retain("dist/cloud/worker.mjs", "worker.mjs");
	await retain("dist/cloud/app.html", "app.html");
	if (args.includes("--plugin")) {
		await run("node", ["scripts/build-plugin.ts"]);
		await retain("dist/plugin/sill", "plugin");
	}
	if (args.includes("--macos")) {
		await run("npm", ["run", "build:macos"]);
		await run("npm", ["run", "test:macos"]);
		await retain("dist/macos/Sill.app", "Sill.app");
	}
	manifest.status = manifest.workingTree ? "review_required" : "ready";
	await save();
	console.log(`Release candidate: ${directory}`);
	console.log(`Status: ${manifest.status}. Deployment and host verification have not run.`);
} catch (error) {
	manifest.status = "failed";
	await save();
	console.error(error instanceof Error ? error.message : "Release preparation failed");
	console.error(`Release report: ${directory}/manifest.json`);
	process.exitCode = 1;
}
