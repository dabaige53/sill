# Sill 交互规范

更新：2026-10-23。本文按场景指向现行交互规则，保留原章节入口。布局、行为与参数统一维护在仓库 [设计手册](../../design-system/README.md)，各端实现和实测状态见 [界面对账表](ui-alignment.md)。

## 执行语义（目标，尚未落地）

先遵守 [Agent 优先与界面边界](agent-mcp.md#agent-优先与界面边界)：已有卡片正文与结构字段由 AI 修改，用户保留新增卡片、记一笔和既有轻操作。当前阅读、收藏、任务等动作更新 Sill 状态，不证明外部执行成功；Webhook 与可靠执行器仍待实现，范围见 [Agent 与 MCP](agent-mcp.md)。

## 默认状态

导航、设置与 AI 占位状态见 [两端对照](../../design-system/handbook/interaction.md#两端对照)、[手机页面](../../design-system/handbook/interaction.md#移动650px-及以下)和[桌面顶栏与 AI 框](../../design-system/handbook/web-interaction.md#桌面顶栏与-ai-框)。

## 卡片

卡面与详情采用同一组内容与状态，已有轻操作继续保留。多选、拖入 AI 区域和上下文菜单见 [手机多选](../../design-system/handbook/interaction.md#底部导航与反馈)、[桌面多选与拖入](../../design-system/handbook/web-interaction.md#桌面顶栏与-ai-框)。媒体、关联详情与 PR 操作见 [卡片详情内的导航与媒体](../../design-system/handbook/web-interaction.md#卡片详情内的导航与媒体)。

## 信息密度

各类卡片的字号、摘要行数、留白和截断见 [字体](../../design-system/handbook/foundation.md#字体)、[文字长度](../../design-system/handbook/foundation.md#文字长度)和[手机主页](../../design-system/handbook/interaction.md#手机主页)。详情文字使用 Markdown body，字段边界见 [跨端数据约定](../../contracts/README.md)。

## 叠卡（牌堆）

展开、切换与边界反馈见 [预览与叠放](../../design-system/handbook/interaction.md#预览与叠放)和[动效共用规则](../../design-system/handbook/motion.md#共用规则)。

## 预览

### 桌面

打开、收回、详情放大和关联层返回见 [桌面卡片连续过渡](../../design-system/handbook/motion.md#web-与-mac-桌面卡片连续过渡)与[桌面阅读与操作细节](../../design-system/handbook/web-interaction.md#桌面阅读与操作细节)。

### 手机（宽度 ≤650px）

抽屉高度、滚动扩展、安全区与关闭手势见 [预览与叠放](../../design-system/handbook/interaction.md#预览与叠放)和[动效共用规则](../../design-system/handbook/motion.md#共用规则)。

### 全屏阅读

资讯阅读排版见 [资讯阅读](../../design-system/handbook/web-interaction.md#资讯阅读)；媒体放大与返回关系见 [卡片详情内的导航与媒体](../../design-system/handbook/web-interaction.md#卡片详情内的导航与媒体)。

## 读完与关闭

阅读完成与短文计时见 [两端共用规则](../../design-system/handbook/interaction.md#两端共用)。读完上推、下拉刷新、关闭提交与取消见 [提交、取消与导航](../../design-system/handbook/motion.md#提交取消与导航)和[桌面阅读与刷新衔接](../../design-system/handbook/motion.md#桌面阅读与刷新衔接)。媒体以实际播放结束为准，不将拖动到末尾当作完成。

## 工具条收起

隐藏、恢复、键盘焦点和底部轨道关系见 [动效共用规则](../../design-system/handbook/motion.md#共用规则)、[其他组件](../../design-system/handbook/motion.md#其他组件)与[底部导航与反馈](../../design-system/handbook/interaction.md#底部导航与反馈)。

## 搜索与键盘

手机搜索见 [搜索与键盘](../../design-system/handbook/interaction.md#搜索与键盘)；桌面搜索见 [桌面顶栏与 AI 框](../../design-system/handbook/web-interaction.md#桌面顶栏与-ai-框)，快捷键见 [网页键盘](../../design-system/handbook/web-interaction.md#网页键盘)。搜索与主页分别保留查询、选择和滚动位置，卡片状态共用。

## 惯性和手势

输入层归属、触控板阶段、惯性隔离和取消见 [桌面输入与动画协作](../../design-system/handbook/motion.md#桌面输入与动画协作)与[提交、取消与导航](../../design-system/handbook/motion.md#提交取消与导航)。

## 动效基线

动效规则统一维护在 [动效](../../design-system/handbook/motion.md)，数值来源为 [设计变量](../../design-system/tokens/)。已有系统偏好分支的保留范围见 [设计约束](../../DESIGN.md#web-与-macos-一致)。新增或修改动效时按该入口更新规则、变量与实现，本文不另存参数表。

## 提醒

提醒、任务完成、延后、忽略和归档见 [量大与时间](../../design-system/handbook/interaction.md#量大与时间)与[网页交互细节](../../design-system/handbook/web-interaction.md#网页交互细节)。这些状态只表达 Sill 内的操作，不代表来源中的任务或日程已改变。

## 验证

检查选择与授权统一见 [测试与验证](../guides/testing.md)，命令见 [测试目录](../../tests/README.md)。改任一端界面时按 [跨端对齐检查清单](../guides/cross-platform-checklist.md)选择项目，并在 [界面对账表](ui-alignment.md)记录实现差异与真实验证结果。
