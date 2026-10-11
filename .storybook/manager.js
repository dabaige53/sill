import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

addons.setConfig({
 theme: create({
  base: 'light', brandTitle: 'Quiet Glass · Design System',
  colorPrimary: '#0066cc', colorSecondary: '#0066cc',
  appBg: '#f5f5f7', appContentBg: '#ffffff', appBorderColor: '#e5e5e8',
  appBorderRadius: 12, textColor: '#1d1d1f',
  barBg: '#ffffff', barTextColor: '#6e6e73', barSelectedColor: '#0066cc',
  fontBase: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
 }),
 panelPosition: 'bottom',
 sidebar: { showRoots: true }
});
