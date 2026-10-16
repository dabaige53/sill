import type { Card } from "../../../contracts/card.ts";

export function cardSource(card: Pick<Card, "sources">): string {
	return card.sources?.map((source) => source.name).join(" · ") || "";
}
export function cardSourceKind(card: Pick<Card, "sources">): string {
	return card.sources?.[0]?.kind || "local";
}
