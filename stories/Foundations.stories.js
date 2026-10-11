import { renderTokens } from './runtime.js';

export default {
  id: 'foundations',
  title: '01 设计基础',
  tags: ['!autodocs'],
  render: renderTokens,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: { description: { component: 'Quiet Glass 的公共设计变量保存在 `src/styles/tokens.css`：颜色、字体、间距、圆角、阴影与动效节奏。其余 CSS 模块通过 `src/styles/styles.json` 按序加载。修改变量即可同步检查本组件库和实际信息流。' } }
  }
};

export const Tokens = {
  name: '颜色、字阶与节奏',
  parameters: { docs: { description: { story: '浏览当前源码中的实际变量。先调整共享变量，再检查图标、卡片及组件，最后进入业务页面验证整体关系。' } } }
};
