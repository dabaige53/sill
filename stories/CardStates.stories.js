import { renderCard, renderCardStates } from './runtime.js';

export default {
  id: 'card-states',
  title: '03 卡片库/02 状态',
  tags: ['!autodocs'],
  render: renderCard,
  parameters: {
    layout: 'centered',
    docs: { description: { component: '状态来自 `src/data/card-catalog.js` 的 CardCatalog.states()，由 `src/cards/templates.js` 的状态参数渲染。此目录把状态与内容类型分开，方便逐个审查、修改和复用。' } }
  },
  args: { variant: 'article-standard', state: 'default', title: '', summary: '', width: 420 },
  argTypes: {
    variant: { control: false, description: '每个状态配合适用的内容类型展示。' },
    state: { control: false, description: '固定样例状态；在「类型与调参」中自由切换。' },
    title: { name: '标题', control: 'text' },
    summary: { name: '摘要', control: 'text' },
    width: { name: '卡片宽度', control: { type: 'range', min: 260, max: 720, step: 10 } }
  }
};

export const Overview = {
  name: '六种状态对照',
  render: renderCardStates,
  parameters: { layout: 'fullscreen', controls: { disable: true }, docs: { description: { story: '并排展示默认、已读、收藏、选中、延后和完成。此处为不写入业务数据的状态样本。' } } }
};

export const Default = {
  name: "默认",
  args: { variant: "article-standard", state: "default" },
  parameters: { docs: { description: { story: "标题与摘要优先，工具随操作意图出现。" } } }
};

export const Read = {
  name: "已读",
  args: { variant: "article-standard", state: "read" },
  parameters: { docs: { description: { story: "已读降低视觉权重，进度圆环完成；打开预览不等同于读完。" } } }
};

export const Bookmarked = {
  name: "已收藏",
  args: { variant: "article-standard", state: "bookmarked" },
  parameters: { docs: { description: { story: "收藏按钮保持选中，内容类型保持不变。" } } }
};

export const Selected = {
  name: "已选中",
  args: { variant: "article-standard", state: "selected" },
  parameters: { docs: { description: { story: "边框与角标共同表达选择状态。" } } }
};

export const Snoozed = {
  name: "已延后",
  args: { variant: "reminder-compact", state: "snoozed" },
  parameters: { docs: { description: { story: "提醒显示下一次提醒时间，延后操作可以恢复。" } } }
};

export const Completed = {
  name: "已完成",
  args: { variant: "task-active", state: "completed" },
  parameters: { docs: { description: { story: "完成后的待办收拢，保留重新打开的入口。" } } }
};
