import React, { type ReactNode } from "react";
import {
	dateLabel,
	duration,
	eventEnded,
	eventRelative,
	eventTimely,
	reminderClock,
	timeString,
} from "../atoms/primitives.ts";
import { Avatar, Avatars, CheckMark, Icon, ProgressRing } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardReadingTime, cardSource, cardSourceKind } from "../data/card-source.ts";
import { AssetTones, CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { CardPresentation } from "./presentation.ts";

type Card = Record<string, any>;
export interface CardViewOptions {
	state?: Record<string, any>;
	passive?: boolean;
	compact?: boolean;
	now?: number;
	taskPreviewOrder?: string[];
}
interface Context {
	state: Record<string, any>;
	tasks: Card[];
	taskPreviewOrder: string[];
	passive: boolean;
	now: number;
}
interface BlockProps {
	card: Card;
	ctx: Context;
}
function SourceIcon({ card: c, size = 16 }: { card: Card; size?: number }) {
	if (c.sources?.length > 1)
		return (
			<span className="source-icons" aria-hidden="true">
				{c.sources.slice(0, 3).map((s: Card, i: number) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Sources may repeat and these decorative icons have no component state.
					<span key={i}>
						<Icon name={SourceKinds[s.kind]?.icon || "book"} size={12} />
					</span>
				))}
			</span>
		);
	const byType = ["task", "event", "reminder", "digest", "photo", "file"].includes(c.type);
	return (
		<Icon
			name={
				byType
					? (CardTypes[c.type] || CardTypes.note).icon
					: SourceKinds[cardSourceKind(c)]?.icon || (CardTypes[c.type] || CardTypes.note).icon
			}
			size={size}
		/>
	);
}
function sourceLine(c: Card) {
	return [
		c.sources?.length > 1
			? c.sources.map((s: Card) => s.name).join(" · ")
			: cardSource(c) || (CardTypes[c.type] || CardTypes.note).label,
		cardReadingTime(c),
	]
		.filter(Boolean)
		.join(" · ");
}
function Head({ card, text, right }: { card: Card; text: ReactNode; right?: ReactNode }) {
	return (
		<div className="card-head">
			<SourceIcon card={card} />
			<span className="card-src">{text}</span>
			{right && <span className="card-head-right">{right}</span>}
		</div>
	);
}
function Progress({ card: c, ctx }: BlockProps) {
	const s = ctx.state;
	return (CardTypes[c.type] || CardTypes.note).readable && !s.read && s.progress > 0 ? (
		<span className="card-progress num">
			<ProgressRing progress={s.progress} size={14} />
			{Math.round(s.progress * 100)}%
		</span>
	) : null;
}
function Title({ card: c, ctx, className = "" }: BlockProps & { className?: string }) {
	return (
		<h2 className={`card-title ${className}`}>
			{ctx.passive ? (
				<span className="card-title-button" data-shared="title">
					{c.title}
				</span>
			) : (
				<button
					type="button"
					data-action="card-open"
					data-id={c.id}
					className="card-title-button"
					data-shared="title"
				>
					{c.title}
				</button>
			)}
		</h2>
	);
}
function Summary({ card: c, short = false }: { card: Card; short?: boolean }) {
	return c.points?.length ? (
		<>
			{c.summary && <p className="card-summary clamp-2">{c.summary}</p>}
			<ol className="key-points">
				{c.points.slice(0, 3).map((p: string, i: number) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Points may repeat; these numbered text rows have no component state.
					<li key={i}>
						<i className="num">{i + 1}</i>
						<span>{p}</span>
					</li>
				))}
			</ol>
		</>
	) : c.summary ? (
		<p className={`card-summary ${short ? "clamp-2" : ""}`}>{c.summary}</p>
	) : null;
}
function Cover({ card: c, children }: { card: Card; children?: ReactNode }) {
	return (
		<div className="card-cover" style={{ background: AssetTones[c.image] || "var(--surface)" }}>
			<img
				className="card-image"
				data-shared="image"
				src={Assets[c.image]}
				alt=""
				draggable={false}
				loading="lazy"
				decoding="async"
			/>
			{children}
		</div>
	);
}
function Article({ card: c, ctx }: BlockProps) {
	return (
		<>
			{c.image && <Cover card={c} />}
			<div className="card-body">
				<Head card={c} text={sourceLine(c)} right={Progress({ card: c, ctx })} />
				<Title card={c} ctx={ctx} />
				<Summary card={c} short={!!c.image} />
			</div>
		</>
	);
}
function Mail({ card: c, ctx }: BlockProps) {
	const sender = c.sender || cardSource(c) || copy("web.mail");
	return (
		<div className="card-body">
			<div className="sender">
				<Avatar name={sender} />
				<span>
					<b>{sender}</b>
					<small>
						{copy("web.mail")}
						{c.sentAt ? ` · ${dateLabel(Date.parse(c.sentAt))}` : ""}
						{cardReadingTime(c) ? ` · ${cardReadingTime(c)}` : ""}
					</small>
				</span>
			</div>
			<Title card={c} ctx={ctx} />
			<Summary card={c} />
			{c.attachment && (
				<span className="file-row attachment">
					<Icon name="file" size={15} />
					<span>{c.attachment}</span>
				</span>
			)}
		</div>
	);
}
function Note({ card: c, ctx }: BlockProps) {
	if (cardSourceKind(c) !== "capture" && c.form !== "quote")
		return (
			<div className="card-body">
				<Head card={c} text={sourceLine(c)} right={Progress({ card: c, ctx })} />
				<Title card={c} ctx={ctx} />
				<Summary card={c} />
			</div>
		);
	if (c.form === "quote")
		return (
			<div className="card-body quote-body">
				<Head card={c} text={sourceLine(c)} />
				<Title card={c} ctx={ctx} className="quote-text" />
			</div>
		);
	return (
		<div className="card-body">
			<Head card={c} text={sourceLine(c)} />
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
				text={c.project?.name || copy("web.task")}
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
	const span = Math.round((c.end - c.start) / 60000),
		timely = eventTimely(c, ctx.now) && c.meeting,
		relative = eventRelative(c, ctx.now);
	return (
		<div className="card-body">
			<Head
				card={c}
				text={dateLabel(c.start)}
				right={relative ? <span className="event-relative">{relative}</span> : null}
			/>
			<div className="event-time">
				<span className="num event-start">{timeString(c.start)}</span>
				<span className="event-end">
					<span className="num">
						{copy("web.templates.83532308ecca")}
						{timeString(c.end)}
					</span>
					<small>
						{copy("web.templates.2428420e407f")}
						{span}
						{copy("web.templates.40de54344d22")}
					</small>
				</span>
			</div>
			<Title card={c} ctx={ctx} />
			{c.people?.length > 0 && (
				<div className="people">
					<Avatars names={c.people} />
					<span>{c.people.join("、")}</span>
				</div>
			)}
			{timely && !ctx.passive && (
				<div className="card-actions-row">
					<button
						type="button"
						className="pill primary"
						data-action="join"
						data-id={c.id || undefined}
						aria-label={`${copy("web.templates.451755e3831f")}${c.meeting.name}`}
					>
						{copy("web.templates.451755e3831f")}
					</button>
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
function Media({ card: c, ctx }: BlockProps) {
	const s = ctx.state;
	if (c.media === "podcast") {
		const total = c.duration || 0,
			played = total * (s.progress || 0);
		return (
			<div className="card-body">
				<Head card={c} text={sourceLine(c)} right={Progress({ card: c, ctx })} />
				<Title card={c} ctx={ctx} />
				<Summary card={c} short />
				<div className="mini-player">
					<span className="mini-play" aria-hidden="true">
						<Icon name="play" size={14} />
					</span>
					<span className="bar">
						<i style={{ width: `${Math.round((s.progress || 0) * 100)}%` }} />
					</span>
					<span className="num">{played ? `-${duration(total - played)}` : duration(total)}</span>
				</div>
			</div>
		);
	}
	return (
		<>
			{c.image && (
				<Cover card={c}>
					<span className="play-mark" aria-hidden="true">
						<Icon name="play" size={18} />
					</span>
					{!!c.duration && <span className="media-length num">{duration(c.duration)}</span>}
				</Cover>
			)}
			<div className="card-body">
				<Head card={c} text={sourceLine(c)} right={Progress({ card: c, ctx })} />
				<Title card={c} ctx={ctx} />
			</div>
		</>
	);
}
function Digest({ card: c, ctx }: BlockProps) {
	return (
		<div className="card-body">
			<Head card={c} text={sourceLine(c)} />
			<Title card={c} ctx={ctx} />
			<Summary card={{ ...c, summary: c.summary || (c.points?.length ? "" : c.body?.[0] || "") }} />
		</div>
	);
}
function Suggestion({ card: c, ctx }: BlockProps) {
	const all = (c.related || []).map((id: string) => Store.card(id)).filter(Boolean),
		related = all.slice(0, 2);
	return (
		<div className="card-body">
			<Head card={c} text={sourceLine(c)} />
			<Title card={c} ctx={ctx} />
			<Summary card={c} />
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
					text={[copy("web.photo"), c.location].filter(Boolean).join(" · ")}
					right={photos.length > 3 ? <span className="num">{photos.length}</span> : null}
				/>
				<Title card={c} ctx={ctx} />
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
				right={null}
			/>
			<Title card={c} ctx={ctx} />
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
