# 0055：Mac 导航与 AI 输入栏原生玻璃

日期：2026-10-21
状态：已接受

用户要求顶部控件与底部 AI 输入栏使用新版 macOS 玻璃效果。这两个位置允许使用原生 Liquid Glass，替代此前全局禁止原生玻璃的约束。

macOS 26 及以上使用 regular interactive glassEffect。搜索框与账户按钮共用 GlassEffectContainer；AI 栏使用单块玻璃。移除顶栏实底及这些控件的自绘玻璃填充、边框和阴影，保留搜索焦点环、拖入反馈、布局和操作。旧系统使用原有 Sill 玻璃。Web 不修改材质，保留一致的布局、文案与状态。

影响：DESIGN.md、设计手册 foundation/web-interaction、MacChrome 画板、Mac SearchField/TopBar/AIDock 和材质修饰器。原生材质使用系统参数，不新增模仿折射的设计变量。HTML 画板只说明布局，不能证明系统材质的实际效果。

原生玻璃范围扩展至阅读工具栏、全屏阅读右上按钮组、预览关闭与放大按钮、多选栏、刷新圆环、新内容提示和 Toast。预览右上按钮共用容器；单块胶囊的内部按钮不再铺玻璃。卡片、正文、设置、菜单及黑色工具提示保持现有表面。
