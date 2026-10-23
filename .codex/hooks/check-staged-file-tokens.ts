import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { byteLimit, isExempt } from "./file-token-policy.ts";

function git(args: string[]) {
	return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

try {
	process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
	const oversized: string[] = [];
	const entries = git([
		"diff",
		"--cached",
		"--numstat",
		"--no-renames",
		"--no-relative",
		"--no-ext-diff",
		"--diff-filter=ACMT",
		"-z",
	]).split("\0");
	for (const entry of entries) {
		if (!entry) continue;
		const firstTab = entry.indexOf("\t");
		const path = entry.slice(entry.indexOf("\t", firstTab + 1) + 1);
		if (entry.slice(0, firstTab) === "-" || isExempt(path)) continue;
		const bytes = Number(git(["cat-file", "-s", `:${path}`]).trim());
		if (bytes > byteLimit(path))
			oversized.push(
				`  暂存 ${JSON.stringify(path)}: ${bytes} bytes = ${bytes / 4} tokens; limit ${byteLimit(path)} bytes`,
			);
	}
	if (process.argv.includes("--local")) {
		const paths = new Set(
			git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0"),
		);
		for (const path of paths) {
			if (!path || isExempt(path)) continue;
			try {
				const stat = lstatSync(path);
				if (!stat.isFile() || stat.size <= byteLimit(path)) continue;
				const bytes = readFileSync(path);
				if (bytes.subarray(0, 8000).includes(0)) continue;
				oversized.push(
					`  本地 ${JSON.stringify(path)}: ${stat.size} bytes = ${stat.size / 4} tokens; limit ${byteLimit(path)} bytes`,
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
	}
	if (oversized.length) {
		console.error(
			[
				"提交已阻止：以下文件超过大小限制（tokens = bytes / 4；默认 20,000 bytes，既有大文件按已批准基线）：",
				...oversized,
				"",
				"请按以下步骤拆分，再提交：",
				"1. 按职责把代码移到同目录下命名明确的模块；通过 import/export 连接，避免循环依赖。",
				"2. 文档按主题拆成独立文件，在原文件保留简短入口和相对链接；测试按功能拆分，公共样例放入辅助文件。",
				"3. 保留现有行为、内容与对外接口，更新引用和目录说明；每个拆分后的文件均须不超过 20,000 bytes。不要通过压缩或删除必要内容规避限制。",
				"4. 运行相关检查，再单独用 git add -- <原文件> <新文件> 暂存拆分结果，然后单独运行 git commit。暂存版本与本地版本分别检查；修改工作区后仍须重新暂存。",
			].join("\n"),
		);
		process.exitCode = 1;
	}
} catch (error) {
	console.error("无法检查文件大小；请修复 Git/Node 错误后重新提交。", error);
	process.exitCode = 1;
}
