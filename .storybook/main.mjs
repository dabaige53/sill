import { quietGlassSource } from './shared-source.mjs';

export default {
 stories: ['../stories/**/*.stories.js'],
 framework: { name: '@storybook/html-vite', options: {} },
 addons: ['@storybook/addon-docs'],
 core: { disableTelemetry: true, disableWhatsNewNotifications: true },
 docs: { autodocs: false },
 async viteFinal(config) {
  config.plugins = [...(config.plugins || []), quietGlassSource()];
  return config;
 }
};
