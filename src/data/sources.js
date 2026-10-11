const Sources = [
  {
    "id": "linear-hierarchy",
    "title": "Linear · A calmer interface",
    "url": "https://linear.app/now/behind-the-latest-design-refresh",
    "kind": "卡片层次 · 2026",
    "note": "辅助元素降低视觉权重，减少重复的图标、分隔和底色。本轮用于正文、标题、元信息的层次，保留卡片优先布局。"
  },
  {
    "id": "craft-cards",
    "title": "Craft · Cards",
    "url": "https://support.craft.do/en/write-and-edit/styling/cards",
    "kind": "内容结构",
    "note": "卡片具有页面的内容能力，多种预览与尺寸承载不同内容。本轮拆分阅读、提醒行动和 AI 引用的内部结构，共享外部规则。"
  },
  {
    "id": "raycast-actions",
    "title": "Raycast · Contextual actions",
    "url": "https://www.raycast.com/blog/a-fresh-look-and-feel",
    "kind": "情境操作",
    "note": "操作根据当前对象出现，结果与快捷键位置稳定。本轮用于当前卡片工具和更多菜单，不引入常驻操作栏。"
  },
  {
    "id": "expandable-cards",
    "title": "Aceternity · Expandable Cards",
    "url": "https://ui.aceternity.com/components/expandable-card",
    "kind": "交互组件参考",
    "note": "观察列表/网格卡片展开为详情的连续关系。示例源码公开；本项目用 Web Animations API 独立实现，并未安装该 React 组件。"
  },
  {
    "id": "motion-expand",
    "title": "Motion · Expand card",
    "url": "https://motion.dev/ui/components/expand-card",
    "kind": "共享元素参考",
    "note": "观察外框与标题从卡片延续到详情的转场。此高级组件源码属于 Motion+；仅作行为研究，没有复制付费源码。"
  },
  {
    "id": "motion-swipe",
    "title": "Motion · Swipe actions",
    "url": "https://motion.dev/ui/components/swipe-actions",
    "kind": "后续手势研究",
    "note": "滑动揭示动作与跟手回弹的参考，源码属于 Motion+。本轮先提供可发现的提醒动作按钮，尚未实现横滑操作。"
  },
  {
    "id": "motion-js-layout",
    "title": "Motion · JavaScript layout",
    "url": "https://motion.dev/docs/layout-animations",
    "kind": "原生 JS 选型",
    "note": "Motion 也提供 animateLayout 与 data-layout-id；共享元素动效不要求立即迁移 React。本轮仍采用浏览器原生动画。"
  },
  {
    "id": "radix-popover",
    "title": "Radix · Popover",
    "url": "https://www.radix-ui.com/primitives/docs/components/popover",
    "kind": "轻编辑参考",
    "note": "研究触发点、面板定位、焦点恢复与碰撞处理。适合下一阶段可选时间/状态编辑；当前原生 dialog 和就地按钮保留。"
  },
  {
    "id": "react-aria-sheet",
    "title": "React Aria · Gesture Driven Sheet",
    "url": "https://react-aria.adobe.com/examples/sheet",
    "kind": "移动端参考",
    "note": "官方 React Aria + Motion 手势抽屉示例。本轮完成移动详情样式与关闭操作，拖动抽屉手势尚未实现。"
  },
  {
    "id": "apple-materials",
    "title": "Apple · Materials",
    "url": "https://developer.apple.com/design/human-interface-guidelines/materials",
    "kind": "官方设计",
    "note": "Liquid Glass 用于浮在内容之上的控件和导航；内容层保持清晰，不给每张卡片铺满玻璃。"
  },
  {
    "id": "apple-hig",
    "title": "Apple · Human Interface Guidelines",
    "url": "https://developer.apple.com/design/human-interface-guidelines/",
    "kind": "官方设计",
    "note": "作为层级、布局、可访问性和交互一致性的总入口。"
  },
  {
    "id": "apple-resources",
    "title": "Apple · Design Resources",
    "url": "https://developer.apple.com/design/resources/",
    "kind": "官方素材",
    "note": "官方 Figma / Sketch UI Kit 的入口；本项目仅链接，不重新分发官方设计文件。"
  },
  {
    "id": "apple-fonts",
    "title": "Apple · Fonts & Typography",
    "url": "https://developer.apple.com/fonts/",
    "kind": "字体",
    "note": "采用系统字体栈。Apple 设备使用本机系统字体；不在网页中打包或分发 SF 字体文件。"
  },
  {
    "id": "apple-motion",
    "title": "Apple · Motion",
    "url": "https://developer.apple.com/design/human-interface-guidelines/motion",
    "kind": "动效规范",
    "note": "动效服务于状态与空间关系，不持续播放无意义的动画。"
  },
  {
    "id": "apple-drag",
    "title": "Apple · Drag and drop",
    "url": "https://developer.apple.com/design/human-interface-guidelines/drag-and-drop",
    "kind": "交互规范",
    "note": "卡片拖入 AI 是复制引用，不是移动或删除原内容；有明确落点反馈和撤销。"
  },
  {
    "id": "apple-accessibility",
    "title": "Apple · Accessibility",
    "url": "https://developer.apple.com/design/human-interface-guidelines/accessibility",
    "kind": "无障碍",
    "note": "支持减少动态效果；不依靠颜色、动效或拖拽单独传达含义。"
  },
  {
    "id": "lucide",
    "title": "Lucide",
    "url": "https://lucide.dev/guide/react",
    "kind": "图标首选",
    "note": "正式 React 工程首选。统一线性图标，按需导入；本地原型用独立 SVG 图标适配层，不虚称已加载该包。"
  },
  {
    "id": "lucide-license",
    "title": "Lucide · License",
    "url": "https://lucide.dev/license",
    "kind": "许可",
    "note": "使用图标原文件时保留对应 ISC / MIT 许可与版权声明。"
  },
  {
    "id": "phosphor",
    "title": "Phosphor Icons",
    "url": "https://phosphoricons.com/",
    "kind": "图标备选",
    "note": "适合需要多种字重的系统。本项目不混用多个图标家族，以免笔画和比例不统一。"
  },
  {
    "id": "motion",
    "title": "Motion · Drag",
    "url": "https://motion.dev/docs/react-drag",
    "kind": "动效首选",
    "note": "正式 React 工程首选弹簧、手势与布局动画。Motion 的拖拽不等于完整投放系统，仍需实现命中检测与业务动作。"
  },
  {
    "id": "motion-accessibility",
    "title": "Motion · Accessibility",
    "url": "https://motion.dev/docs/react-accessibility",
    "kind": "动效规范",
    "note": "尊重系统 reduced motion；原型通过媒体查询在 CSS 和 JavaScript 两侧共同降级。"
  },
  {
    "id": "gsap",
    "title": "GSAP · Timeline",
    "url": "https://gsap.com/docs/v3/GSAP/Timeline/",
    "kind": "动效备选",
    "note": "适合复杂时间轴编排；这里主要是控件状态变化，暂不再引入第二套动效系统。"
  },
  {
    "id": "radix",
    "title": "Radix Primitives",
    "url": "https://www.radix-ui.com/primitives/docs",
    "kind": "组件首选",
    "note": "正式 React 工程使用无样式行为层，保留对玻璃外观的控制，不套用现成后台布局。"
  },
  {
    "id": "shadcn",
    "title": "shadcn/ui",
    "url": "https://ui.shadcn.com/docs",
    "kind": "源码组织",
    "note": "借鉴源码可组合、组件归项目所有的方式；不是把默认 shadcn 卡片和导航直接搬进页面。"
  },
  {
    "id": "drag-a11y",
    "title": "W3C · Dragging Movements",
    "url": "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
    "kind": "无障碍",
    "note": "拖拽必须有不需要拖拽的单指针替代操作。卡片和预览里的 AI 图标可完成相同行为。"
  },
  {
    "id": "waapi",
    "title": "MDN · Web Animations API",
    "url": "https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API",
    "kind": "原型实际使用",
    "note": "离线原型使用浏览器动画能力，封装为独立 MotionEngine；不依赖在线 CDN。"
  },
  {
    "id": "dialog",
    "title": "MDN · dialog",
    "url": "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog",
    "kind": "原型实际使用",
    "note": "预览、筛选与编辑器采用原生模态对话框；AI 采用非模态浮动对话区。"
  },
  {
    "id": "backdrop",
    "title": "MDN · backdrop-filter",
    "url": "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter",
    "kind": "原型实际使用",
    "note": "玻璃是 Web 上的视觉近似，而非调用 Apple 原生材质；不支持时回退到高不透明度表面。"
  }
];
