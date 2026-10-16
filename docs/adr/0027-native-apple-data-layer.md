# Mac 与 iOS 完全原生实现

2026-10-16，已确认，尚未实施。Mac 与 iOS 的界面和数据层都用 Swift 实现，放在 `apps/apple/SillKit/`；Mac 不再随包启动 Node 本地服务，也不使用 WebView。原因：iOS 无法运行随包的本地服务进程，Apple 端本来就要在 Swift 中实现数据层；Mac 改用同一套代码后，安装包不再包含占 115 MB 的 Node 运行时，也不再需要后台服务、随机端口和进程锁。

## Consequences

- Apple 端在本地直接写入数据，不经过服务端校验。卡片的结构由 `contracts/` 生成的类型保证；无法导出的业务规则（例如日程结束时间晚于开始时间、待办 ID 不重复）在 Swift 中实现，并用 `contracts/` 的合法与非法样例验证与服务端一致（见 ADR 0024）。
- 版本号冲突、写入结果未知等规则与其他端相同：冲突不覆盖新内容，不盲目重试。
- 新数据层必须能读取现有 Mac 数据 `~/Library/Application Support/Sill/cards.json` 与 `draft.json`，并完成来源字段迁移（只保留 `sources` 列表）；迁移前保留原文件副本。
- `server/local/` 继续服务 Web 本地开发与项目内 agent 技能（`.sill/local/`），不再被 Apple 端使用。
- Apple 端数据如何与云端同步另行决定，本决策不包含同步方案。
