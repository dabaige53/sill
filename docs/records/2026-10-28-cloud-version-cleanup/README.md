# Cloudflare 旧部署与版本清理

用户确认只删除 Cloudflare 中的旧部署版本。针对 `sill-web-preview`，删除了 35 条旧部署记录和 34 个旧 Worker 版本。

清理后重新读取确认只剩部署 `ea3d3eb7-d809-427d-a613-b4b74c043fda` 和 Worker 版本 `406c8161-1066-4691-9074-01027e00dbe7`，当前版本承接 100% 流量。健康接口返回 200。

Cloudflare 已删除的版本不再可用于直接回退。Git 历史和卡片数据不在本次清理范围。发布与数据库迁移结果见 [Web 云端发布](../2026-10-28-web-cloud-release/README.md)。
