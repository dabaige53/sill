/** Plausible synthetic content; every card passes the current public schema. */
import { Card } from "../../contracts/card.ts";

export const stressTime = Date.parse("2026-10-23T08:00:00Z");
const email = "bartholomew.fitzgerald@northwind-industries-holdings.example.com";
const filename = "IMG_20250914_183022_HDR_portrait_edited_edited.HEIC";
const url =
	"https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved";
const prose = `联系人：${email}\n\n项目资料：[${url}](${url})\n\n部署记录：\n\n\`\`\`text\n${url}\n\`\`\`\n\n${"本次评审检查标题、正文、引用和操作区域。阅读到这里应保持原来的位置，不能被浮层遮挡。\n\n".repeat(24)}`;

export function stressCards(mode = "worst"): Card[] {
	const cards: Record<string, unknown>[] = [
		{
			id: "stress-mail",
			type: "mail",
			title: "跨地区产品发布：请确认合规审阅与最终交付文件",
			sender: email,
			recipients: [email, "Jo"],
			body: prose,
			attachments: [{ name: filename, sizeBytes: 123456789, mimeType: "image/heic" }],
		},
		{
			id: "stress-article",
			type: "article",
			title: "Benachrichtigungseinstellungen",
			authors: [{ name: "Aleksandra Wiśniewska-Kowalczyk" }],
			publisher: { name: "Northwind Industries International Research and Engineering" },
			body: prose,
			image: "architecture",
			form: "image",
		},
		{
			id: "stress-task",
			type: "task",
			title: "发布验收：所有任务都能读到并操作",
			tasks: Array.from({ length: 100 }, (_, i) => ({
				id: `task-${i}`,
				text:
					i % 3 === 0
						? `核对 ${url}`
						: `第 ${i + 1} 项：请确认移动设备与桌面端的显示、操作结果及最终版本一致`,
				done: i % 4 === 0,
			})),
			body: prose,
		},
		{
			id: "stress-event",
			type: "event",
			title: "跨团队全球发布与安全审查联席会议",
			start: stressTime + 3600000,
			end: stressTime + 7200000,
			location: "Northwind International Engineering Campus — Building 12, Conference Room 1806",
			people: ["Aleksandra Wiśniewska-Kowalczyk", "Jo", "王秀英", "Đặng Thị Ngọc Hân"],
			meeting: {
				name: "Northwind Product Engineering Conference",
				url,
				code: "engineering-release-readiness-2026-10-23",
			},
			body: prose,
		},
		{
			id: "stress-note",
			type: "note",
			title: "J",
			summary: "👩🏽‍💻 Priya · Đặng Thị Ngọc Hân · نور الهدى عبد الرحمن",
			body: prose,
		},
		{
			id: "stress-file",
			type: "file",
			title: "审阅附件与文件版本",
			files: [
				{ name: filename, sizeBytes: 123456789 },
				{ name: "Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf", sizeBytes: 1284000 },
			],
			body: prose,
		},
		{
			id: "stress-podcast",
			type: "media",
			media: "podcast",
			title: "Platform Engineering: Designing Reliable Cross-Regional Infrastructure",
			duration: 86400,
			image: "coast",
			chapters: [
				{ start: 0, title: "跨地区工程团队与发布准备" },
				{ start: 120, title: "Benachrichtigungseinstellungen" },
			],
			transcript: [{ start: 0, text: prose }],
			body: prose,
		},
		{
			id: "stress-video",
			type: "media",
			media: "video",
			title: "移动设备上的布局与手势",
			image: "mountain",
			body: prose,
		},
		{
			id: "stress-digest",
			type: "digest",
			title: "发布摘要",
			points: [email, "对照每个环境的发布记录与评审结论", "Jo"],
			body: prose,
		},
		{
			id: "stress-suggestion",
			type: "suggestion",
			title: "整理同一主题的材料",
			related: ["stress-task", "stress-article"],
			body: prose,
		},
		{
			id: "stress-reminder",
			type: "reminder",
			title: "请向所有参与跨地区发布验收的同事确认最终材料与后续安排",
			due: stressTime + 7200000,
			body: prose,
		},
		{
			id: "stress-photo",
			type: "photo",
			title: "现场照片",
			photos: ["coast", "mountain", "architecture"],
			caption: "👩🏽‍💻 Priya 与团队的工作记录",
			body: prose,
		},
		{
			id: "stress-pr",
			type: "pr",
			title: "为跨地区产品发布提供统一审核与通知",
			pullRequest: {
				repository: "northwind-industries/platform-infrastructure",
				number: 1284,
				state: "open",
				observedAt: "2026-10-23T08:00:00Z",
				headBranch: "feature/enterprise-onboarding-notification-preferences",
				baseBranch: "main",
				additions: 123456,
				deletions: 98765,
				changedFiles: 1284,
				files: [
					{
						path: "packages/platform-infrastructure/src/customer-onboarding/notification-preferences.ts",
						additions: 123456,
						deletions: 98765,
					},
				],
			},
			body: prose,
		},
	];
	const worst = cards.map((card, i) =>
		Card.parse({
			sources: [
				{
					name: i === 0 ? "Northwind International Research and Engineering" : "演示工作区",
					kind: "agent",
				},
			],
			time: stressTime - i * 60000,
			summary: `发布资料：${url}`,
			tags: ["customer-feedback-from-enterprise-onboarding", "评审", "👩🏽‍💻"],
			...card,
		}),
	);
	if (mode === "empty") return [];
	if (mode === "one") return [Card.parse({ id: "one", type: "note", title: "J" })];
	if (mode === "huge")
		return Array.from({ length: 1000 }, (_, i) =>
			Card.parse({
				id: `bulk-${i}`,
				type: "note",
				title: `评审记录 ${i + 1}`,
				summary: "合成数据，用于检查大量卡片加载。",
				body: "完整记录。",
				time: stressTime - i * 60000,
			}),
		);
	if (mode === "demo")
		return worst.map((card) =>
			Card.parse({
				...card,
				title: `演示 ${card.type}`,
				sender: card.sender ? "Jo" : undefined,
				summary: "一条简短的摘要。",
				tags: ["评审"],
				body: "简短的正文。",
				tasks: card.tasks?.slice(0, 3).map((task) => ({ ...task, text: "核对发布材料" })),
				location: card.location ? "会议室" : undefined,
				recipients: card.recipients ? ["Jo"] : undefined,
			}),
		);
	return worst;
}
