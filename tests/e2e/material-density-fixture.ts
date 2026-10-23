/** Synthetic review content. No connected service, account or live data is read. */
export const reviewTime = Date.parse("2026-10-17T09:00:00Z");
export function materialDensityCards(now = reviewTime) {
	const source = [{ name: "演示工作区", kind: "agent" }];
	return [
		{
			id: "review-digest",
			type: "digest",
			title: "产品评审：把下一步放到眼前",
			summary: "本次关注可读性、交互连续性与助手交接。先把信息说清，再让界面安静下来。",
			points: [
				"保留助手写入的结论，不用全局统计替换当前卡片的内容。",
				"让未完成的事项先出现，已完成的事项仍可在详情中查看。",
				"ReferenceWithoutSpaces".repeat(7),
			],
			body: [
				"这是一组用于界面验收的合成内容。摘要范围仅限本次产品评审，不代表当前工作区的阅读、收藏或完成数量。",
				"详情需要保留全部要点与正文。长中文、连续英文以及更小的屏幕都不应造成文字被省略或页面横向溢出。",
			].join("\n\n"),
			tags: ["产品", "评审"],
		},
		{
			id: "review-task",
			type: "task",
			title: "下一轮发布前，收好这些细节",
			tasks: [
				{ id: "done-a", text: "梳理现有卡片类型", done: true },
				{ id: "done-b", text: "确认底部工具条方向", done: true },
				{ id: "done-c", text: "保留助手写入边界", done: true },
				{
					id: "next-a",
					text: "验证键盘能找回收起的工具条，并且在关闭卡片详情以后仍然能够继续操作下一张卡片",
					done: false,
				},
				{ id: "next-b", text: "检查手机上的完整要点与手势取消", done: false },
			],
			tags: ["待办"],
		},
		{
			id: "review-article",
			authors: [{ name: "研究作者" }],
			publisher: { name: "设计周刊" },
			publishedAt: "2026-10-17",
			type: "article",
			title: "让内容成为视线的落点",
			image: "architecture",
			form: "image",
			summary: "信息卡片保持稳定的实色表面。玻璃承载导航和轻操作，让内容与工具之间有明确的层次。",
			body: "通过更合适的阅读宽度，标题与摘要能组成稳定的节奏。留白用于分组，操作在需要时出现。",
			readingEstimate: { seconds: 240, origin: "provided", scope: "full" },
			bodyCoverage: "full",
			tags: ["设计"],
		},
		{
			id: "review-note",
			type: "note",
			title: "密度也需要层次",
			summary:
				"卡片让人先看懂，再决定要不要打开。紧凑视图减少预览行数，标准视图保留上下文，详情负责承载完整内容。长一点的摘要能验证截断是否只发生在卡面。",
			body: "不同密度可以改变列宽与摘要行数，但不应该删除原始数据。",
			tags: ["想法"],
		},
		{
			id: "review-event",
			type: "event",
			title: "一起检查交互中的边界",
			start: now + 3600000,
			end: now + 6300000,
			location: "线上评审室",
			summary: "从打开一张卡片，到拖动取消、返回与继续阅读。",
			people: ["小林", "小周"],
			body: "使用合成卡片检查，不访问真实日历或会议。",
			tags: ["评审"],
		},
		{
			id: "review-reminder",
			type: "reminder",
			title: "给助手一个明确的交接点",
			summary: "打开卡片后，可把当前卡片交给支持的宿主讨论。独立网页不显示交接入口。",
			due: now + 7200000,
			tags: ["下一步"],
		},
		{
			id: "review-suggestion",
			type: "suggestion",
			title: "把有关联的发现放在一起",
			summary: "内容可信、任务可见与控制层清晰，是这轮改进的三个落点。",
			related: ["review-digest", "review-task"],
			tags: ["关联"],
		},
		{
			id: "review-note-2",
			type: "note",
			title: "收起之后，仍然能继续",
			summary: "减少动态效果时保留清楚的状态转换；取消一个手势后，页面应该回到可操作的状态。",
			body: "动画不仅是进入时的一瞬间，也包括中断与恢复。",
			tags: ["交互"],
		},
		{
			id: "review-file",
			type: "file",
			title: "这一轮的评审材料",
			files: [{ name: "界面验收记录.pdf", type: "PDF", size: "240 KB" }],
			summary: "演示文件列表，仅用于布局与阅读检查。",
			tags: ["资料"],
		},
	].map((card, index) => ({ ...card, sources: source, time: now - index * 60000 }));
}
