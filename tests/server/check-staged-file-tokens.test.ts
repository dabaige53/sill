import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { byteLimit } from "../../.codex/hooks/file-token-policy.ts";

const root = resolve(import.meta.dirname, "../..");

test("Codex pre-commit hook enforces the byte limit against index and local files", async (t) => {
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
	const check = (flags: string[] = []) =>
		spawnSync(
			process.execPath,
			[join(root, ".codex/hooks/check-staged-file-tokens.ts"), ...flags],
			{
				cwd: directory,
				encoding: "utf8",
			},
		);
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
		assert.equal(check(["--local"]).status, 1);
		assert.match(
			hook('git commit -m "Local limit"').permissionDecisionReason,
			/本地.*untracked\.ts/,
		);
		rmSync(join(directory, "untracked.ts"));
	});
	await t.test("exactly 20,000 staged bytes pass despite oversized working copy", () => {
		write("boundary.ts", "a".repeat(20_000));
		git("add", "--", "boundary.ts");
		write("boundary.ts", "a".repeat(20_001));
		assert.equal(check().status, 0);
		assert.equal(hook('git commit -m "Local limit"').permissionDecision, "deny");
		write("boundary.ts", "a".repeat(20_000));
		assert.equal(hook('git commit -m "Allowed"'), undefined);
	});
	await t.test("locks, generated outputs and binary assets pass", () => {
		for (const path of [
			"nested/package-lock.json",
			"docs/large.md",
			"README.MD",
			"notes/reference.rst",
			"notes/manual.adoc",
			"notes/guide.txt",
			"notes/page.mdx",
			"notes/book.tex",
			"notes/report.docx",
			"notes/deck.pptx",
			"notes/sheet.xlsx",
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
			"contracts/design/openapi.json",
			"design-system/copy/zh-Hans.json",
			"design-system/tokens.json",
			"design-system/boards/support.js",
			"design-system/boards/Example.dc.html",
			"design-system/boards/settings/content.html",
			"docs/records/2026-10-19-example/audit.json",
			"deploy/releases/example/worker.mjs",
			".agents/skills/example/SKILL.md",
			"supabase/drafts/sill_v1_rpc.sql",
			"supabase/migrations/20261016092653_sill_workspace_operations.sql",
		]) {
			write(path, "a".repeat(20_001));
			git("add", "--", path);
		}
		write("asset.png", Buffer.alloc(20_001));
		git("add", "--", "asset.png");
		assert.equal(check().status, 0);
		assert.equal(check(["--local"]).status, 0);
		git("commit", "--quiet", "-m", "Allowed staged files");
	});
	await t.test("approved baseline caps existing paths without allowing new large files", () => {
		const path = "apps/web/styles/cards.css";
		const limit = byteLimit(path);
		assert.ok(limit > 20_000);
		write(path, "x".repeat(limit));
		git("add", "--", path);
		assert.equal(check(["--local"]).status, 0);
		write(path, "x".repeat(limit + 1));
		assert.equal(check().status, 0);
		assert.equal(check(["--local"]).status, 1);
		git("add", "--", path);
		assert.equal(check().status, 1);
		git("rm", "-f", "--", path);
		const renamed = "apps/web/styles/new-cards.css";
		write(renamed, "x".repeat(limit));
		git("add", "--", renamed);
		assert.equal(check().status, 1);
		git("rm", "-f", "--", renamed);
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
			assert.match(reason, /文档类型不受此限制/);
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
		assert.equal(check(["--local"]).status, 1);
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
	await t.test(
		"local checks honor ignores and do not exempt authored data or new migrations",
		() => {
			write(".gitignore", "ignored/\n");
			write("ignored/large.ts", "x".repeat(20_001));
			assert.equal(check(["--local"]).status, 0);
			for (const path of [
				"design-system/copy/zh-Hans/web.json",
				"design-system/tokens/color.json",
				"contracts/design/openapi-source.json",
				"supabase/migrations/20990101000000_new.sql",
			]) {
				write(path, "x".repeat(20_001));
				assert.equal(check(["--local"]).status, 1);
				rmSync(join(directory, path));
			}
		},
	);
});
