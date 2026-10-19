# Codex 项目配置

`hooks.json` 注册 `PreToolUse`，通过 `Bash` 匹配 Codex 的 shell 和 `exec_command` 调用。在 Codex 运行 `git commit` 前，`hooks/pre-commit.ts` 检查当前暂存文件。此配置不安装 Git hook，不影响用户在终端自行提交。

首次使用或修改 hook 定义后，在 Codex CLI 的 `/hooks` 中审阅并信任本项目的 hook；未信任时 Codex 会跳过它。现有会话若未重新加载配置，重新进入项目会话后检查 `/hooks`。协议见 [Codex Hooks](https://learn.chatgpt.com/docs/hooks)。

先单独运行 `git add`，再单独运行 `git commit`；通过工具的 `workdir` 选择仓库。hook 拒绝把暂存与提交合在一条 shell 命令，也拒绝 `git commit -a` 等会改变提交内容的选项。它检查已有暂存版本，不预测命令执行后形成的新版本。封装在其他脚本中、命令文本不含 `git commit` 的提交不在此检查范围内。

上限为每文件 20,000 bytes，按 bytes / 4 计为 5,000 tokens；恰好达到上限可提交。只检查新增、修改、复制、改名或类型变化的暂存文件，不读取工作区版本或检查未变更文件。无法可靠识别作者身份，除明确豁免外均检查。

豁免锁文件、Git 识别的二进制文件、`generated/`、`__generated__/`、`vendor/`、`node_modules/`、`*.generated.*`、`*.g.*`，以及检查脚本列出的 Schema、组件包和生成图标。混合手写内容的 `contracts/design/openapi.json` 仍检查。新增生成器时，只将其确定的输出加入豁免。

超限时向 Codex 返回阻止结果，列出文件、bytes、tokens，并要求按职责拆代码、按主题拆文档、更新引用、检查与重新暂存。

手动检查：`node .codex/hooks/check-staged-file-tokens.ts`。

验证：`node --test tests/server/check-staged-file-tokens.test.ts`；测试只使用临时 Git 仓库和合成 hook 输入。
