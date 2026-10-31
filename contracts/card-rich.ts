import { z } from "zod/v4";

// Keep minute precision accepted before the Zod update, without changing stored timestamps.
const minuteTime = z.regexes.datetime({ offset: true, precision: -1 });
const secondTime = z.regexes.datetime({ offset: true });
const offsetDateTime = z
	.string()
	.regex(new RegExp(`(?:${minuteTime.source})|(?:${secondTime.source})`));

const url = z
	.string()
	.url()
	.regex(/^https?:[/][/].+$/);
const label = z.string().trim().min(1).max(300);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const person = z.object({ login: label, url: url.optional() }).strict();
export const richCardFields = {
	audioUrl: url
		.optional()
		.describe("Podcast audio URL, read only during playback. Not an acquisition or sync source."),
	chapters: z
		.array(
			z
				.object({ start: z.number().min(0).max(86400), title: z.string().trim().min(1).max(500) })
				.strict(),
		)
		.max(10000)
		.optional()
		.describe(
			"Media only: {start,title} chapters, with start in seconds, strictly increasing and within known duration. Never invent timestamps.",
		),
	transcript: z
		.array(
			z
				.object({ start: z.number().min(0).max(86400), text: z.string().trim().min(1).max(20000) })
				.strict(),
		)
		.max(10000)
		.optional()
		.describe(
			"Media only: actual timestamped transcript {start,text}; start in seconds, strictly increasing and within known duration. Ordinary notes belong in body.",
		),
	pullRequest: z
		.object({
			repository: z
				.string()
				.regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
				.max(300),
			number: count.min(1),
			state: z.enum(["draft", "open", "merged", "closed"]),
			observedAt: offsetDateTime,
			headBranch: label.optional(),
			baseBranch: label.optional(),
			reviewers: z
				.array(
					person.extend({
						decision: z.enum(["pending", "approved", "changesRequested", "commented", "dismissed"]),
					}),
				)
				.max(100)
				.optional(),
			checks: z
				.array(
					z
						.object({
							name: label,
							status: z.enum(["queued", "inProgress", "completed"]),
							conclusion: z
								.enum([
									"success",
									"failure",
									"neutral",
									"cancelled",
									"skipped",
									"timedOut",
									"actionRequired",
									"stale",
								])
								.optional(),
							url: url.optional(),
						})
						.strict(),
				)
				.max(1000)
				.optional(),
			additions: count.optional(),
			deletions: count.optional(),
			changedFiles: count.optional(),
			reviewRequested: z.boolean().optional(),
		})
		.strict()
		.optional()
		.describe(
			"Required for type=pr only: repository (owner/repo), positive number, state and observedAt (offset ISO datetime). Optional branches, reviewers, checks and statistics reflect observed evidence. Only completed checks may have conclusion. Omit unknown counts, retain known zeros. Never presented as live GitHub state.",
		),
};

export function richCardIssues(card: Record<string, any>): string[] {
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
