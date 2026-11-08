# 手机抽屉 touchCancel 用例偶发失败

## 问题与状态

状态：待定位，未修复。最近检查：2026-11-08。

## 环境与触发

- 入口：`tests/e2e/motion-material-browser-material-focus.ts` 的 `Real touchCancel keeps the drawer open without writing`，在 `web / browser (motion)` 中运行。
- 报错原文：`cancel restores the drawer position`。
- 目前无法按需复现，只在 CI 中偶发。

## 定位依据

- 观察：提交 `1edf92dd` 在 main 的 CI `42456708361` 和发布流程第 2 轮都通过，只有发布流程第 1 轮失败，代码相同。
- 观察：1.2.35 的正式流程 `41975795539` 也因同一用例失败过。
- 推测，未证实：用例打开卡片和触发取消后都固定等待 600ms，再比较抽屉位置；慢机器上动画可能还没结束。

## 处理情况

只在同一 tag 上重跑失败任务，没有改测试或产品代码。

## 验证与后续

下一步：记录失败时的实际位置差，确认是否为动画未结束。如果确认，把固定等待改为等位置稳定；如果不是，检查取消手势后的抽屉复位逻辑。
