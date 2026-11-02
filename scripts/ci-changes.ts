import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const documentRoots = ["README.md", "AGENTS.md", "GLOSSARY.md", "docs/LICENSE"];
const isDocument = (path: string) =>
	documentRoots.includes(path) ||
	/^docs\/.*\.md$/.test(path) ||
	/^design-system\/handbook\/.*\.md$/.test(path) ||
	/^(?:apps|server|contracts|design-system|scripts|tests|supabase)\/(?:.*\/)?README\.md$/.test(
		path,
	);

const isAppleInput = (path: string) =>
	/^(?:apps\/apple|contracts|design-system|assets|tests\/apple|\.github)\//.test(path) ||
	["scripts/build-macos.ts", "scripts/format.ts"].includes(path) ||
	!/^(?:apps\/web|server|supabase|tests\/(?:web|server|contracts|e2e)|scripts|skills|deploy)\//.test(
		path,
	);

export function classifyChanges(paths: string[] | null) {
	if (!paths?.length)
		return { code: true, apple: true, reason: "No reliable diff; run all checks" };
	const code = paths.filter((path) => !isDocument(path));
	return {
		code: code.length > 0,
		apple: code.some(isAppleInput),
		reason: code.length ? "Product, configuration or unknown files changed" : "Documentation only",
	};
}

export function changedPaths(base: string, head: string, pullRequest: boolean, cwd: string) {
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	const start = pullRequest ? git("merge-base", base, head).trim() : base;
	// A source file renamed into docs must retain its deleted source path in the diff.
	return git("diff", "--name-only", "--no-renames", "-z", start, head, "--")
		.split("\0")
		.filter(Boolean);
}

export function planChanges(eventName: string, event: any, cwd: string) {
	if (eventName === "workflow_dispatch" && event.inputs?.full !== "false")
		return { code: true, apple: true, reason: "Manual full verification" };
	try {
		if (eventName === "pull_request") {
			return classifyChanges(
				changedPaths(event.pull_request.base.sha, event.pull_request.head.sha, true, cwd),
			);
		}
		if (eventName === "push")
			return classifyChanges(changedPaths(event.before, event.after, false, cwd));
		if (eventName === "workflow_dispatch")
			return classifyChanges(changedPaths("HEAD^", "HEAD", false, cwd));
	} catch {
		return classifyChanges(null);
	}
	return classifyChanges(null);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
	const plan = planChanges(process.env.GITHUB_EVENT_NAME, event, process.cwd());
	appendFileSync(process.env.GITHUB_OUTPUT, `code=${plan.code}\napple=${plan.apple}\n`);
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`## CI scope\n\n${plan.reason}\n\n- Product checks: ${plan.code}\n- Apple checks: ${plan.apple}\n- File and link checks: always\n`,
	);
	console.log(JSON.stringify(plan));
}
