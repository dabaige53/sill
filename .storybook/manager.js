import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

addons.setConfig({
 theme: create({
  base: 'light', brandTitle: 'Quiet Glass · Design System',
  colorPrimary: '#496656', colorSecondary: '#496656',
  appBg: '#f1f3ec', appContentBg: '#f7f7f3', appBorderColor: '#dde4d7',
  appBorderRadius: 12, textColor: '#252c29',
  barBg: '#fdfdfb', barTextColor: '#717771', barSelectedColor: '#496656',
  fontBase: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
 }),
 panelPosition: 'bottom',
 sidebar: { showRoots: true }
});
