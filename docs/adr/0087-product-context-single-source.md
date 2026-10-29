# 产品需求统一为 docs 内的 PRODUCT.md

2026-10-29，已采纳。产品正文位置后由 [ADR 0088](0088-documentation-layers.md) 调整；本记录保留当时决定。

用户要求已有文档直接适配 skill 所需文件名，并保留在 docs 内。将 docs/product/requirements.md 改名为 docs/product/PRODUCT.md，在同一正文补充已确认的用户定位和 Impeccable 上下文标记。根目录不保留副本、链接入口或符号链接。更新现行文档和历史记录中的导航链接，历史原文路径保留。

今后此类改名、移动、合并或适配修改前，先说明文件与影响并请求用户确认。skill 或插件的默认目录不覆盖项目文件规范；无法自动发现时直接读取实际文件。

.impeccable/ 保存工具配置；已确认的制作方式存入 .impeccable/config.json，运行时文件不提交。现有 DESIGN.md 与设计手册保持原职责。
