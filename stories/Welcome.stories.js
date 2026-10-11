import { renderWelcome } from './runtime.js';

export default {
  id: 'welcome',
  title: '00 开始使用',
  tags: ['!autodocs'],
  render: renderWelcome,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: { description: { component: 'Quiet Glass 的本地组件工作台。源码、样例和设计参考随 Git 保存；开发时运行 Storybook，交付时构建静态站点分享。' } }
  }
};

export const Start = {
  name: '组件库使用说明',
  parameters: { docs: { description: { story: '从侧栏选择一个图标、卡片或组件，在 Canvas 试用，在 Controls 调整预览。Controls 修改用于临时预览；将确认的参数写入对应 .stories.js，将正式样式或行为修改写入 src/，再通过 Git 保存版本。' } } }
};
