import { eventEnded } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { cardSource, cardSourceKind } from "../data/card-source.ts";
import { CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { type Card, type CardViewOptions, type Context, Head } from "./card-blocks.tsx";
import { RecipeFace } from "./card-face.tsx";
import { CardPresentation } from "./presentation.ts";

export type { CardViewOptions } from "./card-blocks.tsx";
export { ReminderMark } from "./card-face.tsx";

export function CardView({ card: c, options = {} }: { card: Card; options?: CardViewOptions }) {
	options = options && typeof options === "object" ? options : {};
	const s = CardPresentation.state(c, options),
		tasks = CardPresentation.tasks(c, s),
		isDone =
			(c.type === "task" && tasks.length && tasks.every((t: Card) => t.done)) ||
			(c.type === "reminder" && s.reminderDone),
		ctx: Context = {
			state: s,
			tasks,
			taskPreviewOrder:
				!options.passive && Array.isArray(options.taskPreviewOrder) ? options.taskPreviewOrder : [],
			passive: !!options.passive,
			now: options.now ?? Date.now(),
		},
		read = (CardTypes[c.type] || CardTypes.note).readable && s.read && Store.pref("fadeRead"),
		ended = c.type === "event" && eventEnded(c, ctx.now),
		covered = (c.image && ["article", "media"].includes(c.type)) || c.type === "photo";
	return (
		<article
			className={`feed-card ${options.compact ? "" : "feed-item"} type-${c.type} ${covered ? "has-cover" : ""} ${options.compact ? "is-compact" : ""} ${read ? "is-read" : ""} ${ended ? "is-ended" : ""} ${s.bookmarked ? "is-bookmarked" : ""} ${s.selected ? "is-selected" : ""} ${s.snoozedUntil > 0 ? "is-snoozed" : ""} ${isDone ? "is-complete" : ""}`}
			{...(ctx.passive ? { "data-passive": "true" } : { tabIndex: 0, "data-card": c.id })}
			aria-label={
				(CardTypes[c.type] || CardTypes.note).label +
				"：" +
				c.title +
				(s.read ? copy("web.templates.732aa8f1efe5") : "")
			}
		>
			<RecipeFace card={c} ctx={ctx} />
		</article>
	);
}
export function StackView({ stackKey, cards }: { stackKey: string; cards: Card[] }) {
	const top = cards[0],
		n = cards.length;
	return (
		<article
			className="feed-card feed-item stack-card"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: The stack is an existing keyboard focus target handled by delegated card navigation.
			tabIndex={0}
			data-stack={stackKey}
			aria-label={`${cardSource(top)}：${n}${copy("web.templates.50091bfc40b5")}`}
		>
			<span className="deck-edge deep" aria-hidden="true" />
			<span className="deck-edge" aria-hidden="true" />
			<div className="deck">
				{cards.map((c, i) => (
					<div
						key={c.id}
						className={`deck-card${i === 0 ? " is-top" : i === 1 ? " is-next" : ""}`}
						data-index={i}
						aria-hidden={i ? true : undefined}
					>
						<div className="card-body">
							<Head
								card={c}
								text={cardSource(c)}
								right={
									<span className="num stack-count">
										<span className="stack-pos">{i + 1}</span>/{n}
									</span>
								}
							/>
							<h2 className="card-title">
								{i === 0 ? (
									<button
										type="button"
										className="card-title-button"
										data-action="stack-open"
										data-extra={stackKey}
									>
										{c.title}
									</button>
								) : (
									c.title
								)}
							</h2>
							{c.summary && <p className="card-summary clamp-2">{c.summary}</p>}
						</div>
					</div>
				))}
			</div>
		</article>
	);
}
export function OpenStackView({ stackKey, cards }: { stackKey: string; cards: Card[] }) {
	return (
		<section className="feed-item stack-open" data-stack-open={stackKey}>
			<div className="stack-open-head">
				<Icon name={SourceKinds[cardSourceKind(cards[0])]?.icon || "rss"} size={15} />
				<span>
					{cardSource(cards[0])} · <span className="num">{cards.length}</span>
				</span>
				<button type="button" className="text-link" data-action="stack-close" data-extra={stackKey}>
					{copy("web.templates.afd4b783536b")}
				</button>
			</div>
			{cards.map((c) => (
				<CardView key={c.id} card={c} options={{ compact: true }} />
			))}
		</section>
	);
}
export function ShelfView({ read, stale }: { read: number; stale: number }) {
	if (!read && !stale) return null;
	return (
		<nav className="feed-item shelf-entry" aria-label={copy("web.templates.25775c98c7b8")}>
			{!!read && (
				<button type="button" className="shelf-row" data-action="archive" data-extra="read">
					<Icon name="ring" size={16} />
					<b>{copy("web.templates.7b7e6e8bd4ba")}</b>
					<span>{copy("web.templates.08ae1ab86ff2")}</span>
					<span className="num">{read}</span>
				</button>
			)}
			{!!stale && (
				<button type="button" className="shelf-row" data-action="archive" data-extra="stale">
					<Icon name="clock" size={16} />
					<b>{copy("web.templates.709b79e460c8")}</b>
					<span>{copy("web.templates.77edd3c039f9")}</span>
					<span className="num">{stale}</span>
				</button>
			)}
		</nav>
	);
}
