# Mac 全量对齐实施

本次按完整对齐清单集中修改。基准为 `f285b0af` 加工作区既有未提交修改，产品版本1.2.8、构建1793167089；保留前批内容，不提交、不安装、不启动应用、不部署。

## 完整清单

- [功能补齐状态](function-status.md)：逐项保留62个F/U/C编号，另列18组完整流程与13组卡片用例的验证边界。
- [动效补齐状态](animation-status.md)：独立保留41个A编号，列触发、参数、中断和原生差异。
- [原始审计](../2026-10-28-macos-parity-audit/README.md)及[前批修复](../2026-10-28-macos-navigation-alignment/README.md)保留当时结论，不回填为通过。
- 当前规则入口为[界面对账表](../../implementation/design/ui-alignment.md)和[ADR 0083](../../adr/0083-macos-parity-and-native-interaction.md)。

## 已处理范围

1. 信息流：分类位置及分页、筛选回顶、卡片高度保留、任务预览顺序、阅读关闭后的筛选集合、提醒详情去留、刷新快捷键与状态反馈。
2. 阅读：持久进度恢复、嵌套焦点和输入隔离、当前层计时、连续可见停留、顶部工具位置和时序、读完上推、目录、Markdown、缺失字段和长内容。
3. 搜索、标签与账号：候选分组和空状态、键盘与组词、悬停不滚动、清空按钮、批量标签和退格、登录校验/密码保留/等待反馈、账号首字符。
4. 设置：固定外框、云端数据行、备份必填和保存后重置、开关单次手势、按下拉伸、释放速度和失焦恢复。
5. AI与照片：引用独立布局、折叠尺寸和分阶段交接、拖动边界和窗口相对位置、引用延迟进入、单图缩略图、照片页索引及说明间距。

修正了后台回归发现的真实状态交接问题：WriteQueue在快照尚未应用时提前报告空闲，可能使紧接着的批量取消收藏或清空失败。现在空闲包含保存结果应用完成。新增焦点恢复的无窗口路径改为可选访问NSApp，后台测试不再崩溃。

## 验证

| 检查 | 结果 |
| --- | --- |
| `node tests/apple/run.ts --skip PerformanceBenchmarks` | 45项共享层、108项桌面层通过；不包含窗口自动化和性能基准。 |
| `npm run test:core` | 461项通过。初次执行被旧测试的合成计时器等待卡住；修正为显式推进119ms及1ms后，相关用例10项及全套均通过。 |
| 收尾交互回归 | `DesktopInteractionTests`、`MotionFlowTests`、`EditorTests`、`WebAlignmentTests`、`SettingsTests` 共30项通过，覆盖最后的键盘与取消处理。 |
| `npm run contracts:generate` / `npm run contracts:check` | 生成及一致性检查通过。 |
| `npm run lint:apple` / 修改的Web文件格式检查 | 通过。额外Biome检查提示既有any类型警告，没有顺带改写无关类型。 |
| `npm run design -- build` / `npm run design -- check` | 通过；79个图标、18个组件预览；23个印记、19个组件、75块画板通过检查。 |
| `npm run files:check` / `git diff --check` | 通过，62个功能编号与41个动效编号均唯一且完整。 |
| `npm run build:macos` | 发布配置编译及脚本内`codesign --verify --deep --strict`通过。产物为`dist/macos/Sill.app`，1.2.8 / 1793167089，本地ad hoc签名，未公证或发布。 |

Swift生成器保留既有的`readingEstimate`空类型提示；本次编译和测试均正常结束。

旧Web测试修正在 `tests/web/detail-motion-performance.test.ts`：保留“完成立即保存、离场后再刷新”的断言，不再等待不会自动推进的模拟计时器。没有通过删除断言或强制退出掩盖失败。

## 原生差异及未验证项

- Mac叠卡保留平移；阅读卡片保留固定文字尺寸与外框裁切；读完关闭等真实写入成功及手势结束。系统通知、窗口、文件选择器与安全输入控件使用原生能力。
- 参数相同不表示SwiftUI与Web逐帧一致。A24帧时间、U21窗口尺寸/主题、Tab与VoiceOver、输入法、密码管理器、连续反向手势、真实视频、账号及备份仍需实际运行证据。
- 按[测试授权](../../agent/test.md)，本次未运行浏览器、Mac窗口自动化、视觉检查或e2e；未操作用户云端数据、账号凭据或真实备份。用户提供的1Password空白截图不能由Sill构建成功证明已经修复。
- 没有新增内置助手、来源同步、RSS、导入或复杂正文编辑。C09/C23为正式约定外数据，未扩展兼容范围。设计未发布到线上。
