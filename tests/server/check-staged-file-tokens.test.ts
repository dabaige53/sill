import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

test("Codex pre-commit hook enforces the byte limit against the index", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "sill-token-hook-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: directory, encoding: "utf8" });
	const write = (path: string, content: string | Buffer) => {
		mkdirSync(dirname(join(directory, path)), { recursive: true });
		writeFileSync(join(directory, path), content);
	};
	git("init", "--quiet");
	git("config", "user.name", "Hook Test");
	git("config", "user.email", "hook@example.invalid");
	git("config", "commit.gpgsign", "false");
	git("config", "core.hooksPath", "/dev/null");
	const check = () =>
		spawnSync(process.execPath, [join(root, ".codex/hooks/check-staged-file-tokens.ts")], {
			cwd: directory,
			encoding: "utf8",
		});
	const hook = (command: string) => {
		const result = spawnSync(process.execPath, [join(root, ".codex/hooks/pre-commit.ts")], {
			cwd: root,
			encoding: "utf8",
			input: JSON.stringify({
				hook_event_name: "PreToolUse",
				tool_name: "Bash",
				cwd: directory,
				tool_input: { command },
			}),
		});
		assert.equal(result.status, 0, result.stderr);
		return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : undefined;
	};

	await t.test("empty index and untracked oversized files pass", () => {
		write("untracked.ts", "a".repeat(20_001));
		assert.equal(check().status, 0);
	});
	await t.test("exactly 20,000 staged bytes pass despite oversized working copy", () => {
		write("boundary.ts", "a".repeat(20_000));
		git("add", "--", "boundary.ts");
		write("boundary.ts", "a".repeat(20_001));
		assert.equal(check().status, 0);
		assert.equal(hook('git commit -m "Allowed"'), undefined);
		write("boundary.ts", "a".repeat(20_000));
	});
	await t.test("locks, generated outputs and binary assets pass", () => {
		for (const path of [
			"nested/package-lock.json",
			"Package.resolved",
			"contracts/schema.json",
			"contracts/apple-openapi.json",
			"contracts/design/mcp-tools.json",
			"contracts/design/fixtures.json",
			"design-system/components/bundle.css",
			"design-system/components/bundle.js",
			"design-system/assets/Icons/example.svg",
			"src/__generated__/types.ts",
			"src/generated/types.ts",
			"src/client.generated.ts",
			"src/client.g.swift",
			"vendor/library.ts",
		]) {
			write(path, "a".repeat(20_001));
			git("add", "--", path);
		}
		write("asset.png", Buffer.alloc(20_001));
		git("add", "--", "asset.png");
		assert.equal(check().status, 0);
		git("commit", "--quiet", "-m", "Allowed staged files");
	});
	await t.test(
		"oversized staged UTF-8 file returns a Codex denial with splitting instructions",
		() => {
			const path = "含 空格\t换行\n.ts";
			write(path, "中".repeat(6_667));
			git("add", "--", path);
			write(path, "small unstaged content");
			const result = hook('git commit -m "Must be blocked"');
			assert.equal(result.hookEventName, "PreToolUse");
			assert.equal(result.permissionDecision, "deny");
			const reason = result.permissionDecisionReason;
			assert.match(reason, /20001 bytes = 5000\.25 tokens/);
			assert.ok(reason.includes(JSON.stringify(path)));
			assert.match(reason, /import\/export/);
			assert.match(reason, /相对链接/);
			assert.match(reason, /git add --/);
			assert.match(reason, /暂存版本/);
			assert.equal(hook("git add -- file.ts"), undefined);
			git("reset", "--quiet", "HEAD", "--", path);
		},
	);
	await t.test("unchanged oversized files and staged deletions pass; renames are checked", () => {
		write("old.ts", "x".repeat(20_001));
		git("add", "--", "old.ts");
		git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Existing large file");
		assert.equal(check().status, 0);
		git("mv", "--", "old.ts", "renamed.ts");
		assert.equal(check().status, 1);
		git("rm", "-f", "--", "renamed.ts");
		assert.equal(check().status, 0);
	});
	await t.test("combined staging and commit or implicit staging are denied", () => {
		for (const command of [
			'git add . && git commit -m "Commit"',
			'git commit -am "Commit"',
			'git -C /tmp commit -m "Commit"',
		])
			assert.equal(hook(command).permissionDecision, "deny");
	});
});
