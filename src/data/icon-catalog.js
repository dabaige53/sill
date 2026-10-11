/**
 * Icon documentation only. SVGs stay in src/atoms/icons.js as the single source
 * of truth; the library enumerates Glyphs so new glyphs never disappear here.
 */
const IconCatalog = {
 groups: [
  {key:'navigation',title:'导航与查找',description:'移动、定位和改变内容视野。'},
  {key:'actions',title:'内容操作',description:'对当前卡片执行明确、可逆的动作。'},
  {key:'content',title:'内容与来源',description:'辨认对象类型，让操作语言跟随内容。'},
  {key:'states',title:'状态与反馈',description:'表达确认、提醒、进度和可用状态。'},
  {key:'media',title:'媒体与对话',description:'控制播放、发送消息和建立上下文。'},
  {key:'uncategorized',title:'新增图标',description:'已进入共享渲染器，等待补充用途和分组。'}
 ],
 icons: {
  sparkles:{name:'关联与 AI',group:'media',purpose:'打开 AI 对话或表达内容关联。'},
  refresh:{name:'刷新',group:'actions',purpose:'获取演示新内容，或重新执行当前动作。'},
  filter:{name:'筛选',group:'navigation',purpose:'按需打开筛选与排序面板。'},
  search:{name:'搜索',group:'navigation',purpose:'查找当前信息流中的内容。'},
  bookmark:{name:'收藏',group:'actions',purpose:'切换卡片收藏状态。'},
  tag:{name:'标签',group:'actions',purpose:'编辑或筛选内容标签。'},
  note:{name:'笔记',group:'content',purpose:'识别笔记内容或进入备注编辑。'},
  more:{name:'更多',group:'actions',purpose:'显示当前对象的其他操作。'},
  check:{name:'勾选',group:'states',purpose:'表达选中、确认或单项完成。'},
  'check-circle':{name:'完成与待办',group:'states',purpose:'识别待办内容或执行完成动作。'},
  x:{name:'关闭',group:'actions',purpose:'关闭浮层、移除引用或取消当前选择。'},
  plus:{name:'添加',group:'actions',purpose:'添加内容、标签或新的上下文。'},
  arrow:{name:'前往',group:'navigation',purpose:'进入下一步或查看相关内容。'},
  up:{name:'向上',group:'navigation',purpose:'回到顶部或表达向上提起。'},
  back:{name:'返回',group:'navigation',purpose:'返回上一层并保留阅读位置。'},
  expand:{name:'展开',group:'navigation',purpose:'从预览进入完整阅读。'},
  external:{name:'外部链接',group:'navigation',purpose:'在新标签页打开来源或参考资料。'},
  clock:{name:'时间',group:'states',purpose:'表达阅读时长、截止时间或延后。'},
  calendar:{name:'日程',group:'content',purpose:'识别日程内容与日期相关操作。'},
  mail:{name:'邮件',group:'content',purpose:'识别邮件卡片及邮件来源。'},
  book:{name:'阅读',group:'content',purpose:'识别资讯与阅读内容。'},
  layers:{name:'集合',group:'content',purpose:'表达内容回顾、组件集合或分层。'},
  bell:{name:'提醒',group:'states',purpose:'识别提醒及其到期状态。'},
  play:{name:'播放',group:'media',purpose:'播放媒体或启动动效演示。'},
  pause:{name:'暂停',group:'media',purpose:'暂停正在播放的媒体。'},
  file:{name:'文件',group:'content',purpose:'表达附件及通用文件内容。'},
  download:{name:'下载',group:'actions',purpose:'下载当前附件或演示文件。'},
  video:{name:'视频',group:'media',purpose:'识别视频媒体内容。'},
  select:{name:'选择',group:'actions',purpose:'选择卡片以执行批量操作。'},
  undo:{name:'撤销',group:'actions',purpose:'撤销最近一次可恢复操作。'},
  info:{name:'说明',group:'states',purpose:'打开说明、设置或边界信息。'},
  grid:{name:'信息流',group:'navigation',purpose:'返回卡片信息流或切换到集合视图。'},
  grip:{name:'拖动',group:'actions',purpose:'提示卡片可被提起并加入上下文。'},
  send:{name:'发送',group:'media',purpose:'明确发送用户已准备好的消息。'},
  quote:{name:'引用',group:'content',purpose:'表达引用内容或摘录。'},
  eye:{name:'预览',group:'navigation',purpose:'快速查看内容，不等同于完成阅读。'},
  ring:{name:'进度',group:'states',purpose:'识别阅读反馈；实际进度由 ring() 渲染。'},
  moon:{name:'稍后',group:'states',purpose:'表达稍后阅读或延后处理。'}
 }
};
