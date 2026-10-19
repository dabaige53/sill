import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function deny(reason: string) {
	console.log(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason,
			},
		}),
	);
}

try {
	const payload = JSON.parse(readFileSync(0, "utf8"));
	const input = payload.tool_input ?? {};
	const command = input.command ?? input.cmd ?? "";
	if (payload.hook_event_name === "PreToolUse" && /\bgit\b[^\n;&|]*\bcommit\b/.test(command)) {
		// Check the actual index before a standalone commit, not a future index changed by the shell.
		if (/[;&|\n]/.test(command) || /\s(?:-C|--git-dir|--work-tree)(?:\s|=)/.test(command)) {
			deny(
				"请先单独完成 git add，再单独调用 git commit；通过工具的 workdir 指定仓库，不在提交命令内切换目录。这样才能检查本次提交的暂存版本。",
			);
		} else if (/\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all|--include|--only)(?:\s|$)/.test(command)) {
			deny(
				"请先用 git add 暂存要提交的文件，再单独运行 git commit。不要使用会改变本次提交内容的 -a、--all、--include 或 --only；检查只针对已有暂存版本。",
			);
		} else {
			const result = spawnSync(
				process.execPath,
				[fileURLToPath(new URL("check-staged-file-tokens.ts", import.meta.url)), "--local"],
				{ cwd: input.workdir ?? input.cwd ?? payload.cwd ?? process.cwd(), encoding: "utf8" },
			);
			if (result.status !== 0)
				deny(result.stderr || result.error?.message || "暂存文件检查未完成，请修复后再提交。");
		}
	}
} catch (error) {
	deny(`无法读取 Codex hook 输入，请修复后再提交：${String(error)}`);
}
