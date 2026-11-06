import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { changedPaths, classifyChanges, planChanges } from "../../scripts/ci-changes.ts";

// @wu-test type=behavior | scope=scripts/ci-changes classifyChanges | protects=Avoid running product checks for documentation-only changes
test("documentation only uses lightweight checks", () => {
	const plan = classifyChanges([
		"docs/implementation/CI.md",
		"README.md",
		"AGENTS.md",
		"apps/apple/README.md",
		"design-system/handbook/motion.md",
	]);
	assert.equal(plan.code, false);
	assert.equal(plan.apple, false);
});

// @wu-test type=behavior | scope=scripts/ci-changes classifyChanges | protects=Run required checks for product, mixed and global changes
test("product Markdown, mixed changes and global inputs cannot skip product checks", () => {
	for (const path of [
		"skills/sill-cards/SKILL.md",
		"apps/web/app.ts",
		"package-lock.json",
		".github/workflows/ci.yml",
		"docs/tool.ts",
		"new-module/source.ts",
	]) {
		assert.equal(classifyChanges(["docs/README.md", path]).code, true, path);
	}
	for (const path of ["package-lock.json", ".github/workflows/ci.yml", "new-module/source.ts"])
		assert.equal(classifyChanges([path]).apple, true, path);
	assert.equal(classifyChanges(["apps/web/app.ts"]).apple, false);
	assert.equal(classifyChanges(["apps/apple/Sill.swift"]).apple, true);
});

// @wu-test type=behavior | scope=scripts/ci-changes planChanges | protects=Run all checks when a full run is requested or the diff is unavailable
test("manual full runs and unavailable diffs retain all checks", () => {
	for (const plan of [
		classifyChanges(null),
		classifyChanges([]),
		planChanges("workflow_dispatch", {}, process.cwd()),
		planChanges("release", {}, process.cwd()),
		planChanges("push", { before: "0".repeat(40), after: "HEAD" }, process.cwd()),
	]) {
		assert.equal(plan.code, true);
		assert.equal(plan.apple, true);
	}
});

// @wu-test type=integration | scope=scripts/ci-changes Git ranges | protects=Detect source changes across commit ranges and renames
test("Git ranges retain the whole PR, all push commits and source renames", () => {
	const root = mkdtempSync(join(tmpdir(), "sill-ci-changes-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	const commit = (path: string, text: string) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
		git("add", ".");
		git("commit", "-m", "fixture");
		return git("rev-parse", "HEAD");
	};
	try {
		git("init");
		git("config", "user.email", "ci@example.invalid");
		git("config", "user.name", "CI fixture");
		git("config", "commit.gpgsign", "false");
		const base = commit("README.md", "base\n");
		const code = commit("apps/web/source.ts", "export const value = 1;\n");
		const head = commit("docs/README.md", "documentation\n");
		assert.equal(classifyChanges(changedPaths(code, head, false, root)).code, false);
		assert.equal(classifyChanges(changedPaths(base, head, false, root)).code, true);
		assert.equal(
			planChanges(
				"pull_request",
				{ pull_request: { base: { sha: base }, head: { sha: head } } },
				root,
			).code,
			true,
		);
		assert.equal(planChanges("workflow_dispatch", { inputs: { full: "false" } }, root).code, false);
		git("checkout", "--detach", code);
		const advancedBase = commit("apps/apple/Other.swift", "// unrelated base change\n");
		assert.equal(classifyChanges(changedPaths(advancedBase, head, true, root)).code, false);
		git("checkout", "--detach", head);
		git("mv", "apps/web/source.ts", "docs/source.md");
		git("commit", "-m", "rename source into docs");
		assert.equal(classifyChanges(changedPaths(head, "HEAD", false, root)).code, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
