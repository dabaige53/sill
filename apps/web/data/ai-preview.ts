// Design sample sessions for the AI conversation. Used only by the generated component preview
// and by the dev server's `?ai-preview` mode; production builds never load it, so the product
// never shows a session the AI did not have.
import { copy } from "../copy.ts";
import type { AIResult, AISession } from "./ai-conversation.ts";

type CardRef = { id: string; type: string; title: string };

export function previewSessions(cards: CardRef[], now = Date.now()): AISession[] {
	const of = (type: string, skip = 0) => cards.filter((c) => c.type === type)[skip] || cards[skip];
	const task = of("task");
	const reminder = of("reminder") || of("mail");
	const event = of("event");
	const mail = of("mail");
	const article = of("article");
	const result = (card: CardRef | undefined, change: string, state: AIResult["state"]) =>
		card ? [{ cardId: card.id, title: card.title, type: card.type, change, state }] : [];
	const hour = 3600000;
	return [
		{
			id: "preview-week",
			title: copy("ai.sample.weekTitle"),
			updatedAt: now - 60000,
			running: true,
			messages: [
				{
					id: "w1",
					role: "you",
					text: copy("ai.sample.weekAsk"),
					cards: [task?.id, mail?.id].filter(Boolean) as string[],
				},
				{
					id: "w2",
					role: "ai",
					text: copy("ai.sample.weekReply"),
					results: [
						...result(task, copy("ai.sample.changeDue"), "written"),
						...result(reminder, copy("ai.sample.changeReminder"), "written"),
						...result(event, copy("ai.sample.changeNote"), "running"),
					],
				},
				{ id: "w3", role: "you", text: copy("ai.sample.followAsk") },
				{ id: "w4", role: "ai", text: copy("ai.sample.followReply"), streaming: true },
			],
		},
		{
			id: "preview-read",
			title: copy("ai.sample.readTitle"),
			updatedAt: now - 5 * 60000,
			running: true,
			messages: [{ id: "r1", role: "you", text: copy("ai.sample.followAsk") }],
		},
		{
			id: "preview-prep",
			title: copy("ai.sample.prepTitle"),
			updatedAt: now - 2 * hour,
			running: false,
			messages: [
				{ id: "p1", role: "you", text: copy("ai.sample.prepAsk") },
				{
					id: "p2",
					role: "ai",
					text: copy("ai.sample.prepReply"),
					results: [
						...result(event, copy("ai.sample.changeTag"), "written"),
						...result(task, copy("ai.sample.changeTag"), "pending"),
						...result(article, copy("ai.sample.changeTag"), "failed"),
						...result(mail, copy("ai.sample.changeTag"), "unknown"),
					],
				},
			],
		},
		{
			id: "preview-sort",
			title: copy("ai.sample.sortTitle"),
			updatedAt: now - 26 * hour,
			running: false,
			messages: [],
		},
		{
			id: "preview-list",
			title: copy("ai.sample.listTitle"),
			updatedAt: now - 5 * 24 * hour,
			running: false,
			messages: [],
		},
	];
}
