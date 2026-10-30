# 技能显示名称

最近检查：2026-10-30。状态：已定位，未实施修复。

## 环境与症状

用户截图中，插件详情页名称为 `sill`，两个技能均启用；输入框选择列表却显示 `Dev 6ad0d805d3e88191a1c8902cf66af046: Sill Cards` 等长名称。应用信息显示 `dev mode`、`DEVELOPMENT`，App ID 为 `asdk_app_6ad0d805d3e88191a1c8902cf66af046`。

本轮读取云端元数据：插件 ID 为 `plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046`，版本 `1.2.8`，release 为 `pluginrel_6ae2f6f5ba808191b55c59b776c3378b`，范围 `USER / PRIVATE`。本机缓存版本同为 `1.2.8`。

## 原因与依据

1. App 绑定插件的内部包名为 `dev-6ad0d805d3e88191a1c8902cf66af046`。包内 `displayName` 则为 `sill`；内部身份与对外名称不是同一个字段。包名与 App ID 后半段一致，历史添加技能记录确认当时沿用 App 自动生成插件的身份，并非本轮缓存生成的随机名称。
2. 两个技能的源码和安装缓存都只有 `SKILL.md` 及 references，没有 `agents/openai.yaml`，因此没有独立的 `interface.display_name`。
3. 对当前安装客户端资源进行只读检查：`/Applications/ChatGPT.app/Contents/Resources/app.asar` 中，`webview/assets/app-shared-e9f258fd3588.js` 的 `rAn(e)` 返回 `e.interface?.displayName?.trim() || Fcn(e.name)`。`Fcn` 按冒号分段，每段将连字符和下划线转换为空格，再转为标题形式。`ZMn(e)` 用该函数生成技能条目的 `displayName`，同时保留原始 `name` 和 `path`。
4. 同一客户端的 `webview/assets/skills-37a2a5532606.js` 中，详情区域的 `Kn(e)` 在缺少技能显示名时先取 `e.name.split(':').pop()`，即去掉插件前缀。两个位置的默认显示规则不同，可解释详情页短名称与选择列表长名称同时存在。
5. 官方插件文档说明包 `name` 用作身份和组件命名空间；官方技能文档说明 `agents/openai.yaml` 用于配置 UI 元数据，并支持 `interface.display_name`。

因此是“开发应用的长包名 + 技能未提供独立显示名 + 两处默认显示规则不同”共同造成。不是未安装、技能被禁用或旧缓存单独造成。之前认定只能等待 Codex 修改界面的结论不完整：标准技能显示名提供了不改变插件身份的修复方向。

## 修复方向与影响

在两个技能各自的 `agents/openai.yaml` 中分别配置 `interface.display_name`，例如 `Sill Cards` 和 `Sill Operations`。保留技能 `name`、插件内部包名、App ID、OAuth、MCP 地址和权限。通过原插件的更新流程发布，然后刷新宿主技能信息并验收选择列表。

本轮只完成定位，不更改产品源码或发布插件。配置发布后的实际界面效果尚未验证；不把客户端静态代码检查当成运行验收。无需为本问题清空全部缓存、重新连接账号或新建插件。

截图中的 `dev mode` 是应用层的开发状态，不是技能包版本号；包版本 `1.2.8` 与它不冲突。MCP URL 包含 `preview` 本身不能证明连接错误或导致名称异常。

## 来源

- [官方插件构建文档](https://developers.openai.com/plugins/build/plugins)
- [官方技能文档](https://developers.openai.com/codex/skills)
- [原 App 增补技能的历史记录](../2026-10-16-app-skill/README.md)
- 当前项目 `plugin.json`、`scripts/build-plugin.ts` 和 `skills/`；本轮云端插件元数据与本机安装缓存。

客户端资源只读提取到 `/private/tmp/sill-naming-inspection/`，临时文件不是长期依赖；没有修改应用安装文件。
