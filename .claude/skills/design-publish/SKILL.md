---
name: design-publish
description: Publish Sill's design material to the online Design System and design canvas, or pull online edits back into the repo. Use when the user says 发布设计, 同步设计, publish the design, or after scripts/design-init.sh stage.
---

# 发布设计与同步设计

线上两份 Artifact：

- Design System：https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb
- 设计画布：https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b

Shell 不能写 claude.ai。`scripts/design-init.sh` 准备文件和计划，Claude 用 Artifact 工具发布。仓库是来源，线上是副本；其他 AI 产品只改仓库，留下的未发布改动也由这里补发。

## 发布设计

1. 运行 `scripts/design-init.sh stage "<一句话说明>"`。它会先 build 和 check；失败就先修，不发布。
2. 读 `dist/design/plan.json`。`ds` 和 `canvas` 各有 `url`、`root`、`files`（改动）、`delete`（删除）、`index`（索引）。
3. 对每个有改动或删除的部分：
   1. 先用 `Artifact` `action: "list"`、`scope: "files"`、`url` 列出线上文件，确认要替换和删除的路径。
   2. 发布文件：`url` 为该部分的 URL，`root` 为 `plan.root`，`file_path` 取 `files` 的第一个（写成 `<root>/<路径>`），其余放进 `files`（`{"<路径>": "<路径>"}`），删除写 `{"<路径>": null}`。`file_path` 不能同时出现在 `files` 里。每次最多 255 个文件，超出就分批。`.ts` 等非网页类型写成 `{"from": "<路径>", "contentType": "text/plain"}`。
   3. 最后单独发布索引：`file_path` 为 `<root>/<index>`，不带其他文件。
   4. `tokens.css` 由 `stage` 从 `tokens.json` 编译，随文件一起发布，不用去页面保存。不写 `manifest.json`、`api/*`，它们由线上页面生成。发布后不打开或渲染检查页面。
4. 从发布结果读出两个版本号，运行 `scripts/design-init.sh record <DS 版本> <画布版本> [ADR 编号]`。

`plan.warnings` 里有图标改动时：用 `asset: true` 上传该 SVG，再把索引 `assetGroups.Icons.files` 里对应的 `blob` 换成新的 id。

## 同步设计

有人在线上页面直接改了设计时，把改动拉回仓库：

1. `action: "list"` 列出两份 Artifact 的文件，对照 `design-system/published.json` 找出线上新增或变化的文件（必要时 `action: "read"` 读取比较）。
2. 映射：Design System 的 `project/<路径>` → `design-system/<路径>`；画布 `project/<画板>` → 「现行」页写到 `design-system/boards/`，「历史」页写到 `design-system/history/`；`project/canvas.json` 整份写到 `design-system/boards/canvas.json`。
3. 运行 `scripts/design-init.sh build` 和 `check`，再按需要发布一次，让两边一致。
