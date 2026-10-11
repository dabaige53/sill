import { renderComponent } from './runtime.js';

export default {
  id: 'components-feedback',
  title: "04 组件库/04 反馈与操作状态",
  tags: ['!autodocs'],
  render: renderComponent,
  parameters: { layout: 'centered', docs: { description: { component: "查看反馈、撤销、多选、拖放、空状态和动效。交互复用正式控制器；减少动态效果设置仍然生效。 样例登记在 `src/views/library.js` 的 ComponentCatalog；Storybook 调用该登记，不另写一套组件模板。" } } },
  args: { width: 520 },
  argTypes: {
    component: { control: false, description: '与 ComponentCatalog 中的组件 key 一致。' },
    width: { name: '预览宽度', control: { type: 'range', min: 280, max: 1000, step: 20 }, description: '单位 px；屏幕不足时自动收缩。' },
    label: { control: false, table: { disable: true } },
    disabled: { control: false, table: { disable: true } },
    progress: { control: false, table: { disable: true } }
  }
};

export const Toast = {
  name: "结果反馈与撤销",
  args: {"component": "toast"},
  parameters: { docs: { description: { story: "反馈短暂出现，不遮挡阅读。可逆操作附带撤销入口。 来源：`src/views/app.js · AppController.toast()`。" } } }
};

export const Selection = {
  name: "多选与批量操作",
  args: {"component": "selection"},
  parameters: { docs: { description: { story: "选中内容后，批量工具才出现。可以交给 AI、收藏或取消选择。 来源：`src/views/app.js · AppController.updateSelection()`。" } } }
};

export const DropTargets = {
  name: "拖拽接收区",
  args: {"component": "drop-targets"},
  parameters: { docs: { description: { story: "靠近目标时放大确认落点。相同动作也可点击完成，放入 AI 不自动发送。 来源：`src/interactions/drag.js · DragManager`。" } } }
};

export const EmptyState = {
  name: "无结果状态",
  args: {"component": "empty-state"},
  parameters: { docs: { description: { story: "说明当前为空的原因，并提供明确的下一步。清除筛选后保留当前目录。 来源：`src/atoms/primitives.js · emptyState()`。" } } }
};

export const NewContent = {
  name: "新内容提示",
  args: {"component": "new-content"},
  parameters: { docs: { description: { story: "刷新后的内容先进入等待队列。入口旁出现数字，由你决定何时查看。 来源：`src/views/app.js · paintPending() / showNew()`。" } } }
};

export const Motion = {
  name: "进入、提起与回弹",
  args: {"component": "motion"},
  parameters: { docs: { description: { story: "动效用于说明状态和位置变化。减少动态效果时，保留操作结果。 来源：`src/interactions/motion.js · MotionEngine`。" } } }
};
