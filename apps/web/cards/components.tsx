import type React from "react";
import { markdownBlocks } from "../atoms/markdown.ts";
import {
	dateLabel,
	eventEnded,
	eventRelative,
	eventTimely,
	reminderClock,
	shortDay,
	timeString,
} from "../atoms/primitives.ts";
import { Avatar, Avatars, CheckMark, Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import {
	articleDate,
	cardReadingTime,
	cardSource,
	cardSourceKind,
	contentDay,
	detailDate,
} from "../data/card-source.ts";
import { AssetTones, CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { Media } from "./media-card.tsx";
import { CardPresentation } from "./presentation.ts";
import { PullRequest } from "./pull-request.tsx";
import { SourceMark } from "./source-mark.tsx";

export type { CardViewOptions } from "./card-blocks.tsx";

import {
	type BlockProps,
	type Card,
	type CardViewOptions,
	type Context,
	Cover,
	Head,
	Progress,
	Summary,
	sourceLine,
	Title,
} from "./card-blocks.tsx";

function Article({ card: c, ctx }: BlockProps) {
	return (
		<>
			{c.image && <Cover card={c} />}
			<div className="card-body">
				{/* The same head as the article preview: source · day · reading time. */}
				<Head card={c} text={sourceLine(c, articleDate(c))} right={Progress({ card: c, ctx })} />
				<Title card={c} ctx={ctx} />
				<Summary card={c} />
			</div>
		</>
	);
}
function Mail({ card: c, ctx }: BlockProps) {
	const sender = c.sender?.trim();
	const attachments = c.attachments ?? (c.attachment ? [{ name: c.attachment }] : []);
	return (
		<div className="card-body">
			{sender ? (
				<div className="sender">
					<Avatar name={sender} size={32} />
					<span>
						<b>{sender}</b>
						<small>
							<SourceMark card={c} />
							{cardSource(c) || copy("web.mail")}
							{c.sentAt ? ` · ${detailDate(c.sentAt, true)}` : ""}
							{cardReadingTime(c) ? ` · ${cardReadingTime(c)}` : ""}
						</small>
					</span>
				</div>
			) : (
				<Head
					card={c}
					text={[cardSource(c) || copy("web.mail"), detailDate(c.sentAt, true), cardReadingTime(c)]
						.filter(Boolean)
						.join(" · ")}
				/>
			)}
			<Title card={c} ctx={ctx} />
			<Summary card={c} />
			{!!attachments.length && (
				<div className="mail-attachments">
					{attachments.slice(0, 3).map((file, index) => (
						<span
							className={`file-row attachment ${index === 2 ? "attachment-third" : ""}`}
							key={file.name}
						>
							<Icon name="file" size={15} />
							<span>{file.name}</span>
						</span>
					))}
					{attachments.length > 2 && (
						<span className="attachment-more-phone">
							{copy("web.templates.dff74742a6f0")}
							{attachments.length - 2}
						</span>
					)}
					{attachments.length > 3 && (
						<span className="attachment-more-desktop">
							{copy("web.templates.dff74742a6f0")}
							{attachments.length - 3}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
function Note({ card: c, ctx }: BlockProps) {
	if (cardSourceKind(c) !== "capture" && c.form !== "quote")
		return (
			<div className="card-body">
				<Head
					card={c}
					text={sourceLine(c, contentDay(c.publishedAt))}
					right={Progress({ card: c, ctx })}
				/>
				<Title card={c} ctx={ctx} />
				<Summary card={c} />
			</div>
		);
	if (c.form === "quote")
		return (
			<div className="card-body quote-body">
				<Head card={c} text={sourceLine(c, contentDay(c.publishedAt))} />
				<Title card={c} ctx={ctx} className="quote-text" />
			</div>
		);
	return (
		<div className="card-body">
			<Head card={c} text={sourceLine(c, contentDay(c.publishedAt))} />
			<h2 className="card-title note-text">
				{ctx.passive ? (
					<span className="card-title-button" data-shared="title">
						{c.summary || c.title}
					</span>
				) : (
					<button
						type="button"
						data-action="card-open"
						data-id={c.id}
						aria-label={c.title}
						className="card-title-button"
						data-shared="title"
					>
						{c.summary || c.title}
					</button>
				)}
			</h2>
		</div>
	);
}
function Task({ card: c, ctx }: BlockProps) {
	const tasks = ctx.tasks,
		done = tasks.filter((t) => t.done).length,
		byId = new Map(tasks.map((t) => [t.id, t])),
		held = [...new Set(ctx.taskPreviewOrder)]
			.map((id) => byId.get(id))
			.filter((t): t is Card => !!t),
		ordered = [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)],
		visible = [...held, ...ordered.filter((t) => !held.includes(t))].slice(0, 3);
	return (
		<div className="card-body">
			<Head
				card={c}
				text={
					<>
						{c.project?.name || copy("web.task")}
						{c.due !== undefined && (
							<>
								{" "}
								·{" "}
								<span className="task-due">
									{copy("web.card.dueShort")} {dateLabel(c.due)}
								</span>
							</>
						)}
					</>
				}
				right={
					tasks.length ? (
						<span className="num task-count">
							{done}/{tasks.length}
						</span>
					) : null
				}
			/>
			<Title card={c} ctx={ctx} />
			{tasks.length ? (
				<div className="checklist">
					{visible.map((t) =>
						ctx.passive ? (
							<div
								key={t.id}
								className={`check-item ${t.done ? "is-done" : ""}`}
								role="img"
								aria-label={`${t.text}：${t.done ? copy("web.templates.f28461bb49c8") : copy("web.templates.6707de42c29d")}`}
							>
								<CheckMark done={!!t.done} />
								<span>{t.text}</span>
							</div>
						) : (
							// biome-ignore lint/a11y/useSemanticElements: The existing button checkbox keeps delegated click and keyboard task actions.
							<button
								key={t.id}
								className={`check-item ${t.done ? "is-done" : ""}`}
								data-action="task"
								data-id={c.id}
								data-extra={t.id}
								type="button"
								role="checkbox"
								aria-checked={!!t.done}
								aria-label={t.text}
							>
								<CheckMark done={!!t.done} />
								<span>{t.text}</span>
							</button>
						),
					)}
				</div>
			) : (
				<Summary card={c} />
			)}
			{tasks.length > 3 && (
				<span className="more-items">
					{copy("web.templates.dff74742a6f0")}
					{tasks.length - 3}
					{copy("web.templates.f9d529eacdf3")}
				</span>
			)}
		</div>
	);
}
function Event({ card: c, ctx }: BlockProps) {
	const timely = eventTimely(c, ctx.now) && c.meeting;
	const relative = eventRelative(c, ctx.now);
	return (
		<div className="card-body">
			<Head
				card={c}
				text={dateLabel(c.start)}
				right={relative ? <span className="event-relative">{relative}</span> : null}
			/>
			<div className="event-card-main">
				<div className="event-card-times num">
					<span className="event-start">{timeString(c.start)}</span>
					<small>
						{copy("web.templates.83532308ecca")}
						{timeString(c.end)}
					</small>
				</div>
				<div className="event-card-content">
					<Title card={c} ctx={ctx} />
					{c.meeting?.name && (
						<span className="event-card-location">
							<Icon name="video" size={15} />
							{c.meeting.name}
						</span>
					)}
					{c.location && (
						<span className="event-card-location">
							<Icon name="pin" size={15} />
							{c.location}
						</span>
					)}
				</div>
			</div>
			{(c.people?.length > 0 || timely) && (
				<div className="event-card-footer">
					{c.people?.length > 0 && (
						<div className="people">
							<Avatars names={c.people} />
							<span>{c.people.join("、")}</span>
						</div>
					)}
					{timely && !ctx.passive && (
						<button
							type="button"
							className="pill primary"
							data-action="join"
							data-id={c.id}
							aria-label={copy("web.templates.451755e3831f") + c.meeting.name}
						>
							{copy("web.templates.451755e3831f")}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
export function ReminderMark({
	card: c,
	done,
	passive,
}: {
	card: Card;
	done: boolean;
	passive?: boolean;
}) {
	const dot = (
		<span className={`check-dot ${done ? "is-done" : ""}`} aria-hidden="true">
			{done && <Icon name="check" size={12} />}
		</span>
	);
	return passive ? (
		dot
	) : (
		<button
			type="button"
			className="reminder-check"
			data-action={done ? "restore-reminder" : "complete-reminder"}
			data-id={c.id}
			aria-pressed={done}
			aria-label={done ? copy("web.reminder.restore") : copy("web.reminder.complete")}
		>
			{dot}
		</button>
	);
}
function Reminder({ card: c, ctx }: BlockProps) {
	const done = !!ctx.state.reminderDone,
		when = FeedPolicy.reminderTime(c, ctx.state, ctx.now);
	return (
		<div className="card-body">
			<Head
				card={c}
				text={[...new Set([copy("web.reminder"), cardSource(c)].filter(Boolean))].join(" · ")}
				right={
					when ? (
						<span className={`reminder-label num ${when.due ? "is-due" : ""}`}>
							{reminderClock(when.at, ctx.now)}
						</span>
					) : null
				}
			/>
			<div className="reminder-row">
				<ReminderMark card={c} done={done} passive={ctx.passive} />
				<Title card={c} ctx={ctx} />
			</div>
			{c.summary && <p className="card-summary indent">{c.summary}</p>}
		</div>
	);
}
function Digest({ card: c, ctx }: BlockProps) {
	return (
		<div className="card-body">
			<Head
				card={c}
				text={
					c.coverageStart !== undefined && c.coverageEnd !== undefined
						? `${dateLabel(c.coverageStart)} – ${dateLabel(c.coverageEnd)}`
						: sourceLine(c)
				}
				right={
					c.related?.length ? (
						<span className="num">
							{c.related.length}
							{copy("web.card.relatedCount")}
						</span>
					) : null
				}
			/>
			<Title card={c} ctx={ctx} />
			<Summary card={{ ...c, summary: c.summary || markdownBlocks(c.body || "")[0] || "" }} />
		</div>
	);
}
function Suggestion({ card: c, ctx }: BlockProps) {
	const all = (c.related || []).map((id: string) => Store.card(id)).filter(Boolean),
		related = all.slice(0, 2);
	return (
		<div className="card-body">
			<Head card={c} text={sourceLine(c, contentDay(c.publishedAt))} />
			<Title card={c} ctx={ctx} />
			<Summary card={{ ...c, summary: c.why?.reason || c.summary }} />
			<nav className="refs" aria-label={copy("web.templates.9f2ab3a03303")}>
				{related.map((r: Card) => {
					const children = (
						<>
							<Icon name={(CardTypes[r.type] || CardTypes.note).icon} size={15} />
							<span>{r.title}</span>
							<Icon name="chevron" size={14} />
						</>
					);
					return ctx.passive ? (
						<span className="ref" key={r.id}>
							{children}
						</span>
					) : (
						<button type="button" data-action="card-open" data-id={r.id} className="ref" key={r.id}>
							{children}
						</button>
					);
				})}
			</nav>
			{all.length > 2 && (
				<span className="more-items related-more">
					{copy("web.templates.dff74742a6f0")}
					{all.length - 2}
					{copy("web.related.moreSuffix")}
				</span>
			)}
		</div>
	);
}
function Photo({ card: c, ctx }: BlockProps) {
	const photos = c.photos?.length ? c.photos : [c.image];
	const taken = contentDay(c.takenAt);
	return (
		<>
			<div className={`card-cover photo-grid n${Math.min(3, photos.length)}`}>
				{photos.slice(0, 3).map((p: string, i: number) => (
					<img
						// biome-ignore lint/suspicious/noArrayIndexKey: Photos may repeat; these preview images have no component state.
						key={i}
						className="card-image"
						src={Assets[p]}
						alt=""
						draggable={false}
						loading="lazy"
						decoding="async"
						style={{ background: AssetTones[p] }}
					/>
				))}
			</div>
			<div className="card-body">
				<Head
					card={c}
					text={[c.location, taken ? shortDay(taken.getTime()) : ""].filter(Boolean).join(" · ")}
					right={
						photos.length ? (
							<span className="num">
								{photos.length}
								{copy("web.common.cardCountSuffix")}
							</span>
						) : null
					}
				/>
				<Title card={c} ctx={ctx} />
				{c.caption && <p className="card-summary">{c.caption}</p>}
			</div>
		</>
	);
}
function File({ card: c, ctx }: BlockProps) {
	const files = c.files || [];
	return (
		<div className="card-body">
			<Head
				card={c}
				text={[copy("web.file"), cardSource(c), cardReadingTime(c)].filter(Boolean).join(" · ")}
				right={
					files.length ? (
						<span className="num">
							{files.length}
							{copy("web.card.fileCountSuffix")}
						</span>
					) : null
				}
			/>
			<Title card={c} ctx={ctx} />
			<Summary card={c} />
			<div className="file-rows">
				{files.slice(0, 3).map((f: Card, i: number) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: File names may repeat; these static preview rows have no component state.
					<span className="file-row" key={i}>
						<Icon name={/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? "image" : "file"} size={15} />
						<span>{f.name}</span>
					</span>
				))}
			</div>
			{files.length > 3 && (
				<span className="more-items">
					{copy("web.templates.dff74742a6f0")}
					{files.length - 3}
					{copy("web.templates.7aaf96ad52e0")}
				</span>
			)}
		</div>
	);
}
const Bodies: Record<string, React.ComponentType<BlockProps>> = {
	article: Article,
	mail: Mail,
	note: Note,
	task: Task,
	event: Event,
	reminder: Reminder,
	media: Media,
	digest: Digest,
	suggestion: Suggestion,
	photo: Photo,
	file: File,
	pr: ({ card, ctx }) => <PullRequest card={card as any} passive={ctx.passive} />,
};
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
		covered = (c.image && ["article", "media"].includes(c.type)) || c.type === "photo",
		Body =
			Object.hasOwn(CardTypes, c.type) && Object.hasOwn(Bodies, c.type) ? Bodies[c.type] : Article;
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
			<Body card={c} ctx={ctx} />
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
