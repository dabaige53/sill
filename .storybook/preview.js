import 'virtual:quiet-glass/styles.css';
import '../stories/storybook.css';
import { cleanupStory } from '../stories/runtime.js';

export default {
 parameters: {
  layout: 'fullscreen',
  controls: { expanded: true, sort: 'requiredFirst' },
  options: {
   storySort: { order: ['00 开始使用', '01 设计基础', '02 图标库', '03 卡片库', '04 组件库', '05 设计参考'] }
  },
  backgrounds: {
   options: {
    paper: { name: '暖白纸面', value: '#f7f7f3' },
    white: { name: '纯白', value: '#ffffff' },
    dark: { name: '深色对照', value: '#252c29' }
   }
  }
 },
 initialGlobals: { backgrounds: { value: 'paper' } },
 beforeEach() {
  cleanupStory();
  return cleanupStory;
 }
};
