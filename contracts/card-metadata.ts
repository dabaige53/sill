import type { Card } from "./card.ts";

const textTypes = ["article", "note", "mail", "digest", "suggestion", "file"];
const creatorTypes = [...textTypes, "media"];
const allowedTypes: Record<string, string[]> = {
	authors: creatorTypes,
	publisher: creatorTypes,
	bodyCoverage: textTypes,
	readingEstimate: textTypes,
	section: ["article"],
	sentAt: ["mail"],
	recipients: ["mail"],
	project: ["task", "reminder"],
	timeZone: ["event"],
	chapterCount: ["media"],
	takenAt: ["photo"],
	caption: ["photo"],
	coverageStart: ["digest"],
	coverageEnd: ["digest"],
};

/** Dates retain their precision; a date-only value never gains an invented time. */
export function validContentDate(value: unknown, timeRequired = false): boolean {
	if (typeof value !== "string") return false;
	const day = value.slice(0, 10);
	const date = new Date(`${day}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== day
	)
		return false;
	if (value === day) return !timeRequired;
	if (
		!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
			value,
		)
	)
		return false;
	return Number.isFinite(Date.parse(value));
}

/** Cross-field rules shared by local, HTTP, MCP and the browser write validator. */
export function metadataIssues(card: Card): string[] {
	const issues: string[] = [];
	if (Object.hasOwn(card, "meta")) issues.push("deprecated_meta");
	for (const [field, types] of Object.entries(allowedTypes)) {
		if (card[field] !== undefined && !types.includes(card.type))
			issues.push(`invalid_${field}_type`);
	}
	for (const field of ["publishedAt", "modifiedAt", "savedAt", "takenAt", "sentAt"]) {
		if (card[field] !== undefined && !validContentDate(card[field], field === "sentAt"))
			issues.push(`invalid_${field}`);
	}
	for (const file of card.files || []) {
		if (Object.hasOwn(file, "meta") || Object.hasOwn(file, "time"))
			issues.push("deprecated_file_metadata");
		if (file.modifiedAt !== undefined && !validContentDate(file.modifiedAt))
			issues.push("invalid_file_modifiedAt");
	}
	if (card.timeZone !== undefined) {
		try {
			if (/^[+-]/.test(card.timeZone)) throw new Error("invalid_timeZone");
			new Intl.DateTimeFormat("en", { timeZone: card.timeZone });
		} catch {
			issues.push("invalid_timeZone");
		}
	}
	if (card.readingEstimate?.origin === "calculated") {
		if (!card.readingEstimate.method?.trim()) issues.push("missing_reading_method");
		if (!card.body?.trim() || !card.bodyCoverage || card.bodyCoverage === "none")
			issues.push("missing_reading_body");
		if (card.readingEstimate.scope === "full" && card.bodyCoverage !== "full")
			issues.push("incomplete_reading_body");
	}
	if (card.bodyCoverage === "none" && card.body?.trim()) issues.push("unexpected_body");
	if (card.coverageStart !== undefined || card.coverageEnd !== undefined) {
		if (!(card.coverageStart !== undefined && card.coverageEnd > card.coverageStart))
			issues.push("invalid_coverage_range");
	}
	return issues;
}
