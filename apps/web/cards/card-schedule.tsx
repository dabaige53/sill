import { dateLabel } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { cardDateLabel } from "../data/card-source.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { Card } from "./card-blocks.tsx";

/** Task deadlines and personal reminder times occupy the same place on both surfaces. */
export function CardSchedule({
	card,
	state = {},
	now = Date.now(),
}: {
	card: Card;
	state?: Record<string, any>;
	now?: number;
}) {
	const reminder = FeedPolicy.reminderTime(card, state, now);
	const deadline = card.type === "task" && card.due !== undefined;
	const showReminder =
		reminder && (card.type === "reminder" || (card.type === "task" && state.snoozedUntil));
	const reminderText = showReminder ? `${copy("web.reminder")} · ${dateLabel(reminder.at)}` : "";
	const rows = [
		deadline ? `${copy("web.card.due")} · ${dateLabel(card.due)}` : "",
		reminderText,
	].filter(Boolean);
	if (!rows.length) rows.push(cardDateLabel(card));
	return rows.some(Boolean) ? (
		<div className="card-schedule">
			{rows.filter(Boolean).map((text) => (
				<span
					key={text}
					className={
						text === reminderText ? `reminder-label ${reminder.due ? "is-due" : ""}` : undefined
					}
				>
					{text}
				</span>
			))}
		</div>
	) : null;
}
