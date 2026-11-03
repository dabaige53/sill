# 备份设计画板诊断

日期：2026-11-03。状态：静态检查已验证。

## 问题与定位

新增的 `design-system/boards/backup-redesign/project/` 包含桌面、添加位置和手机三个 Design Component 画板及 `canvas.json`。交付诊断对三个 HTML 文件报告共 135 条错误，JSON 已通过。报错包括 `Inline style is not allowed`、`<helmet> is not a valid element name`、属性大小写、无分组语义的 `aria-label` 与密码自动填充设置。

通用 HTML 检查不识别画布格式中的 `helmet`，且其内联样式和 camelCase 事件要求与画布格式不同。设计技能明确要求保留内联样式供属性面板编辑，并用 `onClick` 绑定事件。与此前[搜索画板诊断](../2026-10-29-interface-hardening/README.md#web-搜索画板诊断2026-10-29)属于相同检查规则冲突；本次画板的内联样式不能提取，否则影响直接编辑。

## 处理

仅对三个画板的 `no-inline-style` 添加带原因的文件级例外；对各 `helmet` 的元素名称和两个事件按钮的属性大小写添加单元素例外。未修改全局校验配置。连接方式容器补充 `role="group"`，`autocomplete` 改为小写，密码字段使用 `new-password`，避免自动填入已有登录密码。

## 验证与范围

按诊断报告的 `recheck.command` 调用 `diagnostics_backend.py --check`，三份 HTML 和 `canvas.json` 全部返回 `status: passed`、`diagnostics: []`。画布工具 `check` 返回 `problems: 0`。未执行浏览器或视觉验证；未改产品实现、连接真实存储或部署。
