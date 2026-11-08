/** Instruments recording for an explicit process and offline performance reports. */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPerformanceReport } from "./performance-report.ts";

const repo = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const mode = args[0];
const value = (flag: string, fallback: string) =>
	args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const run = (cmd: string, argv: string[], log: string, env: NodeJS.ProcessEnv = process.env) => {
	const output = createWriteStream(log);
	const child = spawn(cmd, argv, { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
	child.stdout.pipe(output, { end: false });
	child.stderr.pipe(output, { end: false });
	const done = new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => {
			output.end();
			resolve(code ?? 1);
		});
	});
	return { child, done };
};
if (mode === "report") {
	if (!args[1]) throw Error("Provide a trace directory.");
	await buildPerformanceReport(
		resolve(args[1]),
		args.includes("--baseline") ? resolve(value("--baseline", "")) : undefined,
	);
	process.exit(0);
}
if (mode !== "manual")
	throw Error("Use manual --pid N, or report <directory> [--baseline directory].");
const output = resolve(
	value("--output", `/private/tmp/sill-performance-${Date.now()}-${randomUUID().slice(0, 8)}`),
);
await mkdir(output, { recursive: false });
const template = value("--template", "Time Profiler");
if (!["Time Profiler", "SwiftUI", "Animation Hitches"].includes(template))
	throw Error("Unsupported template.");
const seconds = Number(value("--seconds", "60"));
if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600)
	throw Error("seconds must be 5–600.");
const captures: Array<{
	session: string;
	status: number;
	path: string;
	export_status?: number;
}> = [];
console.log(`Performance output: ${output}`);
if (mode === "manual") {
	const pid = value("--pid", "");
	if (!/^\d+$/.test(pid)) throw Error("manual requires an explicit Sill PID.");
	const processPath = spawnSync("ps", ["-p", pid, "-o", "comm="], { encoding: "utf8" });
	if (processPath.status || !processPath.stdout.trim().endsWith("/Sill"))
		throw Error("PID must identify the running Sill executable.");
	console.log(
		`Recording Sill PID ${pid} for ${seconds}s. Use the app and mark issues in its Performance menu.`,
	);
	const path = resolve(output, "manual.trace");
	const status = await run(
		"xcrun",
		[
			"xctrace",
			"record",
			"--template",
			template,
			"--attach",
			pid,
			"--time-limit",
			`${seconds}s`,
			"--output",
			path,
		],
		resolve(output, "instruments.log"),
	).done;
	captures.push({ session: "manual", status, path });
	if (status) process.exitCode = status;
}
for (const capture of captures.filter((c) => c.status === 0)) {
	const result = spawnSync("xcrun", ["xctrace", "export", "--input", capture.path, "--toc"], {
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	capture.export_status = result.status ?? 1;
	if (!result.status) {
		await writeFile(`${capture.path}.toc.xml`, result.stdout);
	} else process.exitCode ||= 1;
}
await writeFile(resolve(output, "instruments.json"), JSON.stringify(captures, null, 2));
if (!captures.length || captures.some((c) => c.status !== 0)) process.exitCode ||= 1;
console.log(`Completed. Instruments status: ${process.exitCode || 0}. See ${output}`);
