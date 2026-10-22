# 13 种卡片 UI check 稿

2026-10-22 · 结论：尚未对齐，不能验收为完成。

范围：Web 桌面、手机 Web、macOS。iOS 原生明确不开发，不列为待办。Web 已逐张查看 13 种详情；桌面视口 1440×900，手机视口 390×844。手机截图来自浏览器尺寸模拟，不代表真机验收。macOS 仅核对源码，没有真实窗口截图。

[打开逐张对照页](review.html)。每种卡片都有桌面参考、桌面实图、手机参考、手机实图。图片点击可看原尺寸。不同样例的文字不作像素一致判断；结构、层级、控件、尺寸与状态才是验收对象。

依据：[桌面卡片与详情](../../../design-system/boards/CardTypeDetails.dc.html)、[手机卡片与详情](../../../design-system/boards/CardTypeMobile.dc.html)、[全屏阅读](../../../design-system/boards/CardTypeReading.dc.html)。参考稿中的导语不授权把卡面 summary 再重复插入详情正文。

## 已修复：底部空白 G01

触发链路：内容更新为保持卡片位置而留下 min-height → 卡片宽度改变 → 原高度没有失效 → 内容变矮后仍由旧高度撑开。修复在列宽变化时清除旧 min-height；同宽更新保留原行为。

本次复现中，手机卡片高度约 228.8px，内容 174px，多出约 53.8px。修复后卡片 176px、内容 174px，底部边界差约 1px。该结果对应已复现的宽度变化场景，不表示所有留白都已消除。手机“另有 1 项”仍被样式隐藏，另记待办差异。

- [修复前](images/mobile-feed.png) / [修复后](images/mobile-feed-after.png)。
- [布局修复](../../../apps/web/interactions/layout.ts) / [回归检查](../../../tests/web/layout.test.ts)。
- 回归先失败：旧 min-height 仍为 229px；修复后 7 项布局检查通过。Web 构建、类型检查通过。

## 逐项清单

“已看到”只覆盖所列可见结构，不代表整类通过。下列未完成项保留未勾选。通用差异 G02：普通手机详情标题实测 22px，参考稿 24px；需统一核对字级。

### 01 资讯

- [x] 已看到：封面在预览顶部；来源、标题、标签、正文顺序已显示。
- [ ] 对齐差异：全屏封面实测高 776px，参考稿 340px，正文被推到首屏以下。手机封面 220px，参考稿 200px。
- [ ] 补验状态：短文、长文的阅读进度与返回位置未逐状态复验。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-article.png) · [桌面实图](images/desktop-article.png) · [手机参考](images/reference-mobile-article.png) · [手机实图](images/mobile-article.png)

### 02 笔记

- [x] 已看到：长笔记正文、列表和引用已显示。
- [ ] 对齐差异：手机标题沿用通用 22px，与参考稿 24px 不一致。
- [ ] 补验状态：短笔记窄预览、个人备注非空状态未截图核验。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-note.png) · [桌面实图](images/desktop-note.png) · [手机参考](images/reference-mobile-note.png) · [手机实图](images/mobile-note.png)

### 03 汇总

- [x] 已看到：日期范围、卡片数量、Markdown 正文已显示。
- [ ] 对齐差异：当前正文仍写“原有卡片保持不变”，与已清理旧演示卡片的事实不一致；这是样例内容问题。
- [ ] 补验状态：正文底部关联卡片尚未滚动截图核验；不能仅凭源码判定通过。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-digest.png) · [桌面实图](images/desktop-digest.png) · [手机参考](images/reference-mobile-digest.png) · [手机实图](images/mobile-digest.png)

### 04 建议

- [x] 已看到：原因、依据、关联入口已显示；窄预览无放大入口。
- [ ] 对齐差异：关联区标题为“关联内容”，参考稿为“相关卡片”。
- [ ] 补验状态：关联入口返回位置未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-suggestion.png) · [桌面实图](images/desktop-suggestion.png) · [手机参考](images/reference-mobile-suggestion.png) · [手机实图](images/mobile-suggestion.png)

### 05 邮件

- [x] 已看到：发件人、发送时间、收件人、正文、多个附件与回复入口已显示。
- [ ] 对齐差异：附件格式和大小放在文件名下方；参考稿在同一行右侧。
- [ ] 补验状态：无回复地址时入口保留禁用；真实跳转未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-mail.png) · [桌面实图](images/desktop-mail.png) · [手机参考](images/reference-mobile-mail.png) · [手机实图](images/mobile-mail.png)

### 06 日程

- [x] 已看到：起止时间、标题、地点、参与者和议程已显示。
- [ ] 对齐差异：手机结束时间和时区折到下一行，参考稿起止时间同一行。
- [ ] 补验状态：加入会议的时间条件与实际链接未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-event.png) · [桌面实图](images/desktop-event.png) · [手机参考](images/reference-mobile-event.png) · [手机实图](images/mobile-event.png)

### 07 待办

- [x] 已看到：详情完整清单、截止信息、参与者、优先级、正文已显示。
- [ ] 对齐差异：截止行缺“截止”和强调色；优先级使用靶心而非旗标；勾选圈颜色与稿不同；手机卡面隐藏“另有 1 项”。
- [ ] 补验状态：底部空白的宽度变化场景已修复；同宽内容变化仍需单独验收。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-task.png) · [桌面实图](images/desktop-task.png) · [手机参考](images/reference-mobile-task.png) · [手机实图](images/mobile-task.png)

### 08 提醒

- [x] 已看到：窄预览、标题前完成圆圈、正文与操作条已显示。
- [ ] 对齐差异：项目放在正文前；参考稿放在正文后，带“项目 · ”前缀。
- [ ] 补验状态：完成与撤销后的卡面过渡未逐状态复验。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-reminder.png) · [桌面实图](images/desktop-reminder.png) · [手机参考](images/reference-mobile-reminder.png) · [手机实图](images/mobile-reminder.png)

### 09 文件

- [x] 已看到：正文、多个文件、格式、大小和修改时间已显示。
- [ ] 对齐差异：详情来源使用出版信息，卡面使用云盘和文件夹，表达不一致；卡面文件条目缺参考稿的浅灰圆角底。
- [ ] 补验状态：文件无可用链接，实际打开与下载未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-file.png) · [桌面实图](images/desktop-file.png) · [手机参考](images/reference-mobile-file.png) · [手机实图](images/mobile-file.png)

### 10 视频

- [x] 已看到：卡面底部进度轨道已出现；预览保留来源、标题、官方播放器、正文；手机官方播放器已显示。
- [ ] 对齐差异：当前截图只能确认静态结构；全屏播放器截图仍处加载占位，不能认定全屏已对齐。
- [ ] 补验状态：播放、拖动进度、关闭暂停、恢复位置、实际 ended 标已读未进行完整真实播放验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-video.png) · [桌面实图](images/desktop-video.png) · [手机参考](images/reference-mobile-video.png) · [手机实图](images/mobile-video.png)

### 11 播客

- [x] 已看到：封面、标题、进度、剩余时长、倍速、播放区、三个内容页签已显示；无音源时没有删除控件。
- [ ] 对齐差异：全屏左侧缺封面同色背景；滚到底未出现收起播放条；前后跳转为尖括号，缺 15/30 圆箭头；倍速 1× 而非 1.0×；章节条缺列表图标与章节序号；卡面播放键不是黑底白图标。
- [ ] 补验状态：演示卡没有音源，真实播放、关闭暂停和结束标已读未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-podcast.png) · [桌面实图](images/desktop-podcast.png) · [手机参考](images/reference-mobile-podcast.png) · [手机实图](images/mobile-podcast.png)

### 12 照片

- [x] 已看到：黑底大图、标题和序号、图片说明、缩略图已显示，不走普通预览。
- [ ] 对齐差异：关闭与前后切图是裸图标，缺参考稿圆形底；手机图片区约 350×197，参考稿约 374×340，留白与图像占比不同。
- [ ] 补验状态：滑动切图和长说明布局未逐状态验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-photo.png) · [桌面实图](images/desktop-photo.png) · [手机参考](images/reference-mobile-photo.png) · [手机实图](images/mobile-photo.png)

### 13 PR

- [x] 已看到：仓库、编号、分支、检查汇总、审阅结论、代码增减和改动文件已显示。
- [ ] 对齐差异：卡面增减统计旁缺改动文件数；详情审阅头像缺状态角标；评论使用文件图标，“4 评论”缺“条”；检查汇总行缩进与其他行不齐。
- [ ] 补验状态：没有真实审阅地址，跳转未验证。
- [ ] macOS 真实窗口：未验证。

[桌面参考](images/reference-desktop-pr.png) · [桌面实图](images/desktop-pr.png) · [手机参考](images/reference-mobile-pr.png) · [手机实图](images/mobile-pr.png)

## macOS 源码核对发现

下列为代码层差异，尚无窗口证据；修复后仍需逐张截图。

| 模块 | 代码层发现 | 验收要求 |
| --- | --- | --- |
| 日程 | 主时间区域未显示时区 | 与参考稿核对时间、日期、时区的分行 |
| 待办 | 元信息顺序与排布不同，优先级靠前 | 统一截止、参与者、优先级顺序与视觉角色 |
| 提醒 | 项目在正文前 | 调整到正文后并核对前缀 |
| 文件 | 详情来源与卡面来源采用不同信息 | 统一来源和文件夹表达 |
| 播客 | 跳转图标不符，页签使用蓝色标记，跟随开关独占一行 | 按参考稿还原控制区、黑色页签线及跟随入口 |
| PR | 待审阅意图未参与主状态；记录时间直接显示原值；检查和审阅逐项展开；无地址时入口结构改变 | 还原状态、时间、汇总行与禁用按钮 |

Mac 最近一次构建完成 Swift 编译，但打包在 iconutil 报 Invalid Iconset，未得到可验收的完整应用包。不能以编译成功代替原生窗口验收。

## 还不能打勾的验收范围

- [ ] 13 类卡面逐张近景，包括未读、已读、收藏及长短内容；现有截图重点是详情，背景卡面不等于完整卡面验收。
- [ ] 全屏资讯、汇总、邮件、视频、播客的滚动状态、退出位置与顶部进度。
- [ ] 播客收起播放条：已滚到内容底部，滚动约 204px，compact-player 仍隐藏。
- [ ] 媒体实际播放结束才标已读；关闭详情暂停并保留位置。
- [ ] 深色模式、短笔记、非空个人备注、空字段及长字段状态。
- [ ] macOS 13 类真实窗口逐项截图；手机 Web 真机安全区与手势。

缺少可用音源、文件地址或审阅地址，只影响相关动作的实测，不允许删掉或简化参考稿中的 UI。没有数据的区域保留完整结构和明确空状态。

## 补充证据

[资讯全屏](images/full-article.png) · [汇总全屏](images/full-digest.png) · [邮件全屏](images/full-mail.png) · [视频全屏加载态](images/full-video.png) · [播客全屏](images/full-podcast.png) · [播客滚到底](images/podcast-scrolled.png)

本记录是检查结果，不是 UI 完成声明。设计 build/check 通过，过程中有 React 列表 key 警告；未发布线上设计。后续修复需复验相同画面，再逐项勾选。
