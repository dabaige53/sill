import { z } from "zod/v4";
import { richCardFields } from "./card-rich.ts";
import { cardIssues } from "./card-rules.ts";

export const contractVersion = "4.2.0";
export const cardTypes = [
	"article",
	"pr",
	"mail",
	"note",
	"task",
	"event",
	"reminder",
	"media",
	"digest",
	"suggestion",
	"photo",
	"file",
] as const;
export const sourceKinds = [
	"rss",
	"readwise",
	"youtube",
	"twitter",
	"podcast",
	"web",
	"mail",
	"calendar",
	"reminders",
	"photos",
	"folder",
	"linear",
	"github",
	"capture",
	"markdown",
	"local",
	"agent",
] as const;
export const id = z
	.string()
	.regex(/^[a-zA-Z0-9_-]{1,100}$/)
	.refine((value) => !["__proto__", "constructor", "prototype"].includes(value), "invalid_id");
export const timestamp = z.number().finite().min(0).max(8.64e15);
export const httpUrl = z
	.string()
	.url()
	.regex(/^https?:\/\//);
const strings = z.array(z.string().max(100)).max(100);
const image = z
	.string()
	.max(8192)
	.regex(/^(?:(?:architecture|coast|mountain|botanical)$|https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$)/)
	.refine((value) => {
		if (!value.startsWith("https://")) return true;
		try {
			const url = new URL(value);
			return !!url.hostname && !url.username && !url.password;
		} catch {
			return false;
		}
	}, "invalid_image");
export const SourceReference = z
	.object({ name: z.string().min(1).max(300), kind: z.string().min(1).max(100) })
	.passthrough();
const namedParty = z
	.object({ name: z.string().trim().min(1).max(300), url: httpUrl.optional() })
	.passthrough();
const contentDate = z
	.string()
	.min(10)
	.max(40)
	.regex(
		/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/,
	);
export const Card = z
	.object({
		...richCardFields,
		id,
		type: z.string().min(1).max(100),
		title: z.string().min(1).max(1000),
		summary: z
			.string()
			.max(10000)
			.optional()
			.describe(
				"Card face summary: one or two plain-text sentences for the feed card and search results. Not shown in the detail; put all detail text in body.",
			),
		authors: z
			.array(namedParty)
			.max(20)
			.optional()
			.describe("Original content authors, not sources or the agent writing this card."),
		publisher: namedParty
			.optional()
			.describe("Original publisher, separate from authors and acquisition sources."),
		publishedAt: contentDate
			.optional()
			.describe("Original publication date or offset datetime. Preserve date-only precision."),
		modifiedAt: contentDate
			.optional()
			.describe("Original content modification date, not the Sill updated_at timestamp."),
		savedAt: contentDate
			.optional()
			.describe("Save date in the external source, not Sill created_at or personal addedAt."),
		bodyCoverage: z
			.enum(["full", "excerpt", "summary", "none"])
			.optional()
			.describe(
				"Coverage of the saved body. Never estimate the entire article from an excerpt or summary.",
			),
		readingEstimate: z
			.object({
				seconds: z.number().int().min(1).max(31536000),
				origin: z.enum(["provided", "calculated"]),
				scope: z.enum(["full", "available"]),
				method: z.string().trim().min(1).max(100).optional(),
			})
			.passthrough()
			.nullable()
			.optional()
			.describe(
				"Estimated reading duration in seconds, not actual reading time. provided requires a known external estimate; calculated requires method and saved bodyCoverage. full calculations require bodyCoverage=full. Recompute or set null when body changes; null explicitly clears the estimate.",
			),
		section: z.string().trim().min(1).max(100).optional(),
		sentAt: contentDate
			.optional()
			.describe("Mail only: actual send datetime with timezone; date-only values are invalid."),
		recipients: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
		project: namedParty.optional(),
		timeZone: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.optional()
			.describe(
				"Event only: IANA timezone identifier such as Asia/Shanghai; numeric offsets are not timezone identifiers.",
			),
		chapterCount: z.number().int().min(1).max(10000).optional(),
		takenAt: contentDate.optional(),
		caption: z.string().max(2000).optional(),
		coverageStart: timestamp.optional(),
		coverageEnd: timestamp.optional(),
		form: z.enum(["standard", "image", "quote", "compact", "data"]).optional(),
		image: image.optional(),
		tags: strings.optional(),
		body: z
			.string()
			.max(500000)
			.optional()
			.describe(
				"Detail text as one Markdown (CommonMark) string: headings, lists, quotes, emphasis, links and code. Raw HTML is shown as text, images are not loaded, and links must use http, https or mailto.",
			),
		url: httpUrl.optional(),
		sources: z.array(SourceReference).max(11).optional(),
		why: z
			.object({
				reason: z.string().min(1).max(300),
				basis: z.array(z.string().max(200)).max(5).optional(),
			})
			.passthrough()
			.optional(),
		sender: z.string().max(300).optional(),
		location: z.string().max(300).optional(),
		meeting: z
			.object({
				name: z.string().min(1).max(100),
				url: httpUrl,
				code: z.string().max(100).optional(),
			})
			.passthrough()
			.optional(),
		media: z.enum(["video", "podcast"]).optional(),
		duration: z.number().int().min(0).max(86400).optional(),
		files: z
			.array(
				z
					.object({
						name: z.string().min(1).max(300),
						mimeType: z
							.string()
							.min(3)
							.max(200)
							.regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/)
							.optional(),
						sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
						modifiedAt: contentDate.optional(),
						url: httpUrl.optional(),
					})
					.passthrough(),
			)
			.max(200)
			.optional(),
		photos: z.array(image).max(50).optional(),
		attachment: z.string().max(300).optional(),
		tasks: z
			.array(
				z
					.object({ id, text: z.string().min(1).max(2000), done: z.boolean().optional() })
					.passthrough(),
			)
			.max(100)
			.optional(),
		start: timestamp.optional(),
		end: timestamp.optional(),
		due: timestamp.optional(),
		time: timestamp.optional(),
		people: strings.optional(),
		related: z.array(id).max(100).optional(),
		priority: z.number().min(0).max(10).optional(),
	})
	.passthrough()
	.superRefine((card, context) => {
		for (const message of cardIssues(card)) context.addIssue({ code: "custom", message });
	});
export type Card = z.infer<typeof Card>;
export type SourceReference = z.infer<typeof SourceReference>;

export { normalizeCard } from "./card-migration.ts";
