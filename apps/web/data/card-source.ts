import type { Card } from "../../../contracts/card.ts";
import { shortDay, timeString } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";

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

/** Compact, local-time label for the source row, retaining the timestamp in the data. */
export function detailDate(value: unknown, includeTime = false, now = Date.now()): string {
	const parsed = cardDate(value);
	if (!parsed) return "";
	const date = new Date(
		parsed.datetime.length === 10 ? `${parsed.datetime}T00:00:00` : parsed.datetime,
	);
	const day = shortDay(date.getTime(), now);
	return includeTime && parsed.datetime.length > 10 ? `${day} ${timeString(date.getTime())}` : day;
}

export function cardDates(card: Record<string, any>) {
	return {
		published: cardDate(card.publishedAt),
		saved: cardDate(card.savedAt),
		created: cardDate(card.created_at),
		updated: cardDate(card.updated_at),
	};
}

/** A content date as a local moment: a bare day is that local day, a timestamp is an instant. */
export function contentDay(value: unknown): Date | null {
	const date = cardDate(value);
	if (!date) return null;
	return new Date(date.datetime.length === 10 ? `${date.datetime}T00:00:00` : date.datetime);
}

/** The day an article belongs to: published, else saved, else the card's own time. */
export function articleDate(card: Record<string, any>): Date | null {
	const day = contentDay(card.publishedAt) || contentDay(card.savedAt);
	if (day) return day;
	return typeof card.time === "number" ? new Date(card.time) : null;
}

export function detailSource(card: Pick<Card, "sources">): string {
	return [
		...new Set((card.sources || []).map((source) => source.name.trim()).filter(Boolean)),
	].join(" · ");
}

/** All surfaces format explicit estimates identically; no text inference. */
export function cardReadingTime(card: Pick<Card, "readingEstimate">): string {
	const estimate = card.readingEstimate;
	return estimate
		? `${copy(estimate.scope === "full" ? "web.metadata.readingFull" : "web.metadata.readingAvailable")} ${Math.ceil(estimate.seconds / 60)} ${copy("web.metadata.readingSuffix")}`
		: "";
}

export function fileDescription(file: NonNullable<Card["files"]>[number]): string {
	const bytes = file.sizeBytes;
	const size =
		bytes === undefined
			? ""
			: bytes < 1024
				? `${bytes} B`
				: bytes < 1048576
					? `${(bytes / 1024).toFixed(1)} KB`
					: `${(bytes / 1048576).toFixed(1)} MB`;
	const extension = file.name?.split(".").at(-1);
	const kind =
		extension && extension !== file.name
			? extension.toUpperCase()
			: file.mimeType?.split("/").at(-1);
	return [kind, size].filter(Boolean).join(" · ");
}
