import type { Card } from "../../../contracts/card.ts";

export function cardSource(card: Pick<Card, "sources">): string {
	return card.sources?.map((source) => source.name).join(" · ") || "";
}
export function cardSourceKind(card: Pick<Card, "sources">): string {
	return card.sources?.[0]?.kind || "local";
}

/** Presentation only: never infer publication or insertion from the generic feed time. */
export function cardDate(value: unknown): { datetime: string; text: string } | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	if (typeof value === "string") {
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			const date = new Date(`${value}T00:00:00Z`);
			return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
				? { datetime: value, text: value }
				: null;
		}
		// Offset-less timestamps are ambiguous. Do not silently assume the device's zone.
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
			return null;
	}
	if (typeof value === "number" && value < 0) return null;
	if (typeof value === "string") {
		const day = value.slice(0, 10);
		const check = new Date(`${day}T00:00:00Z`);
		if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== day) return null;
	}
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	const pad = (n: number) => String(n).padStart(2, "0");
	const offset = -date.getTimezoneOffset();
	const zone = `UTC${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	return {
		datetime: date.toISOString(),
		text: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${zone}`,
	};
}

export function cardDates(card: Record<string, any>) {
	return {
		published: cardDate(card.published_at ?? card.publishedAt),
		saved: cardDate(card.saved_at ?? card.savedAt),
		created: cardDate(card.created_at),
		updated: cardDate(card.updated_at),
	};
}

export function detailSource(card: Pick<Card, "sources">): string {
	return [
		...new Set((card.sources || []).map((source) => source.name.trim()).filter(Boolean)),
	].join(" · ");
}
