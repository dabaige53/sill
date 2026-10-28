import type { Card } from "./card.ts";
import { metadataIssues } from "./card-metadata.ts";

export function cardIssues(card: Card): string[] {
	const issues: string[] = metadataIssues(card);
	const unsafe = new Set(["__proto__", "constructor", "prototype"]);
	if (
		[card.id, ...(card.tasks ?? []).map((task) => task.id), ...(card.related ?? [])].some((value) =>
			unsafe.has(value),
		)
	)
		issues.push("invalid_id");
	if (card.type === "event" && (!(card.start > 0) || !(card.end > card.start)))
		issues.push("invalid_event_range");
	if (
		card.type === "task" &&
		(!card.tasks?.length || new Set(card.tasks.map((task) => task.id)).size !== card.tasks.length)
	)
		issues.push("invalid_task_ids");
	if (card.type === "media" && card.media !== "podcast" && !card.images?.length)
		issues.push("missing_video_image");
	if (card.type === "photo" && !card.images?.length) issues.push("missing_images");
	if (card.type === "file" && !card.files?.length) issues.push("missing_files");
	return issues;
}
