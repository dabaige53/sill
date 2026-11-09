# 手机抽屉 touchCancel 用例偶发失败

## 问题与状态

状态：用例等待方式已改写，待验证；偶发失败根因仍待确认。最近检查：2026-11-09。

## 环境与触发

- 入口：`tests/e2e/motion-material-browser-material-focus.ts` 的 touchCancel 场景，在 `web / browser (motion)` 中运行。原名称为 `Real touchCancel keeps the drawer open without writing`。
- 报错原文：`cancel restores the drawer position`。
- 目前无法按需复现，只在 CI 中偶发。

## 定位依据

- 观察：提交 `1edf92dd` 在 main 的 CI `42456708361` 和发布流程第 2 轮都通过，只有发布流程第 1 轮失败，代码相同。
- 观察：1.2.35 的正式流程 `41975795539` 也因同一用例失败过。
- 推测，未证实：用例打开卡片和触发取消后都固定等待 600ms，再比较抽屉位置；慢机器上动画可能还没结束。

## 处理情况

- 发布时只在同一 tag 上重跑失败任务，没有修改代码。
- 2026-11-09：用例改为等待抽屉进入视口且自身动画结束后采样起点；确认真实触摸已使抽屉发生位移，再发送取消事件；等待抽屉回到原位且动画结束后检查结果。删除两次固定 600ms 等待，保留原位误差小于 2px 的断言。
- 补充取消前后已保存内容一致的检查，场景名称调整为 `Real touchCancel restores the open drawer without changing saved content`。未修改产品手势处理。

## 验证与后续

本轮仅完成源码改写，未运行浏览器或 CI，不能将本次修改视为偶发失败已经消除。下一步在授权范围内运行该场景；若真实拖动或回位条件超时，记录实际位置、动画与弹窗状态，继续检查取消手势后的复位逻辑。
