import { Avatar } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { cardSender, cardSource } from "../data/card-source.ts";
import { type Card, cardTime, Head, metaLine } from "./card-blocks.tsx";

/** One head row like every other card: avatar · sender · date. A long name truncates; the date stays whole. */
export function MailSender({ card, detail = false }: { card: Card; detail?: boolean }) {
	const sender = cardSender(card);
	const time = cardTime(card);
	if (!sender)
		return <Head card={card} text={metaLine([cardSource(card) || copy("web.mail"), time])} />;
	return (
		<div className={`${detail ? "preview-meta" : "card-head"} mail-sender`}>
			<Avatar name={sender} size={detail ? 22 : 18} />
			<b title={sender}>{sender}</b>
			{time && <span className="mail-date">· {time}</span>}
		</div>
	);
}
