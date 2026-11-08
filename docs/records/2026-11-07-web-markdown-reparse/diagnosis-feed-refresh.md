# Web 刷新单张卡片时逐张扫描卡片库

## 问题与状态

状态：已修复待验证（源码定位与合成数据测量确认）。最近检查：2026-11-08。

## 环境与触发

- Web/PWA，卡片较多的工作区。
- 触发：在信息流中收藏、标记已读、勾选任务等任何刷新单张卡片的操作。
- 预期：刷新开销与卡片总数近似无关。实际：开销随卡片数平方增长。

## 定位依据

- [app-feed.ts](../../../apps/web/views/app-feed.ts) `refreshCard()` 以保留模式重绘信息流；[feed.tsx](../../../apps/web/views/feed.tsx) 对快照中的每张卡调用 `Store.card(id)`，后者每次线性查找整个卡片库。
- 合成数据（Linux Node）：快照按信息流顺序（新卡在前，卡片库按创建时间正序），1200 张约 7.5ms、3000 张约 44ms；先建一次 id 查找表后约 0.3ms 与 0.5ms。

## 处理情况

`feedView()` 在保留模式下先建一次 id 查找表，再按快照顺序取卡。渲染结果与顺序不变。

## 验证与后续

- 回归 [search-state.test.ts](../../../tests/web/search-state.test.ts)「refreshing one card looks up the feed snapshot once instead of scanning the store per card」：123 张卡时旧实现查找 123 次而失败，当前少于 20 次。
- 同类未改：本地模式保存时 [local-sync.ts](../../../apps/web/services/local-sync.ts) `capture()` 对每条个人状态线性查找卡片；只影响本地开发模式。
