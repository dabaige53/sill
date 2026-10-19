import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const maxBytes = 20_000;
// Rebuilt outputs are exempt; their authored sources remain subject to the limit.
const generatedFiles = new Set([
	"contracts/schema.json",
	"contracts/apple-openapi.json",
	"contracts/design/mcp-tools.json",
	"contracts/design/fixtures.json",
	"design-system/components/bundle.js",
	"design-system/components/bundle.css",
]);
const lockfiles = new Set([
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	"Package.resolved",
	"Cargo.lock",
	"uv.lock",
	"poetry.lock",
	"Gemfile.lock",
	"composer.lock",
	"go.sum",
]);

function git(args: string[]) {
	return execFileSync("git", args, { encoding: "utf8" });
}

try {
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
	const oversized: string[] = [];
	for (const entry of entries) {
		if (!entry) continue;
		const firstTab = entry.indexOf("\t");
		const secondTab = entry.indexOf("\t", firstTab + 1);
		const path = entry.slice(secondTab + 1);
		if (
			entry.slice(0, firstTab) === "-" ||
			lockfiles.has(basename(path)) ||
			generatedFiles.has(path) ||
			path.startsWith("design-system/assets/Icons/") ||
			/(^|\/)(generated|__generated__|vendor|node_modules)\//.test(path) ||
			/\.(generated|g)\.[^/]+$/.test(path)
		)
			continue;
		const bytes = Number(git(["cat-file", "-s", `:${path}`]).trim());
		if (bytes > maxBytes)
			oversized.push(`  ${JSON.stringify(path)}: ${bytes} bytes = ${bytes / 4} tokens`);
	}
	if (oversized.length) {
		console.error(
			[
				"提交已阻止：以下暂存文件超过 5,000 tokens（tokens = bytes / 4；上限 20,000 bytes）：",
				...oversized,
				"",
				"请按以下步骤拆分，再提交：",
				"1. 按职责把代码移到同目录下命名明确的模块；通过 import/export 连接，避免循环依赖。",
				"2. 文档按主题拆成独立文件，在原文件保留简短入口和相对链接；测试按功能拆分，公共样例放入辅助文件。",
				"3. 保留现有行为、内容与对外接口，更新引用和目录说明；每个拆分后的文件均须不超过 20,000 bytes。不要通过压缩或删除必要内容规避限制。",
				"4. 运行相关检查，用 git add -- <原文件> <新文件> 暂存拆分结果，然后重新 git commit。检查读取暂存版本，仅修改工作区不会解除报错。",
			].join("\n"),
		);
		process.exitCode = 1;
	}
} catch (error) {
	console.error("无法检查暂存文件大小；请修复 Git/Node 错误后重新提交。", error);
	process.exitCode = 1;
}
