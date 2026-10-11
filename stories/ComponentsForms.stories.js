import { renderComponent } from './runtime.js';

export default {
  id: 'components-forms',
  title: "04 组件库/02 输入与设置",
  tags: ['!autodocs'],
  render: renderComponent,
  parameters: { layout: 'centered', docs: { description: { component: "输入与设置复用 src/interactions/panels.js 中的真实表单样式和操作。示例输入保持在当前演示中；完整面板演示在隔离的组件预览环境中运行。 样例登记在 `src/views/library.js` 的 ComponentCatalog；Storybook 调用该登记，不另写一套组件模板。" } } },
  args: { width: 520 },
  argTypes: {
    component: { control: false, description: '与 ComponentCatalog 中的组件 key 一致。' },
    width: { name: '预览宽度', control: { type: 'range', min: 280, max: 1000, step: 20 }, description: '单位 px；屏幕不足时自动收缩。' },
    label: { control: false, table: { disable: true } },
    disabled: { control: false, table: { disable: true } },
    progress: { control: false, table: { disable: true } }
  }
};

export const SearchField = {
  name: "搜索输入",
  args: {"component": "search-field"},
  parameters: { docs: { description: { story: "输入框可直接试写。完整搜索包含内容、状态、排序和标签。 来源：`src/interactions/panels.js · Panels.filter()`。" } } }
};

export const Textarea = {
  name: "长文本输入",
  args: {"component": "textarea"},
  parameters: { docs: { description: { story: "留出适当行距和书写空间。样例文字不保存，实际备注在编辑面板中保存。 来源：`src/interactions/panels.js · Panels.editor()`。" } } }
};

export const Toggle = {
  name: "偏好开关",
  args: {"component": "toggle"},
  parameters: { docs: { description: { story: "点击立即切换减少透明度设置，并同步影响当前页面的操作层。 来源：`src/interactions/panels.js · Panels.settings()`。" } } }
};
