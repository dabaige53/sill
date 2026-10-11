# Quiet Glass · 交互验收报告

执行日期：2026-10-10。构建版本：0.1.0。

## 结果
16 项功能交互检查与 2 项全局检查均通过。另已对各模块执行 `node --check` 语法检查。
这不是 WCAG 认证、生产性能认证或跨浏览器兼容性认证。

## 实际测试环境
Chromium 144 / Playwright，同一份实际交付的内嵌 HTML、CSS、JavaScript。
桌面视口 1440 × 1000，模拟手机视口 390 × 844，并检查 320 px 窄屏与 reduced-motion。

执行环境禁止导航到本地 HTTP / file URL。因此通过 Playwright `page.set_content` 将完整构建 HTML
注入测试页面执行，未修改或绕过导航策略。这验证了页面脚本、DOM、样式与交互，但不是对实际
file:// 打开方式的导航测试。

about:blank 环境不提供可用的同源持久存储。本次状态恢复检查使用明确的内存 localStorage 替身；
它验证序列化与恢复逻辑，不代表已经验证真实浏览器文件来源下的持久存储策略。

模拟触屏使用 Chromium 的触点事件。没有真实 iPhone / iPad / Safari / VoiceOver 硬件测试。
未连接真实邮箱、日历或模型，也没有进行生产后端、网络错误、鉴权或推送验收。

## 功能记录

1. PASS — 默认仅卡片与玻璃入口；无溢出、常驻导航或筛选栏

2. PASS — 悬停显现纯图标工具，无按钮文案

3. PASS — 预览灰化与实际已读分离；全文进度、返回与 Escape

4. PASS — 收藏反馈与撤销

5. PASS — 标签、备注、转义与状态序列化恢复（存储替身）

6. PASS — 组合筛选、搜索、空状态与恢复

7. PASS — 拖拽取消不改变阅读状态或内容

8. PASS — 拖入 AI 保留原卡片；不自动发送；本地演示回复明确标注

9. PASS — 多选卡片整体拖入 AI

10. PASS — 拖到收藏接收区与撤销

11. PASS — 任务勾选、完成收拢与撤销

12. PASS — 刷新先缓存，确认后插入并保留滚动锚点

13. PASS — 模态焦点约束、键盘关闭与图标可访问名称

14. PASS — 390px 移动布局、底部面板与模拟触屏长按拖拽

15. PASS — 320px 布局、减少透明度与系统减少动态偏好

16. PASS — 组件实验室共享原子、进度演示、19项来源资料

17. PASS — JavaScript 页面错误

18. PASS — 页面运行时无外部网络请求

## 可复现命令
打开网页不需要安装任何第三方依赖。
运行这份测试脚本则需要 Python、Playwright 与可用的 Chromium；本环境使用 `/usr/bin/chromium`。

```sh
python3 scripts/build.py
python3 tests/verify.py
```

`tests/results.json` 是最终全量运行结果，`tests/final-run.log` 是对应输出。
可用 `TEST_ONLY=8,9,14` 选择指定测试；跳过项会明确记为 SKIP，不会被计为通过。

## 视觉检查
已检查桌面默认流、移动单列、组件实验室、预览、阅读和 AI 面板截图。
截图是实际网页渲染结果，不是再次生成的效果图。