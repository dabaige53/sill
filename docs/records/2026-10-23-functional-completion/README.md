# 真实功能补齐与非界面验证

本次在同一工作树汇总备份恢复、真实媒体与图片、外链和设备提醒。范围及取消事项见[完成清单](readiness.md)。没有部署、生产迁移、真实账号写入、浏览器自动化或系统通知投递。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 整合 main 的排版设置改动并拆分文件后，完整流程通过，共 536 项 |
| `npm run test:contracts` | 最终 69 项通过 |
| `npm run test:core` | 最终 338 项通过 |
| `npm run test:server` | 最终 126 项通过，包含备份凭据拒绝与未知结果区分 |
| `npm run test:performance-report` | 3 项通过 |
| `node tests/apple/run.ts` | 最终 SillKit 45 项、桌面 91 项通过，未启动应用窗口 |
| `npm run build:release` | 云端网页、MCP 页面及压缩 Worker 构建通过 |
| `npm run build:macos` | release 编译、应用打包及 ad-hoc 签名严格检查通过 |
| `npm run typecheck` | 通过 |
| Web／Apple lint | 无错误；Web 既有宽松规则仍输出警告，Swift 生成器仍提示 nullable schema 限制 |
| `scripts/design-init.sh build`、`check` | 通过；未发布线上设计副本 |
| `npm run files:check`、`git diff --check` | 通过 |

Mac 打包首次在受限沙盒中于 `iconutil` 报 Invalid Iconset。各 PNG 尺寸正确；同一命令在沙盒外成功，随后原构建脚本在沙盒外完整通过。没有修改图标、安装应用或申请分发证书。

提醒检查使用替代系统接口，覆盖未确认账号时保留通知、明确退出清理、旧提醒不占待发容量、调度失败重试、完成后立即取消及写入失败回滚。备份检查使用合成 WebDAV／R2 和隔离数据库，覆盖凭据隔离、版本冲突、未知回执、摘要检查与原子恢复。以上结果不替代真实账号、供应商连接、媒体播放、宿主或窗口通知验收。

上线所需迁移与配置见[操作指南](../../implementation/operations/backup-and-reminders.md)。当前构建不代表已公证或已发布。
