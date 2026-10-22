import type { CSSProperties, ReactNode } from "react";
import {
	dateLabel,
	eventRelative,
	relativeDay,
	reminderClock,
	timeString,
} from "../atoms/primitives.ts";
import { FileList, RelatedCards, TaskFacts, WhyDetails } from "../cards/detail-blocks.tsx";
import { DetailText } from "../cards/markdown.tsx";
import { MediaDetail, type PlaybackApp } from "../cards/media-detail.tsx";
import { PullRequest } from "../cards/pull-request.tsx";
import { SourceMark } from "../cards/source-mark.tsx";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { detailDate, cardReadingTime, cardSource } from "../data/card-source.ts";
import { AssetTones } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import {
	agentAction,
	avatar,
	button,
	checkItem,
	icon,
	keyed,
	personalNote,
	reminderMark,
} from "./panel-primitives.tsx";
import type { PanelRenderers } from "./panels-components.tsx";

type PreviewCard = ReturnType<typeof Store.card>;
type PreviewApp = PlaybackApp & {
	agentAction?: (card: PreviewCard) => string;
	agentActionView?: (card: PreviewCard) => ReactNode;
};
type PreviewContext = {
	app: PreviewApp;
	s: ReturnType<typeof Store.item>;
	tags: ReactNode;
	closeButton: ReactNode;
	sheet: (inner: ReactNode, cover?: ReactNode, action?: ReactNode, end?: ReactNode) => ReactNode;
	tools: ReactNode;
	h1: ReactNode;
};
type PreviewRenderer = (
	this: PanelRenderers,
	card: PreviewCard,
	context: PreviewContext,
) => ReactNode;

const renderers = {
	mail: mailPreview,
	event: eventPreview,
	media: (c, { sheet, tools, app }) => (
		<>
			{sheet(<MediaDetail key={c.id} card={c} app={app} />)}
			{tools}
		</>
	),
	file: filePreview,
	pr: (c, { sheet, tools }) => (
		<>
			{sheet(<PullRequest card={c} detail />)}
			{tools}
		</>
	),
	task: taskReminderPreview,
	reminder: taskReminderPreview,
} satisfies Record<string, PreviewRenderer>;

export function previewView(this: PanelRenderers, app?: PreviewApp, c?: PreviewCard) {
	const s = Store.item(c.id),
		note = personalNote(s.note);
	const tags = this.tags(c);
	const closeButton = button("x", copy("web.preview.close"), "close");
	const expand =
		(c.type === "media" && !standaloneDisplay()) ||
		(c.body?.trim() &&
			!standaloneDisplay() &&
			["article", "note", "digest", "mail"].includes(c.type))
			? button("expand", copy("web.preview.fullscreen"), "reader", c.id)
			: "";
	const sheet = (
		inner: ReactNode,
		cover: ReactNode = "",
		action: ReactNode = "",
		end: ReactNode = "",
	) => (
		<>
			<div
				className={`sheet preview-sheet detail-${c.type}`}
				style={
					c.media === "podcast"
						? ({ "--podcast-tone": AssetTones[c.image] || "var(--surface)" } as CSSProperties)
						: undefined
				}
			>
				{this.head(expand, closeButton)}
				{c.type === "media" && c.media === "podcast" && (
					<div className="now-playing-heading">{copy("web.media.nowPlaying")}</div>
				)}
				{/* biome-ignore lint/a11y/useSemanticElements: The existing named scroll region must receive keyboard focus for scrolling and focus restoration. */}
				<div
					className={"sheet-scroll"}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: This scroll region needs keyboard focus for scrolling and focus restoration.
					tabIndex={0}
					role={"region"}
					aria-label={copy("web.preview.contentRegion")}
				>
					{cover}
					<div className={c.type === "article" ? "preview-body is-article" : "preview-body"}>
						{inner}
						{note}
						{this.foot(action, agentAction(app, c))}
						{end}
					</div>
				</div>
			</div>
		</>
	);
	const tools = this.tools(c, s, this.own(c));
	const h1 = (
		<>
			<h1 id={"modal-title"} data-shared={"title"}>
				{c.title}
			</h1>
			{tags}
			{this.publication(c)}
		</>
	);
	const context: PreviewContext = { app, s, tags, closeButton, sheet, tools, h1 };

	const render: PreviewRenderer =
		typeof c.type === "string" && Object.hasOwn(renderers, c.type)
			? renderers[c.type]
			: contentPreview;
	return render.call(this, c, context);
}

function mailPreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { sheet, h1, tools } = context;

	const sender = c.sender?.trim();
	return (
		<>
			{keyed(
				sheet(
					<>
						<header className="detail-header ruled-header">
							{sender ? (
								<div className={"preview-sender"}>
									{avatar(sender, 36)}
									<span>
										<b>{sender}</b>
										<small>
											<SourceMark card={c} />
											{[detailDate(c.sentAt, true), cardReadingTime(c)].filter(Boolean).join(" · ")}
										</small>
									</span>
								</div>
							) : (
								this.meta(c)
							)}
							{h1}
						</header>
						<DetailText body={c.body} />
						<FileList
							attachment
							label={copy("web.card.attachments")}
							files={c.attachments ?? (c.attachment ? [{ name: c.attachment }] : [])}
						/>
					</>,
				),
			)}
			{tools}
		</>
	);
}

function eventPreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { sheet, h1, tools } = context;

	const span = Math.round((c.end - c.start) / 60000);
	const rows = [
		c.meeting ? (
			<>
				<div className={"detail-row"}>
					<span className={"row-icon"}>{icon("video", 16)}</span>
					<span>{c.meeting.name}</span>
					<small className={"num"}>{c.meeting.code || ""}</small>
				</div>
			</>
		) : (
			""
		),
		c.location ? (
			<>
				<div className={"detail-row"}>
					<span className={"row-icon"}>{icon("pin", 16)}</span>
					<span>{c.location}</span>
				</div>
			</>
		) : (
			""
		),
		c.people?.length ? (
			<>
				<div className={"detail-row"}>
					<span className={"row-icon"}>{icon("at", 16)}</span>
					<span>{c.people.join("、")}</span>
					<small>
						{c.people.length}
						{copy("web.preview.peopleCountSuffix")}
					</small>
				</div>
			</>
		) : (
			""
		),
	];
	return (
		<>
			{keyed(
				sheet(
					<>
						{this.meta(c)}
						<div className={"preview-meta"}>
							{dateLabel(c.start)}
							{eventRelative(c) ? (
								<>
									{" · "}
									<span style={{ color: "var(--accent)", fontWeight: "500" }}>
										{eventRelative(c)}
									</span>
								</>
							) : (
								""
							)}
						</div>
						<div className={"event-hero"}>
							<span className={"num"}>{timeString(c.start)}</span>
							<small className={"num"}>
								{copy("web.templates.83532308ecca")}
								{timeString(c.end)}
								{" · "}
								{span}
								{copy("web.templates.40de54344d22")}
								{c.timeZone ? ` · ${c.timeZone}` : ""}
							</small>
						</div>
						{h1}
						{rows.some(Boolean) ? (
							<>
								<div className={"detail-rows"}>{keyed(rows)}</div>
							</>
						) : (
							""
						)}
						{c.body?.trim() && (
							<section className="detail-section">
								<h2>{copy("web.card.agenda")}</h2>
								<DetailText body={c.body} />
							</section>
						)}
					</>,
				),
			)}
			{tools}
		</>
	);
}

function filePreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { sheet, h1, tools } = context;
	return (
		<>
			{sheet(
				<>
					{this.meta(c)}
					{h1}
					<DetailText body={c.body} />
					<FileList files={c.files} />
				</>,
			)}
			{tools}
		</>
	);
}

function taskReminderPreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { s, sheet, h1, tools, tags } = context;

	const list =
		c.type === "task" ? (
			<>
				<div className={"detail-task-list"}>
					{keyed(Store.tasks(c).map((t?: any) => checkItem(c, t)))}
				</div>
			</>
		) : (
			""
		);
	const label =
		c.type === "reminder"
			? [
					...new Set([
						copy("web.reminder"),
						cardSource(c),
						FeedPolicy.reminderTime(c, s) ? reminderClock(FeedPolicy.reminderTime(c, s).at) : "",
					]),
				]
					.filter(Boolean)
					.join(" · ")
			: c.project?.name || "";
	return (
		<>
			{sheet(
				<>
					<div className={"preview-meta"}>
						<SourceMark card={c} size={15} />
						<span>{label}</span>
					</div>
					{c.type === "reminder" ? (
						<>
							<div className={"reminder-row preview-title-row"}>
								{reminderMark(c, !!s.reminderDone)}
								<h1 id={"modal-title"} data-shared={"title"}>
									{c.title}
								</h1>
							</div>
							{tags}
						</>
					) : (
						h1
					)}
					{c.type === "task" && <TaskFacts card={c} />}
					{keyed(list)}
					<DetailText body={c.body} />
					{c.type === "reminder" && c.project && (
						<p className="preview-published">
							{copy("web.metadata.project")} · {c.project.name}
						</p>
					)}
				</>,
			)}
			{tools}
		</>
	);
}

function contentPreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { sheet, tools } = context;
	return (
		<>
			{sheet(
				articleContent.call(this, c, false),
				c.type === "article" && c.image ? (
					<div className="preview-cover">
						<img data-shared="image" src={Assets[c.image]} alt="" draggable={false} />
					</div>
				) : (
					""
				),
				"",
				c.body?.trim() ? <div className="reader-end" id="reader-end" aria-hidden="true" /> : null,
			)}
			{tools}
		</>
	);
}

export function readingContent(this: PanelRenderers, c: PreviewCard, app?: PreviewApp) {
	if (c.type === "media") return <MediaDetail key={c.id} card={c} app={app} full />;
	if (c.type === "mail")
		return mailPreview.call(this, c, {
			sheet: (inner) => inner,
			h1: (
				<>
					<h1 id="modal-title">{c.title}</h1>
					{this.tags(c)}
					{this.publication(c)}
				</>
			),
			tools: null,
		} as PreviewContext);
	return articleContent.call(this, c);
}

export function articleContent(this: PanelRenderers, c: PreviewCard, reading = true) {
	const cover = c.image ? (
		<>
			<div className={"preview-cover"}>
				<img data-shared={"image"} src={Assets[c.image]} alt={""} draggable={"false"} />
			</div>
		</>
	) : (
		""
	);
	return (
		<>
			<header className={`detail-header ${c.type === "suggestion" ? "" : "ruled-header"}`}>
				{c.type === "digest" ? (
					<div className="preview-meta">
						<SourceMark card={c} />
						<span>
							{[
								c.coverageStart !== undefined && c.coverageEnd !== undefined
									? `${dateLabel(c.coverageStart)} – ${dateLabel(c.coverageEnd)}`
									: cardSource(c),
								c.related?.length ? `${c.related.length}${copy("web.card.relatedCount")}` : "",
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</div>
				) : (
					this.meta(c)
				)}
				<h1 id="modal-title" data-shared="title">
					{c.title}
				</h1>
				{this.tags(c)}
				{c.type !== "digest" && this.publication(c)}
			</header>
			{reading && cover}
			{c.type === "suggestion" && <WhyDetails card={c} />}
			{c.type !== "suggestion" && <DetailText body={c.body} />}
			{["suggestion", "digest"].includes(c.type) && <RelatedCards card={c} />}
		</>
	);
}

function standaloneDisplay() {
	return (
		typeof window !== "undefined" &&
		(window.matchMedia?.("(max-width: 650px)").matches ||
			window.matchMedia?.("(display-mode: standalone)").matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true)
	);
}

export function relativeTime(ts?: any, now: any = Date.now()) {
	const min = Math.round((now - ts) / 60000);
	if (min < 1) return copy("web.cards.de6785d99e02");
	if (min < 60)
		return (
			<>
				{min}
				{copy("web.time.minutesAgoSuffix")}
			</>
		);
	const h = Math.round(min / 60);
	if (h < 24)
		return (
			<>
				{h}
				{copy("web.time.hoursAgoSuffix")}
			</>
		);
	return relativeDay(ts, now);
}
