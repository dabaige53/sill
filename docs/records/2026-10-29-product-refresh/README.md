# 云端、插件与 Mac 更新

日期：2026-10-29。范围为现有云端 Web、MCP 页面、插件技能及 Mac 内部测试包。不修改数据库、App 身份或受众。

## 发布检查诊断

第一次候选 `candidate-NBE49O` 在服务端测试停止。`tests/server/local-sync.test.ts` 的三个备注与批量标签冲突用例仍用 `modalKind: editor` 模拟编辑器；实际同步代码已使用 `editorLayer.open`。因此测试没有进入保留编辑基准的分支。

测试改用当前编辑器状态，关闭时同步设为 false，原冲突与草稿断言保持。针对性测试 9 项通过。产品代码未因本次失败修改。

## 发布状态

- 发布源码：`4a2cbe62c32aceb61b2c4b6a35594652d4abd7f3`，版本 1.2.8；候选 `candidate-IQoKLt`。
- 文件、共享定义、类型、设计检查通过；Web 核心 465 项、服务端 149 项、Swift 113 项通过，Mac 签名验证通过。
- 云端部署：`74bc0570-d288-434f-a9a2-9519959495d4`；Worker 版本 `d3fa66f1-578f-426d-833b-756ac778af1b`，流量 100%。健康接口 200，匿名会话接口 401。
- 回退部署：`6ee69ec9-4004-4af1-beb7-8f7f3d140495`；回退 Worker 版本 `fb633815-703f-4f1c-9a26-b04c47b9aa9f`。
- 插件 1.2.8，release `pluginrel_6ae2f6f5ba808191b55c59b776c3378b`。技能更新为 sill-cards 与 sill-operations，旧技能文件已删除。重新读取全部文件确认与源码一致，App 绑定、展示配置和私有范围不变。
- Mac 1.2.8，构建号 `1793259404`，已安装到个人 `~/Applications/Sill.app`，安装后签名验证通过。仅供内部测试，未公证，未创建 GitHub Release。
- 未执行浏览器、MCP 宿主页面或 Mac 窗口体验验收。

## 构建与提交问题

提交检查发现 panels.css 超过大小上限。将搜索建议及手机结果区域样式原样移入 search-suggestions.css，保持加载顺序，同步组件生成器并重新生成画板与组件样式。设计检查通过。

沙盒内 iconutil 报 Invalid Iconset；同一输入在沙盒外成功。最终候选在沙盒外完成构建与签名检查。

用户随后决定发布测试、程序验证、Web 和 Mac 构建统一交给 GitHub Actions。本次本地构建已在该决定前完成；后续默认只在本地做轻量检查并提交推送。
