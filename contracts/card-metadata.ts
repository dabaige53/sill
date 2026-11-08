import type { Card } from "./card.ts";

const allowedTypes: Record<string, string[]> = {
	authors: ["article", "note", "mail", "media", "digest", "suggestion", "file"],
	project: ["task", "reminder"],
	people: ["event"],
	form: ["note"],
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

/** Media and PR field rules; card-rich.ts keeps their zod shapes so the browser need not load zod. */
function richCardIssues(card: Record<string, any>): string[] {
	const issues: string[] = [];
	if (card.audioUrl !== undefined && (card.type !== "media" || card.media !== "podcast"))
		issues.push("invalid_audioUrl_type");
	if (card.pullRequest !== undefined && card.type !== "pr") issues.push("invalid_pullRequest_type");
	if (card.type === "pr" && !card.pullRequest) issues.push("missing_pullRequest");
	for (const field of ["chapters", "transcript"]) {
		if (card[field] !== undefined && card.type !== "media") issues.push(`invalid_${field}_type`);
		const entries = card[field] || [];
		if (
			entries.some(
				(entry: any, index: number) =>
					(index > 0 && entry.start <= entries[index - 1].start) ||
					(card.duration !== undefined && entry.start > card.duration),
			)
		)
			issues.push(`invalid_${field}_time`);
	}
	if (
		card.pullRequest?.checks?.some(
			(check: any) => check.conclusion !== undefined && check.status !== "completed",
		)
	)
		issues.push("invalid_check_conclusion");
	return issues;
}

/** Cross-field rules shared by local, HTTP, MCP and the browser write validator. */
export function metadataIssues(card: Card): string[] {
	const issues: string[] = richCardIssues(card);
	for (const [field, types] of Object.entries(allowedTypes)) {
		if (card[field] !== undefined && !types.includes(card.type))
			issues.push(`invalid_${field}_type`);
	}
	if (card.publishedAt !== undefined && !validContentDate(card.publishedAt))
		issues.push("invalid_publishedAt");
	for (const file of card.files || []) {
		if (file.modifiedAt !== undefined && !validContentDate(file.modifiedAt))
			issues.push("invalid_file_modifiedAt");
	}
	return issues;
}
