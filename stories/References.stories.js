import { renderReferences } from './runtime.js';

export default {
  id: 'references',
  title: '05 设计参考',
  tags: ['!autodocs'],
  render: renderReferences,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: { description: { component: '参考资料与实现分开保存。28 项参考登记在 `src/data/sources.js`，包含官网地址、具体借鉴点和使用边界；`research.html` 与当前目录复用同一份登记。外部参考不作为运行时依赖。' } }
  }
};

export const Index = {
  name: '官方资料与组件参考',
  parameters: { docs: { description: { story: '点击来源链接查看原始材料。将确认采用的设计规则落实到共享组件源；仅被列入参考目录不表示该能力已经接入产品。' } } }
};
