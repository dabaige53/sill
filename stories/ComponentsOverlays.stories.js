import { renderComponent } from './runtime.js';

export default {
  id: 'components-overlays',
  title: "04 组件库/03 操作层与面板",
  tags: ['!autodocs'],
  render: renderComponent,
  parameters: { layout: 'centered', docs: { description: { component: "预览、阅读、筛选和编辑由正式 Panels 与 AppController 驱动。点击打开体验完整流程；关闭后回到当前样例。 样例登记在 `src/views/library.js` 的 ComponentCatalog；Storybook 调用该登记，不另写一套组件模板。" } } },
  args: { width: 520 },
  argTypes: {
    component: { control: false, description: '与 ComponentCatalog 中的组件 key 一致。' },
    width: { name: '预览宽度', control: { type: 'range', min: 280, max: 1000, step: 20 }, description: '单位 px；屏幕不足时自动收缩。' },
    label: { control: false, table: { disable: true } },
    disabled: { control: false, table: { disable: true } },
    progress: { control: false, table: { disable: true } }
  }
};

export const GlassDock = {
  name: "玻璃工具组",
  args: {"component": "glass-dock"},
  parameters: { docs: { description: { story: "筛选、刷新与 AI 是按需出现的工具。材质属于操作层，阅读表面保持清楚。 来源：`src/views/app.js · AppController.init() · dock`。" } } }
};

export const CardMenu = {
  name: "卡片情境菜单",
  args: {"component": "card-menu"},
  parameters: { docs: { description: { story: "围绕当前内容提供少量动作。此处操作示例阅读卡，反馈沿用正式流程。 来源：`src/views/app.js · AppController.more()`。" } } }
};

export const DialogPreview = {
  name: "快速预览",
  args: {"component": "dialog-preview"},
  parameters: { docs: { description: { story: "先看摘要和关键内容，再决定阅读、标记或继续操作。关闭后回到原处。 来源：`src/interactions/panels.js · Panels.preview()`。" } } }
};

export const Reader = {
  name: "完整阅读",
  args: {"component": "reader"},
  parameters: { docs: { description: { story: "把正文置于连续阅读的版面。关闭后恢复内容位置，进度独立记录。 来源：`src/interactions/panels.js · Panels.preview(app, card, true)`。" } } }
};

export const FilterPanel = {
  name: "筛选面板",
  args: {"component": "filter-panel"},
  parameters: { docs: { description: { story: "内容、状态、排序和标签逐层筛选，结果数量随输入变化。 来源：`src/interactions/panels.js · Panels.filter()`。" } } }
};

export const EditorPanel = {
  name: "标签与备注编辑",
  args: {"component": "editor-panel"},
  parameters: { docs: { description: { story: "围绕一张卡片整理线索。标签可增减，备注在保存后保留于当前故事的隔离环境。 来源：`src/interactions/panels.js · Panels.editor()`。" } } }
};

export const MediaPlayer = {
  name: "媒体预览与片段播放",
  args: {"component": "media-player"},
  parameters: { docs: { description: { story: "封面承担内容预览；打开后可播放、暂停和切换演示片段。 来源：`src/interactions/panels.js · Panels.preview() · media`。" } } }
};

export const SettingsPanel = {
  name: "可访问性与使用说明",
  args: {"component": "settings-panel"},
  parameters: { docs: { description: { story: "查看减少动态效果、透明度偏好与键盘操作，也能确认演示功能的边界。 来源：`src/interactions/panels.js · Panels.settings()`。" } } }
};
