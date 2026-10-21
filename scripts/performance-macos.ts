/** Xcode XCTest + Instruments. Default: background benchmark. Explicit modes: ui | manual --pid N | report <directory>. */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPerformanceReport, parseXCTestMetrics } from "./performance-report.ts";

const repo = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith("--") ? args[0] : "benchmark";
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
if (mode === "benchmark") {
	const output = resolve(value("--output", `/private/tmp/sill-benchmark-${Date.now()}`));
	await mkdir(output, { recursive: false });
	console.log(`XCTest benchmark: ${output}`);
	const child = spawn(
		"swift",
		[
			"test",
			"--disable-sandbox",
			"--package-path",
			"apps/apple",
			"--configuration",
			"release",
			"--disable-automatic-resolution",
			"--filter",
			"PerformanceBenchmarks",
		],
		{
			cwd: repo,
			env: { ...process.env, SILL_RUN_BENCHMARKS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	const log = createWriteStream(resolve(output, "xctest.log"));
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	const status = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => {
			log.end();
			resolve(code ?? 1);
		});
	});
	const metrics = parseXCTestMetrics(await readFile(resolve(output, "xctest.log"), "utf8"));
	await writeFile(
		resolve(output, "result.json"),
		JSON.stringify(
			{
				status,
				tool: "Xcode XCTest via swift test",
				configuration: "release",
				scenarios: [...new Set(metrics.map((m) => m.test))],
				measurement_scope:
					"In-process commands and scroll handlers; excludes rendered frames, input hit testing and deferred I/O.",
				metrics,
				xcode: spawnSync("xcodebuild", ["-version"], { encoding: "utf8" }).stdout,
			},
			null,
			2,
		),
	);
	process.exit(status);
}
if (!["ui", "manual"].includes(mode))
	throw Error(
		"Use benchmark (default, no GUI), ui, manual --pid N, or report <directory> [--baseline directory].",
	);
const output = resolve(
	value("--output", `/private/tmp/sill-performance-${Date.now()}-${randomUUID().slice(0, 8)}`),
);
await mkdir(output, { recursive: false });
const template = value("--template", "Time Profiler");
if (!["Time Profiler", "SwiftUI", "Animation Hitches"].includes(template))
	throw Error("Unsupported template.");
const seconds = Number(value("--seconds", mode === "ui" ? "180" : "60"));
if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600)
	throw Error("seconds must be 5–600.");
const captures: Array<{
	session: string;
	status: number;
	path: string;
	truncated?: boolean;
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
} else {
	const count = Number(value("--cards", "300"));
	const iterations = Number(value("--iterations", "5"));
	if (
		![30, 300, 3000, 10000].includes(count) ||
		!Number.isInteger(iterations) ||
		iterations < 1 ||
		iterations > 30
	)
		throw Error("Invalid card count or iterations.");
	const workspace = resolve(output, "workspace"),
		traces = resolve(output, "sessions");
	await mkdir(workspace);
	await mkdir(traces);
	const cards = Array.from({ length: count }, (_, i) => ({
		id: `perf-${String(i).padStart(5, "0")}`,
		type: "article",
		title: `Synthetic ${String(i).padStart(5, "0")}`,
		summary: "Synthetic performance fixture. Fixed content, no external sources.",
		body: Array.from({ length: 12 }, () =>
			"Synthetic content for repeatable reading and search performance. ".repeat(4),
		),
		time: 1792500000000 - i * 60000,
	}));
	await writeFile(
		resolve(workspace, "cards.json"),
		JSON.stringify({ revision: 1, state: { cards, items: {}, preferences: {}, seconds: 0 } }),
	);
	// A separate bundle identity prevents XCUIApplication from terminating the user's real app.
	const app = resolve(output, "SillPerformance.app");
	await cp(resolve(repo, "dist/macos/Sill.app"), app, { recursive: true });
	const id = `app.sill.performance.${randomUUID().replaceAll("-", "")}`;
	for (const [cmd, argv] of [
		[
			"/usr/libexec/PlistBuddy",
			["-c", `Set :CFBundleIdentifier ${id}`, resolve(app, "Contents/Info.plist")],
		],
		["codesign", ["--force", "--deep", "--sign", "-", app]],
	] as const) {
		const result = spawnSync(cmd, [...argv], { encoding: "utf8" });
		if (result.status) throw Error(result.stderr);
	}
	const config = resolve(output, "config.json");
	const notification = `${id}.recording`;
	const ready = resolve(output, "recording.ready");
	const signal = resolve(output, "recording-signal");
	const compiled = spawnSync(
		"xcrun",
		["clang", "-fblocks", "tests/apple/recording-signal.c", "-o", signal],
		{ cwd: repo, encoding: "utf8" },
	);
	if (compiled.status) throw Error(compiled.stderr);
	await writeFile(config, JSON.stringify({ app, workspace, output: traces, iterations, ready }));
	await writeFile(
		resolve(output, "run.json"),
		JSON.stringify(
			{
				schema: 1,
				dataset: "synthetic-articles-v1",
				cards: count,
				iterations,
				template,
				platform: process.arch,
				xcode: spawnSync("xcodebuild", ["-version"], { encoding: "utf8" }).stdout,
				revision: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
				dirty: spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout.length > 0,
			},
			null,
			2,
		),
	);
	console.log(
		"Running native XCTest scenarios; Instruments attaches only to isolated test app processes.",
	);
	const test = run(
		"xcodebuild",
		[
			"-project",
			"tests/apple/PerformanceHarness.xcodeproj",
			"-scheme",
			"SillPerformance",
			"-destination",
			"platform=macOS",
			"-parallel-testing-enabled",
			"NO",
			"-test-timeouts-enabled",
			"YES",
			"-maximum-test-execution-time-allowance",
			String(Math.max(120, iterations * 90)),
			"-derivedDataPath",
			resolve(output, "derived"),
			"-resultBundlePath",
			resolve(output, "tests.xcresult"),
			"test",
		],
		resolve(output, "xcodebuild.log"),
		{ ...process.env, TEST_RUNNER_SILL_PERF_CONFIG: config },
	);
	let finished = false;
	const completion = test.done.then((code) => {
		finished = true;
		return code;
	});
	const seen = new Set<string>(),
		recordings: Promise<void>[] = [];
	while (!finished) {
		for (const session of await readdir(traces)) {
			if (seen.has(session)) continue;
			let metadata: { pid: number; automation_token: string };
			try {
				metadata = JSON.parse(await readFile(resolve(traces, session, "session.json"), "utf8"));
			} catch {
				continue;
			}
			if (!Number.isInteger(metadata.pid) || !/^[A-F0-9-]{36}$/.test(metadata.automation_token))
				continue;
			seen.add(session);
			const path = resolve(output, `${session}.trace`);
			const listener = spawn(signal, [notification, ready + "-" + metadata.automation_token], {
				stdio: ["ignore", "pipe", "inherit"],
			});
			await new Promise<void>((resolve, reject) => {
				listener.stdout.once("data", () => resolve());
				listener.once("error", reject);
				listener.once("exit", (code) => {
					if (code) reject(Error(`Recording listener failed: ${code}`));
				});
			});
			const recording = run(
				"xcrun",
				[
					"xctrace",
					"record",
					"--template",
					template,
					"--notify-tracing-started",
					notification,
					"--attach",
					String(metadata.pid),
					"--time-limit",
					`${seconds}s`,
					"--output",
					path,
				],
				resolve(output, `${session}.instruments.log`),
			);
			recordings.push(
				recording.done.then((status) => {
					if (listener.exitCode === null) listener.kill();
					captures.push({ session, status, path });
				}),
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	const status = await completion;
	await Promise.all(recordings);
	const exported = spawnSync(
		"xcrun",
		["xcresulttool", "get", "test-results", "summary", "--path", resolve(output, "tests.xcresult")],
		{ encoding: "utf8" },
	);
	if (exported.status === 0)
		await writeFile(resolve(output, "xctest-summary.json"), exported.stdout);
	if (status || !seen.size) process.exitCode = status || 1;
	for (const session of await readdir(traces))
		await buildPerformanceReport(resolve(traces, session));
}
for (const capture of captures.filter((c) => c.status === 0)) {
	const result = spawnSync("xcrun", ["xctrace", "export", "--input", capture.path, "--toc"], {
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	capture.export_status = result.status ?? 1;
	if (!result.status) {
		await writeFile(`${capture.path}.toc.xml`, result.stdout);
		if (mode === "ui") {
			capture.truncated = result.stdout.includes("<end-reason>Time limit reached</end-reason>");
			if (capture.truncated) process.exitCode ||= 1;
		}
	} else process.exitCode ||= 1;
}
await writeFile(resolve(output, "instruments.json"), JSON.stringify(captures, null, 2));
if (!captures.length || captures.some((c) => c.status !== 0)) process.exitCode ||= 1;
console.log(`Completed. XCTest and Instruments statuses: ${process.exitCode || 0}. See ${output}`);
