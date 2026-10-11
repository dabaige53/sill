import { renderCard, renderCards } from './runtime.js';

export default {
  id: 'cards',
  title: '03 卡片库/01 类型与调参',
  tags: ['!autodocs'],
  render: renderCard,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '卡片实现：`src/cards/templates.js` 的 cardHTML() 与 CardTemplates；类型登记：`src/data/card-catalog.js`；视觉样式：`src/styles/cards.css`。13 个形态覆盖 10 类内容，均调用正式模板。卡片同时承载信息和操作：预览、阅读、收藏、任务勾选及加入 AI 引用。' } }
  },
  args: { variant: 'article-image', state: 'default', title: '', summary: '', width: 360 },
  argTypes: {
    variant: { name: '卡片形态', control: 'select', options: ["article-image", "article-standard", "mail-standard", "note-quote", "note-standard", "task-active", "task-completed", "event-standard", "reminder-compact", "media-image", "insight-data", "digest-data", "suggestion-standard"], description: '与 CardCatalog.variants 的 key 一致。' },
    state: { name: '展示状态', control: 'select', options: ['default', 'read', 'bookmarked', 'selected', 'snoozed', 'completed'], description: '收藏与已读属于状态；延后适用于提醒，完成适用于待办。' },
    title: { name: '标题', control: 'text', description: '留空使用样例标题；用较长标题检查换行。' },
    summary: { name: '摘要', control: 'text', description: '留空使用样例摘要；只影响预览内容。' },
    width: { name: '卡片宽度', control: { type: 'range', min: 260, max: 720, step: 10 }, description: '单位 px；在窄屏幕下自动收缩。' }
  }
};

export const Overview = {
  name: '全部 13 个卡片形态',
  render: renderCards,
  parameters: { layout: 'fullscreen', controls: { disable: true }, docs: { description: { story: '完整卡片目录复用正式模板，13 个形态覆盖资讯、邮件、笔记、待办、日程、提醒、媒体、阅读反馈、回顾和关联建议。' } } }
};

export const Playground = {
  name: '交互调参',
  parameters: { docs: { description: { story: '切换形态与状态，调整文字及宽度。试用卡片上的真实操作，再将确认的规则同步到共享模板。' } } }
};

export const ArticleImage = {
  name: "封面资讯",
  args: { variant: "article-image" },
  parameters: { docs: { description: { story: "结构：来源 · 封面 · 标题 · 摘要 · 阅读进度。点击预览，继续阅读；可收藏或加入 AI 上下文。 内容类型：article；视觉形态：image。" } } }
};

export const ArticleStandard = {
  name: "文字资讯",
  args: { variant: "article-standard" },
  parameters: { docs: { description: { story: "结构：来源 · 标题 · 摘要 · 阅读进度。适合没有封面的内容；打开与读完分别记录。 内容类型：article；视觉形态：standard。" } } }
};

export const MailStandard = {
  name: "邮件",
  args: { variant: "mail-standard" },
  parameters: { docs: { description: { story: "结构：发件人 · 主题 · 摘要 · 附件 · 时间。点击预览正文，在详情中下载演示附件。 内容类型：mail；视觉形态：standard。" } } }
};

export const NoteQuote = {
  name: "摘录笔记",
  args: { variant: "note-quote" },
  parameters: { docs: { description: { story: "结构：来源 · 引文符号 · 摘录 · 补充说明。保留句子的节奏；通过更多操作编辑标签与备注。 内容类型：note；视觉形态：quote。" } } }
};

export const NoteStandard = {
  name: "普通笔记",
  args: { variant: "note-standard" },
  parameters: { docs: { description: { story: "结构：来源 · 标题 · 内容片段 · 时间。支持预览、阅读，以及作为 AI 上下文引用。 内容类型：note；视觉形态：standard。" } } }
};

export const TaskActive = {
  name: "待办清单",
  args: { variant: "task-active" },
  parameters: { docs: { description: { story: "结构：来源 · 标题 · 可勾选项目 · 完成数量。直接勾选任务；全部完成后自动收拢。 内容类型：task；视觉形态：standard。" } } }
};

export const TaskCompleted = {
  name: "完成待办",
  args: { variant: "task-completed" },
  parameters: { docs: { description: { story: "结构：完成标识 · 状态 · 标题。完成时收拢；打开详情可恢复项目。展示当前故事的隔离状态。 内容类型：task；视觉形态：standard。" } } }
};

export const EventStandard = {
  name: "日程",
  args: { variant: "event-standard" },
  parameters: { docs: { description: { story: "结构：相对时间 · 日期 · 标题 · 时间段 · 参与者。快速判断时间；点击查看完整议程。 内容类型：event；视觉形态：standard。" } } }
};

export const ReminderCompact = {
  name: "提醒",
  args: { variant: "reminder-compact" },
  parameters: { docs: { description: { story: "结构：到期状态 · 内容 · 来源 · 两个直接动作。卡内延后或完成，操作后可撤销；没有打断式弹窗。 内容类型：reminder；视觉形态：compact。" } } }
};

export const MediaImage = {
  name: "媒体内容",
  args: { variant: "media-image" },
  parameters: { docs: { description: { story: "结构：封面 · 播放标识 · 来源 · 标题 · 片段数量。打开交互演示详情；此原型不连接外部视频播放器。 内容类型：media；视觉形态：image。" } } }
};

export const InsightData = {
  name: "阅读反馈",
  args: { variant: "insight-data" },
  parameters: { docs: { description: { story: "结构：来源 · 标题 · 实时分钟数 · 进度环。根据本地阅读页前台停留时间更新。 内容类型：insight；视觉形态：data。" } } }
};

export const DigestData = {
  name: "行为回顾",
  args: { variant: "digest-data" },
  parameters: { docs: { description: { story: "结构：来源 · 标题 · 描述 · 三组汇总。根据当前故事中已读、收藏、完成的隔离状态更新。 内容类型：digest；视觉形态：data。" } } }
};

export const SuggestionStandard = {
  name: "关联建议",
  args: { variant: "suggestion-standard" },
  parameters: { docs: { description: { story: "结构：关联来源 · 说明 · 可点引用 · AI 操作。打开关联内容或加入 AI 引用；加入引用不会自动发送。 内容类型：suggestion；视觉形态：standard。" } } }
};
