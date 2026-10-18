# 预览模板与语义文案键（C3）

日期：2026-10-18。

C3 已实施，提交 [PR #52](https://github.com/dabaige53/sill/pull/52)。`Panels.preview()` 保留原入口，实际分发移到 `previews.ts`，入口从 121 行减为 23 行。110 个 panels 哈希键全部换为语义键，826 个文案值保持不变。Mac 未改。

## 拆分与边界

```text
interactions/panels.ts    保留 29 个属性和原有模块导出
interactions/previews.ts
  preview                共用 sheet、tools、own，选择对应渲染函数
  mailPreview            邮件
  eventPreview           活动
  podcastPreview         播客
  mediaPreview           其他媒体
  filePreview            文件
  taskReminderPreview    任务与提醒
  contentPreview         资讯、笔记等共用正文的类型
```

`sheet` 只在公共入口构建。工具栏继续使用 `Panels.tools()` 与 `Panels.own()`。阅读页、照片、标签备注、搜索、设置和其他弹层仍走原入口。`relativeTime` 移到预览模块，并继续从 `panels.ts` 导出；调用方不需要改接口。`window.__app` 的 103 个方法签名保持不变。

## 逐提交检查

| 提交 | 内容 | 提交后的 Node 三组 | 提交后的相关浏览器 |
| --- | --- | --- | --- |
| `30157cc` | 先补 14 项保护测试 | 36 / 192 / 92 | 抽屉 11/11 |
| `8e8ed1d` | 原样移动预览与辅助函数 | 36 / 192 / 92 | 抽屉 11/11 |
| `7559b54` | 独立拆成 7 个渲染函数 | 36 / 192 / 92 | 基础 23/23、抽屉 11/11 |
| `d6add9f` | 一次替换 110 个键并重建组件 JS | 36 / 192 / 92 | 无障碍 13/13、欢迎页 2/2、云端宿主 1/1、云端工作台 1/1 |

Node 数字依次为共享约定、Web、服务端；失败与跳过均为 0。相关浏览器专项去重后为 51 项。云端检查前重建云端页面；最终证据文档提交后的复跑与 CI 结果以 PR 为准。

## HTML 与文案核对

比较脚本只在本机运行，不提交。固定时钟，使用仓库内合成卡片，生成 1122 份 HTML，覆盖 11 类卡片、播客、空字段、阅读与收藏状态、隐藏动作、普通窗口、standalone 和 iOS standalone，以及阅读页、照片、搜索、设置、备注、归档、AI、欢迎页和格式化函数。

原样移动、按类型拆分、键名替换后，分别与同一份基准逐字比较。三次均为 1122/1122 一致，差异 0，完整集合的 SHA-256 相同。没有折叠空白或忽略属性。这是生成 HTML 的比较，不是截图像素比较；本次样式未改，真实布局另由浏览器检查覆盖。

[comparison.json](comparison.json) 保存比较摘要、公有入口核对、文案与组件包核对。还原键名后，重建的组件 JS 与原文件逐字一致；样式、图标、原生代码改动均为 0。

文案总数仍为 826；全部哈希键从 601 减为 491，panels 哈希键从 110 减为 0。没有保留兼容别名。键名对应见 [copy-key-renames.json](copy-key-renames.json)，旧名称只记录后缀，避免继续出现已移除的完整键。

语义键按用途分组。例如 `web.preview.cardTools`、`web.settings.theme.label`、`web.capture.title`。跨照片、搜索和批量提示使用的“ 张”保留为 `web.common.cardCountSuffix`。没有活动引用的旧文案也一对一保留，未恢复相关界面。Mac、iOS、脚本和测试均纳入引用搜索；原生代码没有这些键的引用，Apple 文案保持不变。

## 环境、检查与待同步项

欢迎页首次检查在启动浏览器前失败：测试默认的 `/usr/bin/chromium` 在本机不存在。切到基础提交 `2589bd9` 后，同一命令返回相同错误。指定本机已安装的 Chromium 后，桌面与手机两项均通过；没有改断言，没有安装浏览器。

`npm run files:check`、`npm run lint:web` 通过。单独的 Web lint 为 0 错误、903 警告、30 条提示；图标仍为 69 个。命令摘要见 [verification.txt](verification.txt)。真机未检查，生产未部署；C6 的本机会话过期偶发超时记录继续保留，本次相关检查通过。

本次没有改设计规则或可见文案。生成的组件 JS 已在仓库重建，尚未由本次工作发布到线上 Design System；线上文件未重新核对。U1 的组件 CSS 和 37 号画板截图同步也仍待完成。三项都须写入 PR 的 Merge Danger，不能把代码检查通过说成线上已同步。

#45–#47 尚未合并。PR base 为 `claude/web-pwa-ui-handoff`，保留 C1、U1、C6、C2 的已验证依赖。
