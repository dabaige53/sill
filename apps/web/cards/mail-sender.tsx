import type { Card } from "../../../contracts/card.ts";
import { Avatar } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { cardDate, cardDateLabel, cardSender, cardSource } from "../data/card-source.ts";
import { Head } from "./card-blocks.tsx";

/** The date has its own space; long sender names and addresses never displace it. */
export function MailSender({
	card,
	detail = false,
}: {
	card: Pick<Card, "authors" | "publishedAt" | "time" | "sources"> & { created_at?: string };
	detail?: boolean;
}) {
	const sender = cardSender(card);
	const date = cardDate(card.publishedAt) || cardDate(card.created_at) || cardDate(card.time);
	const label = cardDateLabel(card);
	if (!sender)
		return (
			<Head
				card={card}
				text={[cardSource(card) || copy("web.mail"), label].filter(Boolean).join(" · ")}
			/>
		);
	return (
		<div className={`${detail ? "preview-sender" : "sender"} mail-sender`}>
			<Avatar name={sender} size={detail ? 36 : 32} />
			<span className="mail-identity">
				<span className="mail-sender-line">
					<b title={sender}>{sender}</b>
					{label && (
						<time dateTime={date?.datetime} title={date?.text}>
							{label}
						</time>
					)}
				</span>
				<small className="mail-source">{cardSource(card) || copy("web.mail")}</small>
			</span>
		</div>
	);
}
