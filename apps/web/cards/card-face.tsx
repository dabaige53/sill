import { Fragment, type ReactNode } from "react";
import {
	dateLabel,
	duration,
	eventRelative,
	eventTimely,
	reminderClock,
	shortDay,
	timeString,
} from "../atoms/primitives.ts";
import { Avatar, Avatars, CheckItem, CheckMark, Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import {
	articleDate,
	cardCover,
	cardReadingTime,
	cardSender,
	cardSource,
	contentDay,
	detailDate,
} from "../data/card-source.ts";
import { AssetTones, CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import {
	type BlockProps,
	type Card,
	type Context,
	Cover,
	Head,
	Progress,
	Summary,
	sourceLine,
	Title,
} from "./card-blocks.tsx";
import { FileRows } from "./detail-blocks.tsx";
import { PullRequest } from "./pull-request.tsx";
import { cardRecipe, type Entry, entryName, entryOptions } from "./recipes.ts";

type Options = Record<string, any>;
type Block = (card: Card, ctx: Context, options: Options) => ReactNode;

/** The reminder circle: done in Sill only. The card and its detail use the same control. */
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

function mediaProgress(c: Card, ctx: Context) {
	return c.duration > 0 ? Math.min(1, (ctx.state.playbackPosition || 0) / c.duration) : 0;
}
function PlayedBar({ card: c, ctx }: BlockProps) {
	return (
		<progress
			className="media-card-progress"
			max={1}
			value={mediaProgress(c, ctx)}
			aria-label={copy("web.media.position")}
		/>
	);
}
function MediaLength({ card: c }: { card: Card }) {
	return c.duration === undefined ? copy("web.media.unknownDuration") : duration(c.duration);
}

/** Source line text, by the recipe's `line` option. */
const lines: Record<string, (c: Card, ctx: Context, options: Options) => ReactNode> = {
	publication: (c, _ctx, o) =>
		sourceLine(
			c,
			o.date === "article"
				? articleDate(c)
				: o.date === "published"
					? contentDay(c.publishedAt)
					: null,
		),
	task: (c) => (
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
	),
	reminder: (c) => [...new Set([copy("web.reminder"), cardSource(c)].filter(Boolean))].join(" · "),
	eventDate: (c) => dateLabel(c.start),
	photo: (c) => {
		const taken = contentDay(c.publishedAt);
		return [c.location, taken ? shortDay(taken.getTime()) : ""].filter(Boolean).join(" · ");
	},
	file: (c) => [copy("web.file"), cardSource(c), cardReadingTime(c)].filter(Boolean).join(" · "),
};

/** The one status item on the right of the source line, by the recipe's `status` option. */
const statuses: Record<string, (c: Card, ctx: Context) => ReactNode> = {
	progress: (c, ctx) => Progress({ card: c, ctx }),
	remaining: (c, ctx) =>
		c.duration === undefined ? null : (
			<span className="num">
				{copy("web.media.remaining").replace(
					"{minutes}",
					String(Math.ceil(Math.max(0, c.duration - (ctx.state.playbackPosition || 0)) / 60)),
				)}
			</span>
		),
	taskCount: (_c, { tasks }) =>
		tasks.length ? (
			<span className="num task-count">
				{tasks.filter((t) => t.done).length}/{tasks.length}
			</span>
		) : null,
	relative: (c, ctx) => {
		const relative = eventRelative(c, ctx.now);
		return relative ? <span className="event-relative">{relative}</span> : null;
	},
	reminderClock: (c, ctx) => {
		const when = FeedPolicy.reminderTime(c, ctx.state, ctx.now);
		return when ? (
			<span className={`reminder-label num ${when.due ? "is-due" : ""}`}>
				{reminderClock(when.at, ctx.now)}
			</span>
		) : null;
	},
	relatedCount: (c) =>
		c.related?.length ? (
			<span className="num">
				{c.related.length}
				{copy("web.card.relatedCount")}
			</span>
		) : null,
	photoCount: (c) => {
		const photos = c.images || [];
		return photos.length ? (
			<span className="num">
				{photos.length}
				{copy("web.common.cardCountSuffix")}
			</span>
		) : null;
	},
	fileCount: (c) =>
		c.files?.length ? (
			<span className="num">
				{c.files.length}
				{copy("web.card.fileCountSuffix")}
			</span>
		) : null,
};

function more(count: number, suffix: Parameters<typeof copy>[0], className = "more-items") {
	return (
		<span className={className}>
			{copy("web.templates.dff74742a6f0")}
			{count}
			{copy(suffix)}
		</span>
	);
}

/** Top media renders above the card body; every other block renders inside it. */
const topMedia = new Set(["cover", "videoCover", "mosaic"]);

const blocks: Record<string, Block> = {
	cover: (c) => (cardCover(c) ? <Cover card={c} /> : null),
	videoCover: (c, ctx) => (
		<Cover card={c}>
			<span className="media-play-mark" aria-hidden="true">
				<Icon name="play" size={20} />
			</span>
			<div className="media-cover-timeline">
				<PlayedBar card={c} ctx={ctx} />
				<span className="media-length num">
					<MediaLength card={c} />
				</span>
			</div>
		</Cover>
	),
	mosaic: (c) => {
		const photos = c.images || [];
		return (
			<div className={`card-cover photo-grid n${Math.min(3, photos.length)}`}>
				{photos.slice(0, 3).map((p: string, i: number) => (
					<img
						// biome-ignore lint/suspicious/noArrayIndexKey: Photos may repeat; these preview images have no component state.
						key={i}
						className="card-image"
						src={assetURL(p)}
						alt=""
						draggable={false}
						loading="lazy"
						decoding="async"
						style={{ background: AssetTones[p] }}
					/>
				))}
			</div>
		);
	},
	source: (c, ctx, o) => (
		<Head
			card={c}
			text={(lines[o.line] || lines.publication)(c, ctx, o)}
			right={o.status ? statuses[o.status]?.(c, ctx) : undefined}
		/>
	),
	sender: (c) => {
		const sender = cardSender(c);
		return sender ? (
			<div className="sender">
				<Avatar name={sender} size={32} />
				<span>
					<b>{sender}</b>
					<small>
						{cardSource(c) || copy("web.mail")}
						{c.publishedAt ? ` · ${detailDate(c.publishedAt, true)}` : ""}
						{cardReadingTime(c) ? ` · ${cardReadingTime(c)}` : ""}
					</small>
				</span>
			</div>
		) : (
			<Head
				card={c}
				text={[
					cardSource(c) || copy("web.mail"),
					detailDate(c.publishedAt, true),
					cardReadingTime(c),
				]
					.filter(Boolean)
					.join(" · ")}
			/>
		);
	},
	title: (c, ctx) => <Title card={c} ctx={ctx} />,
	quote: (c, ctx) => <Title card={c} ctx={ctx} className="quote-text" />,
	summary: (c, _ctx, o) => {
		if (o.fallback === false)
			return c.summary ? (
				<p className={`card-summary ${o.indent ? "indent" : ""}`}>{c.summary}</p>
			) : null;
		return <Summary card={c} short={!!o.short} />;
	},
	checklist: (c, ctx, o) => {
		const tasks = ctx.tasks;
		if (!tasks.length) return null;
		const limit = o.limit ?? tasks.length,
			byId = new Map(tasks.map((t) => [t.id, t])),
			held = [...new Set(ctx.taskPreviewOrder)]
				.map((id) => byId.get(id))
				.filter((t): t is Card => !!t),
			ordered = [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)],
			visible = [...held, ...ordered.filter((t) => !held.includes(t))].slice(0, limit);
		return (
			<>
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
							<CheckItem
								key={t.id}
								cardId={c.id}
								task={t as { id: string; text: string; done?: boolean }}
							/>
						),
					)}
				</div>
				{tasks.length > limit && more(tasks.length - limit, "web.templates.f9d529eacdf3")}
			</>
		);
	},
	reminderMark: (c, ctx) => (
		<ReminderMark card={c} done={!!ctx.state.reminderDone} passive={ctx.passive} />
	),
	timeSpan: (c) => (
		<div className="event-card-times num">
			<span className="event-start">{timeString(c.start)}</span>
			<small>
				{copy("web.templates.83532308ecca")}
				{timeString(c.end)}
			</small>
		</div>
	),
	info: (c) => (
		<>
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
		</>
	),
	participants: (c) =>
		c.people?.length > 0 ? (
			<div className="people">
				<Avatars names={c.people} />
				<span>{c.people.join("、")}</span>
			</div>
		) : null,
	join: (c, ctx) =>
		eventTimely(c, ctx.now) && c.meeting && !ctx.passive ? (
			<button
				type="button"
				className="pill primary"
				data-action="join"
				data-id={c.id}
				aria-label={copy("web.templates.451755e3831f") + c.meeting.name}
			>
				{copy("web.templates.451755e3831f")}
			</button>
		) : null,
	files: (c, _ctx, o) => {
		const limit = o.limit ?? Infinity;
		const files = c.files || [];
		return (
			<>
				<FileRows files={files} limit={limit} />
				{files.length > limit && more(files.length - limit, "web.templates.7aaf96ad52e0")}
			</>
		);
	},
	references: (c, ctx, o) => {
		const all = (c.related || []).map((id: string) => Store.card(id)).filter(Boolean),
			limit = o.limit ?? all.length;
		return (
			<>
				<nav className="refs" aria-label={copy("web.templates.9f2ab3a03303")}>
					{all.slice(0, limit).map((r: Card) => {
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
							<button
								type="button"
								data-action="card-open"
								data-id={r.id}
								className="ref"
								key={r.id}
							>
								{children}
							</button>
						);
					})}
				</nav>
				{all.length > limit &&
					more(all.length - limit, "web.related.moreSuffix", "more-items related-more")}
			</>
		);
	},
	programBar: (c, ctx) => (
		<div className="mini-player">
			<span className="mini-play-mark" aria-hidden="true">
				<Icon name="play" size={12} />
			</span>
			<PlayedBar card={c} ctx={ctx} />
			<span className="num">
				<MediaLength card={c} />
			</span>
		</div>
	),
};

/** Layout groups: a named wrapper that renders only when one of its blocks does. */
const groups: Record<string, string> = {
	reminderRow: "reminder-row",
	eventMain: "event-card-main",
	eventContent: "event-card-content",
	eventFooter: "event-card-footer",
};
const composites: Record<string, Block> = {
	pullRequest: (c, ctx) => <PullRequest card={c as never} passive={ctx.passive} />,
};

function renderEntry(entry: Entry, card: Card, ctx: Context, key: number): ReactNode {
	if (typeof entry !== "string" && "group" in entry) {
		const children = entry.blocks.map((child, i) => renderEntry(child, card, ctx, i));
		return children.some((child) => child !== null && child !== false && child !== undefined) ? (
			<div className={groups[entry.group]} key={key}>
				{children}
			</div>
		) : null;
	}
	const block = blocks[entryName(entry)];
	const node = block ? block(card, ctx, entryOptions(entry)) : null;
	return node === null || node === undefined ? null : <Fragment key={key}>{node}</Fragment>;
}

/** The card face: the recipe's top media, then its blocks inside the card body. */
export function RecipeFace({ card, ctx }: BlockProps) {
	const recipe = cardRecipe(card);
	const composite = recipe.find((entry) => typeof entry !== "string" && "composite" in entry);
	if (composite && typeof composite !== "string" && "composite" in composite)
		return <>{composites[composite.composite]?.(card, ctx, {})}</>;
	const top = recipe.filter((entry) => topMedia.has(entryName(entry)));
	const rest = recipe.filter((entry) => !topMedia.has(entryName(entry)));
	const quote = rest.some((entry) => entryName(entry) === "quote");
	return (
		<>
			{top.map((entry, i) => renderEntry(entry, card, ctx, i))}
			<div className={quote ? "card-body quote-body" : "card-body"}>
				{rest.map((entry, i) => renderEntry(entry, card, ctx, i))}
			</div>
		</>
	);
}
