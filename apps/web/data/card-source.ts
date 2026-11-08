import type { Card } from "../../../contracts/card.ts";
import recipes from "../../../design-system/recipes.json" with { type: "json" };
import { markdownText } from "../atoms/markdown.ts";
import { shortDay, timeString } from "../atoms/primitives.ts";
import { textMemo } from "../atoms/text-memo.ts";
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

/** The time the card entered Sill: the stored creation time, else the feed time. */
function addedValue(card: Record<string, any>): unknown {
	return cardDate(card.created_at) ? card.created_at : card.time;
}

/** One date choice for the card and its detail. Source dates never become insertion dates. */
export function cardDateLabel(card: Record<string, any>): string {
	if (cardDate(card.publishedAt)) return detailDate(card.publishedAt, card.type === "mail");
	return detailDate(addedValue(card), true);
}

/** The label's date and whether it is the time the card entered Sill rather than a content date. */
export function cardDateSource(card: Record<string, any>) {
	const published = cardDate(card.publishedAt);
	return published
		? { date: published, added: false }
		: { date: cardDate(addedValue(card)), added: true };
}

/** Bound only the face text. The stored summary and detail retain every character. */
export function cardSummaryText(text: string): string {
	const characters = Array.from(text.trim());
	const limit = recipes.content.summaryCharacters;
	return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : text.trim();
}

export function cardDates(card: Record<string, any>) {
	return {
		published: cardDate(card.publishedAt),
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

/** The day an article belongs to: published, else the card's own time. */
export function articleDate(card: Record<string, any>): Date | null {
	const day = contentDay(card.publishedAt);
	if (day) return day;
	return typeof card.time === "number" ? new Date(card.time) : null;
}

export function detailSource(card: Pick<Card, "sources">): string {
	return [
		...new Set((card.sources || []).map((source) => source.name.trim()).filter(Boolean)),
	].join(" · ");
}

const readingTypes = ["article", "digest"];

/** Every card face shows its reading time; the count runs once per body, not once per render. */
const bodyMinutes = textMemo((body: string) => {
	const text = markdownText(body);
	const han = text.match(/\p{Script=Han}/gu)?.length || 0;
	const words =
		text.replace(/\p{Script=Han}/gu, " ").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ||
		0;
	return Math.ceil(han / 400 + words / 200);
});

/** Minutes to read a Markdown body: 400 Chinese characters or 200 English words per minute (ADR 0086). */
export function readingMinutes(body: string | undefined): number {
	return body ? bodyMinutes(body) : 0;
}

type SearchFields = Pick<Card, "title" | "summary" | "body" | "sources" | "tags">;
type SearchEntry = SearchFields & { note: string; text: string };
const searchEntries = new WeakMap<object, SearchEntry>();

/**
 * Lowercased title, summary, source, note, body text and tags (Mac `CardModel.searchText`).
 * Kept per card object and rebuilt when one of those fields or the note changes, so typing a
 * query compares text instead of parsing every body again.
 */
export function cardSearchText(card: SearchFields, note = ""): string {
	const entry = searchEntries.get(card);
	if (
		entry &&
		entry.note === note &&
		entry.title === card.title &&
		entry.summary === card.summary &&
		entry.body === card.body &&
		entry.sources === card.sources &&
		entry.tags === card.tags
	)
		return entry.text;
	const text = [
		card.title,
		card.summary,
		cardSource(card),
		note,
		markdownText(card.body || ""),
		...(card.tags || []),
	]
		.join(" ")
		.toLocaleLowerCase();
	searchEntries.set(card, {
		title: card.title,
		summary: card.summary,
		body: card.body,
		sources: card.sources,
		tags: card.tags,
		note,
		text,
	});
	return text;
}

/** Every surface shows the same estimate, calculated from the body. */
export function cardReadingTime(card: { type?: string; body?: string }): string {
	const minutes = readingTypes.includes(card.type) ? readingMinutes(card.body) : 0;
	return minutes
		? `${copy("web.metadata.readingFull")} ${minutes} ${copy("web.metadata.readingSuffix")}`
		: "";
}

/** The cover is the first image; photo cards show all of them. */
export function cardCover(card: { images?: string[] }): string | undefined {
	return card.images?.[0];
}

/** Mail shows its first author as the sender. */
export function cardSender(card: { authors?: { name: string }[] }): string {
	return card.authors?.[0]?.name.trim() || "";
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
