import { renderComponent } from './runtime.js';

export default {
  id: 'components-ai',
  title: "04 组件库/05 AI 对话与上下文",
  tags: ['!autodocs'],
  render: renderComponent,
  parameters: { layout: 'centered', docs: { description: { component: "引用、输入与发送分别处理。所有样例复用 AIView 和正式对话控制器；加入引用或带入草稿都不会自动发送。回复为本地演示。 样例登记在 `src/views/library.js` 的 ComponentCatalog；Storybook 调用该登记，不另写一套组件模板。" } } },
  args: { width: 520 },
  argTypes: {
    component: { control: false, description: '与 ComponentCatalog 中的组件 key 一致。' },
    width: { name: '预览宽度', control: { type: 'range', min: 280, max: 1000, step: 20 }, description: '单位 px；屏幕不足时自动收缩。' },
    label: { control: false, table: { disable: true } },
    disabled: { control: false, table: { disable: true } },
    progress: { control: false, table: { disable: true } }
  }
};

export const AiContext = {
  name: "可调整的上下文引用",
  args: {"component": "ai-context", "width": 720},
  parameters: { docs: { description: { story: "沿用真实引用组件。点击标题打开预览；移除仅影响这里的样例。 来源：`src/services/ai.js · AIView.contexts()`。" } } }
};

export const AiCompose = {
  name: "提问输入与发送",
  args: {"component": "ai-compose"},
  parameters: { docs: { description: { story: "先在此试写。点击箭头打开真实对话并带入草稿；仍需在对话中确认发送。 来源：`src/services/ai.js · AIView.shell() · compose`。" } } }
};

export const AiMessages = {
  name: "问题与回复",
  args: {"component": "ai-messages"},
  parameters: { docs: { description: { story: "用户提问与回复有明确区分。示例回复标注本地演示，不代表模型分析。 来源：`src/views/app.js · AppController.paintAI()`。" } } }
};

export const AiEmpty = {
  name: "对话空状态",
  args: {"component": "ai-empty"},
  parameters: { docs: { description: { story: "开始前说明如何提供上下文，保留拖动与点击两种入口。 来源：`src/services/ai.js · AIView.shell() · empty`。" } } }
};
