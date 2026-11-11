# 文档分类迁移


- 现行规则归入 product、design、guides；历史事件与证据归入 records；旧功能说明和旧测试报告归入 archive。
- docs/README.md 是唯一文档导航；根 README 不按日期列进展。
- LOCAL-ACCEPTANCE 只描述 2026-10-12 一次验收，整体保留。无障碍记录的提交日期为 2026-10-13，按该日期归类。
- cloud-ui-no-header 的 ZIP 全部条目与目录中展开文件逐字节一致，删除重复 ZIP。
- cloud-ui 的 ZIP 中 acceptance-report.md 为独有正文，先展开保留。其余九项与展开文件逐字节一致，再删除重复 ZIP。原文件名与哈希清单保留历史用途，链接改为现存文件。
- 文件管理检查新增有效性说明、记录目录、证据大小、禁止打包文件与新布局的依赖方向检查。未迁移代码目录和 JavaScript 暂按后续批次兼容，迁移完成后删除兼容。


检查结果：npm run files:check、node --check scripts/check-files.mjs、git diff --check 均通过。完整 npm test 由后续批次统一运行，本批不记为通过。
