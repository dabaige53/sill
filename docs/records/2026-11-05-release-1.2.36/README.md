# 1.2.36 发布

## 范围

发布云端 Web/PWA 与 MCP 页面，附内部 Mac 包；插件包保持 1.2.21。云端代码与 1.2.34 相同，只有版本号变化。产品改动只在 Mac 端：

- 长文正文改为懒排版，打开时只排版当前可见段落。
- 滚动详情页时按可见区域更新：删掉了未使用的 `ReaderContent.mediaOffset`。
- 全屏目录的标题位置在解析正文时记录，目录高亮按已排版段落判断所在章节。

诊断见 [Mac 打开长文卡片卡顿](../2026-11-05-macos-long-article-open/README.md)。

## 数据库

无迁移。`supabase/` 自 1.2.34 起没有改动；`SILL_DATABASE_VERIFIED_COMMIT` 已设为本次 tag 对应的提交。

## 1.2.35 未发布

PR [#118](https://github.com/dabaige53/sill/pull/118) 合并后，打了 tag `v1.2.35`（提交 `0ba9af2f`）。正式流程 `41975795539` 失败，没有部署，也没有生成 Release：

- `apple / macos`：`MarkdownBody.swift:34:38: constant 'self.headings' captured by a closure before being initialized`。原因是 #118 本地只做了语法检查，没有编译。
- `web / browser (motion)`：用例 `Real touchCancel keeps the drawer open without writing cancel restores the drawer position` 失败。同一提交在 PR #118 的检查中通过，PR #119 和本次正式流程也都通过，判断为偶发失败，未处理。

修复见 PR [#119](https://github.com/dabaige53/sill/pull/119)。按 1.2.31 的先例保留失败的 tag，版本升到 1.2.36。

## 发布结果

PR [#119](https://github.com/dabaige53/sill/pull/119) 合并后打 tag `v1.2.36`，提交 `15ec991c`。正式流程 `41980326800` 的全部检查、云端包、Mac 包和发布均成功。

| 项 | 值 |
| --- | --- |
| 旧部署（回退依据） | `97c3578a-9fd7-425c-9110-30697f898242`，版本 `48ba2063-e5f1-4433-86d0-9aa67d7d48d5`（1.2.34） |
| 新部署 | `c51872cf-bdd8-41d9-9d69-56db780f6bad`，版本 `a99dd851-befe-436b-b3c1-b52ad26e22dc`，100% 流量，回执 `verified` |
| GitHub Release | [v1.2.36](https://github.com/dabaige53/sill/releases/tag/v1.2.36)，prerelease，附件 `Sill-1.2.36-macOS-arm64-internal.dmg` |

## 发布后复查

| 检查 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 200 `ready` |
| 未登录 `GET /api/v1/contents` | 401 |

未安装新 Mac 包，未做打开长文、滚动、目录高亮与跳转的实机验收。

状态：已部署，未验收。
