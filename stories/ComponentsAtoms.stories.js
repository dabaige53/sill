import { renderComponent } from './runtime.js';

export default {
  id: 'components-atoms',
  title: "04 组件库/01 基础组件",
  tags: ['!autodocs'],
  render: renderComponent,
  parameters: { layout: 'fullscreen', docs: { description: { component: "按钮、进度、选择项、头像、附件、标签和元信息使用正式组件源。可在 Canvas 中直接体验交互，或通过 Controls 比较尺寸与指定状态。 样例登记在 `src/views/library.js` 的 ComponentCatalog；Storybook 调用该登记，不另写一套组件模板。" } } },
  args: { width: 520 },
  argTypes: {
    component: { control: false, description: '与 ComponentCatalog 中的组件 key 一致。' },
    width: { name: '预览宽度', control: { type: 'range', min: 280, max: 1000, step: 20 }, description: '单位 px；屏幕不足时自动收缩。' },
    label: { control: false, table: { disable: true } },
    disabled: { control: false, table: { disable: true } },
    progress: { control: false, table: { disable: true } }
  }
};

export const IconButton = {
  name: "图标按钮",
  args: {"component": "icon-button", "label": "收藏", "disabled": false},
  argTypes: { label: { name: '按钮名称', control: 'text', table: { disable: false }, description: '覆盖第一个主要操作的名称，检查较长文字。' }, disabled: { name: '禁用操作', control: 'boolean', table: { disable: false } } },
  parameters: { docs: { description: { story: "同一个触控范围，覆盖默认、已选择、键盘聚焦和禁用状态。 来源：`src/atoms/primitives.js · button()`。" } } }
};

export const ActionButton = {
  name: "主操作与次操作",
  args: {"component": "action-button", "label": "打开预览", "disabled": false},
  argTypes: { label: { name: '按钮名称', control: 'text', table: { disable: false }, description: '覆盖第一个主要操作的名称，检查较长文字。' }, disabled: { name: '禁用操作', control: 'boolean', table: { disable: false } } },
  parameters: { docs: { description: { story: "一个区域只强调一个决定。其余动作保持轻量，状态清楚可辨。 来源：`src/styles/controls.css · .solid-button / .text-button`。" } } }
};

export const ProgressRing = {
  name: "阅读进度圆环",
  args: {"component": "progress-ring", "progress": 55},
  argTypes: { progress: { name: '阅读进度', control: { type: 'range', min: 0, max: 100, step: 1 }, table: { disable: false }, description: '百分比，0 为尚未阅读，100 为完成。' } },
  parameters: { docs: { description: { story: "读过多少由圆环表达。打开内容与完成阅读是不同状态。拖动滑块查看变化。 来源：`src/atoms/primitives.js · ring()`。" } } }
};

export const Checkbox = {
  name: "待办选择项",
  args: {"component": "checkbox"},
  parameters: { docs: { description: { story: "点击整行切换状态；完成反馈同时使用勾选、颜色和文字划线。此处为独立样例。 来源：`src/atoms/primitives.js · checkItem()`。" } } }
};

export const Avatars = {
  name: "参与者头像组",
  args: {"component": "avatars"},
  parameters: { docs: { description: { story: "用紧凑的组合说明谁参与其中，保留人数的可访问名称。 来源：`src/atoms/primitives.js · avatars()`。" } } }
};

export const Attachment = {
  name: "附件入口",
  args: {"component": "attachment"},
  parameters: { docs: { description: { story: "文件名、类型和下载动作放在同一行。此示例下载一份本地生成的演示附件。 来源：`src/cards/templates.js · CardTemplates.mail()`。" } } }
};

export const TagChip = {
  name: "标签与筛选项",
  args: {"component": "tag-chip"},
  parameters: { docs: { description: { story: "标签在编辑和筛选时出现。点击可以比较选中与未选中的样式。 来源：`src/atoms/primitives.js · tagChip()`。" } } }
};

export const Metadata = {
  name: "来源与状态线索",
  args: {"component": "metadata"},
  parameters: { docs: { description: { story: "来源、时间、阅读状态各有位置；状态不用醒目的装饰争夺注意力。 来源：`src/cards/templates.js · header() / footer()`。" } } }
};
