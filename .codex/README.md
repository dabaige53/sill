# Codex 项目配置

`hooks.json` 注册 `PreToolUse`，通过 `Bash` 匹配 Codex 的 shell 和 `exec_command` 调用。在 Codex 运行 `git commit` 前，`hooks/pre-commit.ts` 同时检查暂存版本和本地工作区。此配置不安装 Git hook，不影响用户在终端自行提交。

首次使用或修改 hook 定义后，在 Codex CLI 的 `/hooks` 中审阅并信任本项目的 hook；未信任时 Codex 会跳过它。现有会话若未重新加载配置，重新进入项目会话后检查 `/hooks`。协议见 [Codex Hooks](https://learn.chatgpt.com/docs/hooks)。

先单独运行 `git add`，再单独运行 `git commit`；通过工具的 `workdir` 选择仓库。hook 拒绝把暂存与提交合在一条 shell 命令，也拒绝 `git commit -a` 等会改变提交内容的选项。它检查已有暂存版本，不预测命令执行后形成的新版本。封装在其他脚本中、命令文本不含 `git commit` 的提交不在此检查范围内。

上限为每文件 20,000 bytes，按 bytes / 4 计为 5,000 tokens；恰好达到上限可提交。暂存检查读取新增、修改、复制、改名或类型变化的索引内容；本地检查读取所有 Git 跟踪的文件和未被忽略的新文件，覆盖未暂存修改与未变更的旧文件。缺失文件、符号链接和二进制文件不参与本地大小检查。无法可靠识别作者身份，除明确豁免外均检查。

两种检查共用 `hooks/file-token-policy.ts`：豁免锁文件、生成目录及命名、Schema、组件包、生成图标；也豁免第三方 `support.js`、已导入的 `.agents/skills/`、设计画布导出的 `*.dc.html`、发布快照及验收记录中的 JSON/HTML/log 自动产物。已执行的 `20261016092653_sill_workspace_operations.sql` 保留原样作为历史迁移，后续新迁移仍受限，不按整个迁移目录豁免。

文案与设计变量源文件为 `design-system/copy/zh-Hans/*.json` 和 `design-system/tokens/*.json`；接口说明源文件为 `contracts/design/openapi-source.json`；SQL 准备脚本源文件为 `supabase/drafts/rpc/*.sql`。这些小源文件正常检查。它们生成的原路径兼容文件只作输出，允许超限。修改后运行 `npm run contracts:generate`；`contracts:check` 会核对输出是否过期。

超限时向 Codex 返回阻止结果，列出文件、bytes、tokens，并要求按职责拆代码、按主题拆文档、更新引用、检查与重新暂存。

手动检查暂存版本：`node .codex/hooks/check-staged-file-tokens.ts`。同时检查本地文件：`node .codex/hooks/check-staged-file-tokens.ts --local`。报错分别标记「暂存」和「本地」，两者都要修复。

验证：`node --test tests/server/check-staged-file-tokens.test.ts`；测试只使用临时 Git 仓库和合成 hook 输入。
