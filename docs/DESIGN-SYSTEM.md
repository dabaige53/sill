# Quiet Glass 设计系统

设计规范统一存放在仓库根目录的 `design-system/`，线上版本为 [Quiet Glass Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)。原先的 Storybook 工作台和 `icons.html` / `cards.html` / `components.html` / `research.html` 四个参考页面已下线。

## 目录

| 路径 | 内容 |
| --- | --- |
| `design-system/README.md` | 品牌手册：产品立场、文案、颜色、玻璃材质、字体、间距、状态、图标、使用方式 |
| `design-system/tokens.json` | 设计变量：20 色、12 个字体样式、间距、圆角、阴影，每项附用途 |
| `design-system/assets/Icons/` | 38 个 Mono24 图标 SVG（墨色固定为 `ink`）及图标目录说明 |
| `design-system/components/<Comp>/` | 24 个组件的使用说明（README.md）与静态预览（preview.html） |
| `design-system/components/bundle.js` / `bundle.css` | 预览用的渲染函数与样式，生成自 `src/` |
| `design-system/components/Cover/` | 设计系统封面 |
| `design-system/design-system.json` | 线上版本的索引（含图标素材 id） |
| `design-system/scripts/` | 从 `src/` 重新生成上述文件的脚本 |

## 单一来源

产品实现仍以 `src/` 为准，`design-system/` 记录规范并引用同一份实现：

| 想修改什么 | 实现位置 | 规范位置 |
| --- | --- | --- |
| 颜色、圆角、阴影、动效变量 | `src/styles/tokens.css` | `design-system/tokens.json` |
| 图标线条 | `src/atoms/icons.js` 的 `Glyphs` / `icon(name, size)` | `design-system/assets/Icons/` |
| 按钮、进度环、任务项、头像、标签 | `src/atoms/primitives.js` | 对应组件 README |
| 卡片结构及状态 | `src/cards/templates.js` 的 `cardHTML(card, options)` | `FeedCard` / `TaskCard` / `ReminderCard` 等 |
| 预览、筛选、编辑和设置面板 | `src/interactions/panels.js` | `Dialog` |
| AI 引用、会话和输入 | `src/services/ai.js` | `AIContext` / `AICompose` / `AIMessages` |
| 动效 | `src/interactions/motion.js` | 品牌手册「状态与交互」 |

修改 `src/` 中的变量、图标或组件样式后，同步更新 `design-system/` 中对应的 token 或说明，并重新生成图标与 bundle：

```sh
node design-system/scripts/gen.cjs design-system .
```

## 样式分层

`src/styles/styles.json` 明确构建顺序：

1. `tokens.css`：颜色、间距、圆角、阴影与动效变量。
2. `base.css`：页面、文字和基础布局。
3. `controls.css`：按钮、玻璃工具、选择条和反馈。
4. `cards.css`：业务卡片外观与状态。
5. `overlays.css`：预览、阅读、表单和 AI 浮层。
6. `responsive.css`：窄屏、触屏、减少动效与减少透明度适配。

## 验收

```sh
python3 scripts/build.py
python3 tests/verify.py
npm run test:browser
```

HTML 是构建产物，不直接手工维护。本项目使用原生 HTML/CSS/SVG/WAAPI；外部参考中的 React、Motion+ 等组件不代表已经安装或获得商业授权。
