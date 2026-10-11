import { renderIcon, renderIcons } from './runtime.js';

/** Static exports keep every shared glyph addressable in Storybook's index. */
export default {
  id: 'icons',
  title: '02 图标库',
  tags: ['!autodocs'],
  render: renderIcon,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '图标源文件：`src/atoms/icons.js` 的 Glyphs 与 icon()。名称、分组和使用说明：`src/data/icon-catalog.js`。每个图标都可独立选择；在 Controls 中调整尺寸与颜色。修改共享 SVG 后，信息流和本组件库同时采用新版本。' } }
  },
  args: { name: 'bookmark', size: 24, color: '#496656', disabled: false },
  argTypes: {
    name: { name: '图标名称', control: 'select', options: ["sparkles", "refresh", "filter", "search", "bookmark", "tag", "note", "more", "check", "check-circle", "x", "plus", "arrow", "up", "back", "expand", "external", "clock", "calendar", "mail", "book", "layers", "bell", "play", "pause", "file", "download", "video", "select", "undo", "info", "grid", "grip", "send", "quote", "eye", "ring", "moon"], description: '共享 Glyphs 的唯一键名。' },
    size: { name: '图形尺寸', control: { type: 'range', min: 12, max: 64, step: 2 }, description: 'SVG 尺寸，单位 px；按钮的触控范围单独保留。' },
    color: { name: '图标颜色', control: 'color', description: '通过 currentColor 继承颜色。' },
    disabled: { name: '禁用按钮', control: 'boolean', description: '比较可用与禁用状态。' }
  }
};

export const Overview = {
  name: '全部 38 个图标',
  render: renderIcons,
  parameters: { layout: 'fullscreen', controls: { include: ['size', 'color'] }, docs: { description: { story: '完整图标索引复用实际图标源，适合并排比较线条、比例与语义分组。' } } }
};

export const Playground = {
  name: '交互调参',
  parameters: { docs: { description: { story: '选择图标并调整参数。Controls 修改用于临时预览；确认后将参数写入对应 Story，或修改共享源文件。' } } }
};

export const Sparkles = {
  name: "关联与 AI",
  args: { name: "sparkles" },
  parameters: { docs: { description: { story: "打开 AI 对话或表达内容关联。 调用：icon('sparkles', size)。" } } }
};

export const Refresh = {
  name: "刷新",
  args: { name: "refresh" },
  parameters: { docs: { description: { story: "获取演示新内容，或重新执行当前动作。 调用：icon('refresh', size)。" } } }
};

export const Filter = {
  name: "筛选",
  args: { name: "filter" },
  parameters: { docs: { description: { story: "按需打开筛选与排序面板。 调用：icon('filter', size)。" } } }
};

export const Search = {
  name: "搜索",
  args: { name: "search" },
  parameters: { docs: { description: { story: "查找当前信息流中的内容。 调用：icon('search', size)。" } } }
};

export const Bookmark = {
  name: "收藏",
  args: { name: "bookmark" },
  parameters: { docs: { description: { story: "切换卡片收藏状态。 调用：icon('bookmark', size)。" } } }
};

export const Tag = {
  name: "标签",
  args: { name: "tag" },
  parameters: { docs: { description: { story: "编辑或筛选内容标签。 调用：icon('tag', size)。" } } }
};

export const Note = {
  name: "笔记",
  args: { name: "note" },
  parameters: { docs: { description: { story: "识别笔记内容或进入备注编辑。 调用：icon('note', size)。" } } }
};

export const More = {
  name: "更多",
  args: { name: "more" },
  parameters: { docs: { description: { story: "显示当前对象的其他操作。 调用：icon('more', size)。" } } }
};

export const Check = {
  name: "勾选",
  args: { name: "check" },
  parameters: { docs: { description: { story: "表达选中、确认或单项完成。 调用：icon('check', size)。" } } }
};

export const CheckCircle = {
  name: "完成与待办",
  args: { name: "check-circle" },
  parameters: { docs: { description: { story: "识别待办内容或执行完成动作。 调用：icon('check-circle', size)。" } } }
};

export const X = {
  name: "关闭",
  args: { name: "x" },
  parameters: { docs: { description: { story: "关闭浮层、移除引用或取消当前选择。 调用：icon('x', size)。" } } }
};

export const Plus = {
  name: "添加",
  args: { name: "plus" },
  parameters: { docs: { description: { story: "添加内容、标签或新的上下文。 调用：icon('plus', size)。" } } }
};

export const Arrow = {
  name: "前往",
  args: { name: "arrow" },
  parameters: { docs: { description: { story: "进入下一步或查看相关内容。 调用：icon('arrow', size)。" } } }
};

export const Up = {
  name: "向上",
  args: { name: "up" },
  parameters: { docs: { description: { story: "回到顶部或表达向上提起。 调用：icon('up', size)。" } } }
};

export const Back = {
  name: "返回",
  args: { name: "back" },
  parameters: { docs: { description: { story: "返回上一层并保留阅读位置。 调用：icon('back', size)。" } } }
};

export const Expand = {
  name: "展开",
  args: { name: "expand" },
  parameters: { docs: { description: { story: "从预览进入完整阅读。 调用：icon('expand', size)。" } } }
};

export const External = {
  name: "外部链接",
  args: { name: "external" },
  parameters: { docs: { description: { story: "在新标签页打开来源或参考资料。 调用：icon('external', size)。" } } }
};

export const Clock = {
  name: "时间",
  args: { name: "clock" },
  parameters: { docs: { description: { story: "表达阅读时长、截止时间或延后。 调用：icon('clock', size)。" } } }
};

export const Calendar = {
  name: "日程",
  args: { name: "calendar" },
  parameters: { docs: { description: { story: "识别日程内容与日期相关操作。 调用：icon('calendar', size)。" } } }
};

export const Mail = {
  name: "邮件",
  args: { name: "mail" },
  parameters: { docs: { description: { story: "识别邮件卡片及邮件来源。 调用：icon('mail', size)。" } } }
};

export const Book = {
  name: "阅读",
  args: { name: "book" },
  parameters: { docs: { description: { story: "识别资讯与阅读内容。 调用：icon('book', size)。" } } }
};

export const Layers = {
  name: "集合",
  args: { name: "layers" },
  parameters: { docs: { description: { story: "表达内容回顾、组件集合或分层。 调用：icon('layers', size)。" } } }
};

export const Bell = {
  name: "提醒",
  args: { name: "bell" },
  parameters: { docs: { description: { story: "识别提醒及其到期状态。 调用：icon('bell', size)。" } } }
};

export const Play = {
  name: "播放",
  args: { name: "play" },
  parameters: { docs: { description: { story: "播放媒体或启动动效演示。 调用：icon('play', size)。" } } }
};

export const Pause = {
  name: "暂停",
  args: { name: "pause" },
  parameters: { docs: { description: { story: "暂停正在播放的媒体。 调用：icon('pause', size)。" } } }
};

export const File = {
  name: "文件",
  args: { name: "file" },
  parameters: { docs: { description: { story: "表达附件及通用文件内容。 调用：icon('file', size)。" } } }
};

export const Download = {
  name: "下载",
  args: { name: "download" },
  parameters: { docs: { description: { story: "下载当前附件或演示文件。 调用：icon('download', size)。" } } }
};

export const Video = {
  name: "视频",
  args: { name: "video" },
  parameters: { docs: { description: { story: "识别视频媒体内容。 调用：icon('video', size)。" } } }
};

export const Select = {
  name: "选择",
  args: { name: "select" },
  parameters: { docs: { description: { story: "选择卡片以执行批量操作。 调用：icon('select', size)。" } } }
};

export const Undo = {
  name: "撤销",
  args: { name: "undo" },
  parameters: { docs: { description: { story: "撤销最近一次可恢复操作。 调用：icon('undo', size)。" } } }
};

export const Info = {
  name: "说明",
  args: { name: "info" },
  parameters: { docs: { description: { story: "打开说明、设置或边界信息。 调用：icon('info', size)。" } } }
};

export const Grid = {
  name: "信息流",
  args: { name: "grid" },
  parameters: { docs: { description: { story: "返回卡片信息流或切换到集合视图。 调用：icon('grid', size)。" } } }
};

export const Grip = {
  name: "拖动",
  args: { name: "grip" },
  parameters: { docs: { description: { story: "提示卡片可被提起并加入上下文。 调用：icon('grip', size)。" } } }
};

export const Send = {
  name: "发送",
  args: { name: "send" },
  parameters: { docs: { description: { story: "明确发送用户已准备好的消息。 调用：icon('send', size)。" } } }
};

export const Quote = {
  name: "引用",
  args: { name: "quote" },
  parameters: { docs: { description: { story: "表达引用内容或摘录。 调用：icon('quote', size)。" } } }
};

export const Eye = {
  name: "预览",
  args: { name: "eye" },
  parameters: { docs: { description: { story: "快速查看内容，不等同于完成阅读。 调用：icon('eye', size)。" } } }
};

export const Ring = {
  name: "进度",
  args: { name: "ring" },
  parameters: { docs: { description: { story: "识别阅读反馈；实际进度由 ring() 渲染。 调用：icon('ring', size)。" } } }
};

export const Moon = {
  name: "稍后",
  args: { name: "moon" },
  parameters: { docs: { description: { story: "表达稍后阅读或延后处理。 调用：icon('moon', size)。" } } }
};
