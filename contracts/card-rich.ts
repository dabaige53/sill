import { z } from "zod/v4";

const url = z
	.string()
	.url()
	.regex(/^https?:\/\//);
const label = z.string().trim().min(1).max(300);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const person = z.object({ login: label, url: url.optional() }).passthrough();
export const Attachment = z
	.object({
		name: label,
		url: url.optional(),
		mimeType: z
			.string()
			.min(3)
			.max(200)
			.regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/)
			.optional(),
		sizeBytes: count.optional(),
	})
	.passthrough();
export const richCardFields = {
	audioUrl: url
		.optional()
		.describe("Podcast audio URL, read only during playback. Not an acquisition or sync source."),
	chapters: z
		.array(
			z
				.object({ start: z.number().min(0).max(86400), title: z.string().trim().min(1).max(500) })
				.passthrough(),
		)
		.max(10000)
		.optional()
		.describe(
			"Media only: {start,title} chapters, with start in seconds, strictly increasing and within known duration. Count must not exceed chapterCount. Never invent timestamps.",
		),
	transcript: z
		.array(
			z
				.object({ start: z.number().min(0).max(86400), text: z.string().trim().min(1).max(20000) })
				.passthrough(),
		)
		.max(10000)
		.optional()
		.describe(
			"Media only: actual timestamped transcript {start,text}; start in seconds, strictly increasing and within known duration. Ordinary notes belong in body.",
		),
	attachments: z
		.array(Attachment)
		.max(200)
		.optional()
		.describe(
			"Mail only: actual attachments {name,url?,mimeType?,sizeBytes?}; no binary or base64. An explicit [] clears the list and overrides the legacy attachment label.",
		),
	pullRequest: z
		.object({
			repository: z
				.string()
				.regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
				.max(300),
			number: count.min(1),
			state: z.enum(["draft", "open", "merged", "closed"]),
			observedAt: z.string().datetime({ offset: true }),
			headBranch: label.optional(),
			baseBranch: label.optional(),
			author: person.optional(),
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
						.passthrough(),
				)
				.max(1000)
				.optional(),
			additions: count.optional(),
			deletions: count.optional(),
			changedFiles: count.optional(),
			comments: count.optional(),
			reviewRequested: z.boolean().optional(),
			files: z
				.array(
					z
						.object({
							path: z.string().trim().min(1).max(2000),
							additions: count.optional(),
							deletions: count.optional(),
						})
						.passthrough(),
				)
				.max(3000)
				.optional(),
		})
		.passthrough()
		.optional()
		.describe(
			"Required for type=pr only: repository (owner/repo), positive number, state and observedAt (offset ISO datetime). Optional branches, author, reviewers, checks, statistics and files reflect observed evidence. Only completed checks may have conclusion; listed files cannot exceed known changedFiles. Omit unknown counts, retain known zeros. Never presented as live GitHub state.",
		),
};

export function richCardIssues(card: Record<string, any>): string[] {
	const issues: string[] = [];
	if (card.audioUrl !== undefined && (card.type !== "media" || card.media !== "podcast"))
		issues.push("invalid_audioUrl_type");
	if (card.attachments !== undefined && card.type !== "mail")
		issues.push("invalid_attachments_type");
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
	if (card.chapterCount !== undefined && card.chapters?.length > card.chapterCount)
		issues.push("invalid_chapterCount");
	if (
		card.pullRequest?.checks?.some(
			(check: any) => check.conclusion !== undefined && check.status !== "completed",
		)
	)
		issues.push("invalid_check_conclusion");
	if (
		card.pullRequest?.changedFiles !== undefined &&
		card.pullRequest.files?.length > card.pullRequest.changedFiles
	)
		issues.push("invalid_changedFiles");
	return issues;
}
