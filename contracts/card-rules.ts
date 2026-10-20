import { metadataIssues } from "./card-metadata.ts";
import type { Card } from "./card.ts";

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
	if (card.type === "media" && !card.image && card.media !== "podcast")
		issues.push("missing_video_image");
	if (card.type === "photo" && !card.photos?.length && !card.image) issues.push("missing_photos");
	if (card.type === "file" && !card.files?.length) issues.push("missing_files");
	return issues;
}
