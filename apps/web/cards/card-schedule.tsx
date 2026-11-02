import { dateLabel } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { type Card, cardTime } from "./card-blocks.tsx";

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
	// Without a deadline or reminder, the card's own date holds the place.
	const time = rows.length ? null : cardTime(card);
	if (time) return <div className="card-schedule">{time}</div>;
	return rows.length ? (
		<div className="card-schedule">
			{rows.map((text) => (
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
