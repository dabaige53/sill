# 卡片链接写入与跳转

最近检查：2026-10-31。状态：生产已复现，具体兼容层原因待定位。

## 环境与症状

用户反馈：助手写入卡片时链接“写入不进去”，卡片详情底部的“加入会议”“去原文”等跳转按钮不能打开。平台和运行入口未确认；项目插件在 Codex 中以 MCP App 形式使用，Codex 是最可能的入口。

## 定位依据

首次检查只做了源码排查和合成数据校验，没有浏览器复现，也没有读取真实账号数据。后续生产实测见本文末节，首次推测不作为最终结论。

- MCP 公布的 `sill_createContent`、`sill_updateContent`、`sill_applyOperations` 入参结构都含 `url` 和 `meeting`（`contracts/cloud.ts`）。
- 合成数据校验结果：带 HTTP(S) `url` 的创建、修改、批量写入都能通过；`meeting {name,url}` 能通过。会被拒绝的有：`url` 为 `mailto:`（字段规定只收 HTTP(S)）、`sources[].url`、`link` 等未定义字段，以及创建时缺少 `summary`（`agentCardIssues`，2026-10-30 新增）。这些拒绝都会在 MCP 错误的 `issues` 中写明路径。
- 数据库按整张卡片 JSON 保存，读取时原样返回（`supabase/migrations/20261028120000_sill_card_fields_v5.sql` 的 `content_json`）；Web `cloudCard` 和 `Store` 不删除 `url`。
- 2026-10-31 清理提交 `ff5fadfb` 只删除了未使用的 `cloudCardState`，与链接无关。
- 跳转：Web 用 `openCardLink`（`apps/web/services/agent-handoff.ts`）检查 http、https、mailto 后打开。在宿主中改由宿主打开，宿主未声明 `openLinks` 时提示“当前宿主不能打开此链接”，不退回到浏览器打开。Mac 用 `ExternalLink.open`。没有链接时，“去原文”“回复”按钮显示为禁用。“加入”只在会议开始前 15 分钟到结束之间、且有 `meeting` 时出现；设计手册和卡片技能文档写的是 10 分钟，两者不一致。

推测（未证实）：宿主未提供 `openLinks` 导致无法跳转；助手写入被拒后删掉链接重试，导致卡片没有 `url`。

## 处理情况

未修改源码。尝试读取 Codex 本机会话日志中的真实写入调用和返回错误，被本机权限拦截，未继续。

## 验证与后续

下一步需要以下任一证据：

1. 用户授权读取 Codex 本机会话日志中 Sill 写入调用的入参和返回错误。
2. 用户提供一次失败写入的报错原文，或说明跳转失败时界面上的提示文字和打开入口。
3. 用户授权用合成数据在本地浏览器复现。

拿到证据后，再确认原因属于写入格式、宿主能力还是界面显示条件，并据此修复。

## 生产实测补充（2026-10-31）

关联[生产验收记录](../2026-10-31-production-acceptance/README.md)。用户授权真实来源写入；Mac 后续被用户排除。环境为 Codex 生产 Sill MCP，已安装 skills 版本 1.2.19，协议 5.0.0。未独立确认后端部署提交。

### 写入结果：失败

最小复现：完整读取一条 Readwise 短划线，创建 note，保留来源返回的 `https://readwise.io/open/…` 原文地址作为 `body.url`。连接器返回：

```text
Parameters failed connector schema validation
body.url [pattern]: String does not match pattern '^https?:\/\/'
error_code: INVALID_ARGUMENT
reason: INVALID_PARAMETERS
```

保持内容和真实链接不变，改用已授权的批量 `card.upsert`，同样在 `body.operations[0].card.url` 被拒。随后 Google Drive 文件元数据写入在 `body.url`、`body.files[0].url` 同时触发同一 pattern 错误。两个来源均没有删除 URL 后重试。

预期：普通 HTTPS 来源链接可通过公开 schema 校验并保存。实际：3 次调用在连接器参数校验层被拒，尚未取得 Sill 成功回执。不是“目标网站打不开”的证据，也不是服务器已保存后丢字段的证据。

本地仅对当前生成 schema 的同一正则做 Node 匹配检查，真实 HTTPS 地址可匹配。未运行完整测试。已证实公开调用链与当前正则预期不一致；转义、schema 变换、缓存版本或连接器校验实现何者造成问题仍未确认，不能仅凭报错指定根因。

影响：带原文、文件地址的真实资料无法按完整结构写入，阻塞后续多类型验收。按计划停止进入并发压力阶段。

### 跳转结果：正文链接通过，结构按钮未验证

独立 Gmail 样本没有来源提供的邮件网页地址，故没有编造顶层 URL。其完整正文内的来源 URL 包装成 CommonMark 自动链接后，可点击并在浏览器打开 Cloudflare Community 公开页面。

因此，首次“当前宿主不支持 openLinks”的推测不能作为普遍解释。正文跳转通过不证明结构化 URL 写入或“加入会议”“回复”“去原文”按钮通过；本轮没有会议来源，邮件回复因无顶层 URL 禁用。没有加入会议或执行外部操作。

### 处理与下一步

本轮只记录，不修改源码、公共协议或部署。优先对照发布 schema、连接器收到的 pattern 与实际校验过程，修复后用相同完整来源重新验收单卡和批量入口；再验收结构按钮，不通过删链接规避。私人来源 URL 与正文不进入此记录。
