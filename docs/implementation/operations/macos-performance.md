# Mac 性能追踪与自动化测试

更新：2026-10-27。

状态：本地诊断与测试工作流。默认关闭，不上传；自动化不操作真实工作区。

## 人工追踪

1. 使用本地工作区启动已构建的 Mac App。
2. 菜单「性能追踪」→「开始性能追踪」，正常操作，遇到问题点「标记此刻」。
3. 「停止并导出…」在后台完成写盘并显示目录。`report.html` 可直接打开；`trace.jsonl`、`summary.json` 和 `session.json` 用于详细分析。
4. 日志位于 `~/Library/Logs/Sill/Performance/<会话编号>/`。不包含正文、搜索词和卡片 ID。

需要官方调用栈和帧分析时，在 Instruments 中选择 Sill 进程及 Time Profiler、SwiftUI 或 Animation Hitches。也可用命令录制；PID 必须明确指定，命令检查它指向 Sill：

```sh
npm run perf:macos -- manual --pid 12345 --seconds 60 --template 'Time Profiler'
```

把 12345 替换为当前 Sill PID。录制期间同步开启 App 内追踪并标记问题。两个采集器不会自动替代对方：App 日志给出操作阶段，Instruments 给出系统调用栈与时间线。官方录制可能要求 macOS Developer Tools 授权，由用户在系统界面完成；不修改全局安全设置。

## 后台自动化（默认）

直接运行 `npm run perf:macos`，等同于 `npm run perf:macos -- benchmark`。使用 Xcode 工具链的 XCTest，在测试进程内调用产品的数据与状态逻辑；不打开 App 窗口，不使用鼠标键盘，不需要 UI 自动化授权。此命令执行一次并退出，不是常驻服务或定时任务。

后台测试仍会占用 CPU 和内存。日常工作可以继续；要比较精确基准时，应保持相近的系统负载，避免同时编译或运行其他基准。

当前后台基准共八项，直接调用产品代码：

| 场景 | 数据量 | 每次测量做什么 |
| --- | --- | --- |
| 搜索 | 300／3000 张，各一项 | 四个搜索条件 |
| 分栏切换 | 300／3000 张，各一项 | 未读、收藏、稍后读、待办、全部，共五次切换；包含筛选和列表重建 |
| 卡片开关指令 | 300／3000 张，各一项 | 50 轮：打开、切换全屏、打开关联卡片、返回上层、发起关闭 |
| 滚动处理与分页 | 3000 张 | 1000 次普通位置更新、10 次接近底部更新触发加载，再返回顶部 |
| 设置开关指令 | 无卡片数据 | 100 轮打开与关闭，检查关闭回调 |

每项预热一次，再由 XCTest 测量 10 次。准备数据和滚动测试的初始状态复位不计入测量。卡片测试测量指令与同步状态变化，不等待真实退场动画、正文布局和后续写盘；无窗口时关闭完成回调可能立即执行。滚动测试测量位置处理、工具栏状态与分页计算，不含真实滚轮命中、帧呈现和延时恢复。卡片堆左右滑动的手势及动画还没有无窗口性能基准。快照与队列读写也尚未建成独立性能基准。

```sh
npm run perf:macos
```

## 打开、关闭、滑动与切换的人工补测

后台基准可重复检查状态处理与计算成本。实际显示需要在真实窗口采集；自动测试结果不能替代这一层。

| 操作 | 人工追踪步骤 | 重点观察 |
| --- | --- | --- |
| 卡片打开、关闭 | 打开同一张资讯，进入全屏，返回并关闭；重复 10 轮 | SwiftUI 布局与更新、主线程调用栈、动画卡顿；重复后内存是否持续增长 |
| 上下滚动 | 匀速下滑、快速下滑、接近底部加载、向上返回；每段约 10 秒 | 分页计算、正文和卡片布局、工具栏隐藏恢复、动画卡顿 |
| 卡片堆左右切换 | 来回切换、手势中途取消、连续快速切换 | 手势命中、错误切换、过渡被打断时的恢复和动画卡顿 |
| 分栏与设置切换 | 全部、未读、收藏、稍后读之间切换；设置开关及分组切换 | 列表重建、滚动位置恢复、面板大小变化与卡顿 |

开启 App 追踪后，分别录制 Time Profiler 与 Animation Hitches；每组操作开始前点「标记此刻」，对应人工步骤顺序。App 的主线程延迟不是 FPS；左右手势、动画完成和触达区域尚无独立自动判定，需结合 Instruments 时间线与实际观察。人工补测不要求 XCUITest 接管桌面。

## 界面自动化（专项，单独授权）

这层用于实际点击、窗口、布局与动画验证，不是后台测试。先构建 `npm run build:macos`，仅在明确授权且可独占桌面时运行：

```sh
# 官方 XCTest，Release 数据层基准，不启动 GUI
npm run perf:macos -- benchmark

# 官方 XCUITest：真实点击菜单、搜索、设置和资讯；附加 Instruments
npm run perf:macos -- ui --cards 300 --iterations 5 --seconds 60

# SwiftUI 或动画卡顿专项；按相同场景分别录制
npm run perf:macos -- ui --cards 300 --iterations 5 --template 'SwiftUI'
npm run perf:macos -- ui --cards 300 --iterations 5 --template 'Animation Hitches'
```

`benchmark` 运行上述八项无窗口基准，XCTest 记录时间、CPU、内存，`result.json` 保存各次测量和原始单位，`xctest.log` 保留官方输出。各场景每轮工作量见上表，不能把整轮时间当作单次点击耗时。内存变化值可以为负，不等于驻留内存峰值。CPU 与内存来自 XCTest 测试进程，包含框架、合成数据及此前场景分配，不能直接当作 App 日常占用。它不证明 UI 点击和绘制通过。

`ui` 在全新的 `/private/tmp` 目录创建确定性合成数据，复制 App 并使用独立 Bundle ID、重新本地签名，再调用 `xcodebuild test`。用户正在运行的 App 与数据不被替换。XCTest 序列运行场景，后台 Instruments 仅附加到测试 App 的 PID，不录制整个系统。脚本在沙盒外接收官方 Darwin 通知，再由文件信号告知测试录制就绪，再开始操作；45 秒内未收到就绪信号则失败。配置通过 xcodebuild 支持的 `TEST_RUNNER_` 环境变量传给测试进程。

测试场景：菜单选择与关闭、搜索输入与清除、设置分组切换、资讯打开与返回。指标包含 XCTest 时钟、目标 App CPU、内存、存储；macOS 26 起增加 XCTHitchMetric。测试耗时含自动化等待，不等于产品单次点击到像素呈现时间。

支持 `--cards 30|300|3000|10000`、`--iterations 1..30`、`--seconds 5..600` 和 `--output <新目录>`；不覆盖已有目录。自动化单段录制默认最多 180 秒，人工录制默认 60 秒。达到上限提前结束的自动化录制标记为不完整，不计通过。首次验证用 30 张、2 次迭代；正式比较使用固定数据、固定窗口与设备、Release 构建。不要同时运行编译或其他基准。

## 产物与结果

| 文件 | 含义 |
| --- | --- |
| `tests.xcresult` | Xcode 原生测试结果、性能数据与失败证据；可在 Xcode 打开 |
| `xctest-summary.json` | xcresulttool 导出的通过、失败数量 |
| `<会话>.trace` | Instruments 原生录制，可直接用 Instruments 打开 |
| `<会话>.trace.toc.xml` | 官方导出的录制目录，不是瓶颈结论 |
| `instruments.json` | 每段官方录制的退出状态与路径 |
| `sessions/<会话>/` | 与测试 App 对应的人工同格式日志、报告 |
| `run.json` | 数据集、迭代次数、工具链与仓库状态 |
| `xcodebuild.log`、`*.instruments.log` | 原始工具诊断 |

UI 测试被系统权限拒绝、Instruments 失败或没有捕获到会话时，命令返回非零，不声称通过。失败的 `.xcresult` 和诊断仍保留。Instruments 从发现 App 会话后开始附加，不覆盖最早的进程启动阶段；启动专项另用 App Launch 模板。

## 分析与比较

```sh
npm run perf:macos -- report /绝对路径/会话目录
npm run perf:macos -- report /绝对路径/新会话 --baseline /绝对路径/基线会话
```

生成离线 `report.html` 和 `analysis.json`，包含 CPU 与内存时间线、事件、标记、失败及未完成阶段。兼容第一版 trace.jsonl。CPU 平均值按采样间隔加权；缺失值为不可用，不是零。少于 20 个阶段样本不计算 P95。

基线比较要求工具链、系统、处理器数量、内存、采集模式、场景、数据集、卡片数、迭代次数和模板匹配。失败、未完成或丢弃事件的会话不自动判定退化。超过基线 P95 20% 且增加超过 5ms 标记为候选退化，需重复确认；当前不是发布阻断门槛。单次人工随意操作不自动与另一次判优劣。

## 采集口径与边界

- CPU／驻留内存每秒由独立队列采样，主线程堵塞时资源采样继续。CPU 单核心 100%，多核心可超过 100%。
- 每 100ms 最多发送一个主线程应答探测；超过 50ms 记录调度延迟。它不是 FPS，短于采样间隔的卡顿可能漏掉。睡眠、唤醒、前后台状态和采样空缺单独记录。
- 事件区间同时写 JSON 和 Apple OSSignposter，固定 subsystem `app.sill`、category `PointsOfInterest`、interval `SillOperation`。区间详情标注操作名。
- 记录搜索、分栏、列表重建、打开卡片和设置、队列等待、后端读写、快照差异及状态应用。菜单打开、选中和关闭也有事件；尚不记录完整命中区域或系统输入到像素呈现时间。
- 写入区分后台阅读记录、用户卡片状态、设置、内容修改。日志不包含字段值；后台阅读记录暂未细分已查看与阅读时长。
- UI 使用异步导出；正常退出同步完成最终写盘。突然终止时末尾可能不完整，报告保留缺失提示。
- 写入队列最多 2048 条待处理事件，单会话正文日志上限 100MiB；丢弃事件会计数。磁盘错误在导出时报告。文件保留至手动删除。
- 录制会增加开销。比较必须使用相同采集模式；深度 Instruments 录制与未录制时的结果不能直接混用。

相关实现与操作命令见 [Apple 检查](../../../tests/apple/README.md)、[本地操作](local-operations.md)。

## 官方参考

- [XCTest 手动停止计时](https://developer.apple.com/documentation/xctest/xctmeasureoptions/invocationoptions-swift.struct/manuallystop)：与手动开始一起排除每轮准备步骤。
- [XCTest 性能指标](https://developer.apple.com/documentation/xctest/performance-tests)：时间、CPU、内存、存储、启动与卡顿指标。
- [XCTHitchMetric](https://developer.apple.com/documentation/xctest/xcthitchmetric)：测量目标应用未及时准备下一帧的卡顿。
- CLI 参数以本机 `man xcodebuild`、`xcrun xctrace record` 和 `xcrun xctrace export` 输出为准；不同 Xcode 版本可用模板不同。

## 本机 UI 测试准备与排查

1. 保存手头工作，关闭 Xcode 文件选择窗口和 Codex Computer Use 浮层；运行期间暂停鼠标键盘操作。原生 XCUITest 会实际操作桌面，不能与另一套桌面控制同时运行。
2. `xcodebuild -checkFirstLaunchStatus` 核对 Xcode 初始化；出现系统认证错误时，先打开 Xcode 并完成系统界面的认证，再复跑最小场景。不要把密码输入到日志或聊天。
3. `DevToolsSecurity -status` 只读检查开发工具策略；disabled 本身不能证明 UI 测试不可用，实际可用性以本次获准检查为准。不自动修改全局认证策略。
4. 测试日志若出现 `Invoking UI interruption monitors`，先核对是否有其他窗口遮挡；不要把等待窗口的时间当成 Sill 处理耗时。
5. 失败证据留在 `.xcresult`，用 `xcrun xcresulttool export attachments --path <结果> --output-path <新目录>` 导出；这些附件可能含桌面截图与窗口标题，分享前检查内容。App 自身日志仍只记录固定事件与数字。
