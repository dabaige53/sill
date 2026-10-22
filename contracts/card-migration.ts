import { copy } from "../design-system/copy.ts";
import type { Card } from "./card.ts";

export function normalizeCard(input: Card): Card {
	const card = structuredClone(input);
	const sources = (card.sources ?? []).map((source) => ({
		...source,
		kind: source.kind === "ai" ? "agent" : source.kind,
	}));
	if (typeof card.source === "string" && card.source && card.type !== "mail") {
		const kind = card.kind === "ai" ? "agent" : typeof card.kind === "string" ? card.kind : "local";
		if (!sources.some((source) => source.name === card.source && source.kind === kind))
			sources.push({ name: card.source, kind });
	} else if (card.type === "mail" && card.sender === undefined && typeof card.source === "string") {
		card.sender = card.source;
	}
	if (!sources.length && typeof card.kind === "string")
		sources.push({
			name:
				card.kind === "ai"
					? copy("web.agent")
					: card.type === "mail"
						? copy("web.mail")
						: card.kind,
			kind: card.kind === "ai" ? "agent" : card.kind,
		});
	if (sources.length || card.sources) card.sources = sources;
	delete card.source;
	delete card.kind;
	const legacy = card as Card & { body?: unknown; points?: unknown };
	const paragraphs = Array.isArray(legacy.body)
		? legacy.body.filter((part) => typeof part === "string" && part.trim()).join("\n\n")
		: legacy.body;
	const points = Array.isArray(legacy.points)
		? legacy.points.map((point, index) => `${index + 1}. ${point}`).join("\n")
		: "";
	if (Array.isArray(legacy.body) || points) {
		const body = [points, paragraphs]
			.filter((part) => typeof part === "string" && part.trim())
			.join("\n\n");
		if (body) card.body = body;
		else delete card.body;
	}
	delete legacy.points;
	return card;
}
