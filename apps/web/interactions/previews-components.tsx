import type { ReactNode } from "react";
import React from "react";
import {
	dateLabel,
	duration,
	eventRelative,
	relativeDay,
	reminderClock,
	timeString,
} from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardDate, cardReadingTime, cardSource, fileDescription } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
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
type PreviewApp = {
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
	media: contentPreview,
	file: filePreview,
	task: taskReminderPreview,
	reminder: taskReminderPreview,
} satisfies Record<string, PreviewRenderer>;

export function previewView(this: PanelRenderers, app?: PreviewApp, c?: PreviewCard) {
	const s = Store.item(c.id),
		note = personalNote(s.note);
	const tags = this.tags(c);
	const closeButton = button("x", copy("web.preview.close"), "close");
	const expand =
		c.body?.length &&
		!standaloneDisplay() &&
		!["event", "mail", "media", "task", "reminder", "digest", "file"].includes(c.type)
			? button("expand", copy("web.preview.fullscreen"), "reader", c.id)
			: "";
	const sheet = (
		inner: ReactNode,
		cover: ReactNode = "",
		action: ReactNode = "",
		end: ReactNode = "",
	) => (
		<>
			<div className={"sheet preview-sheet"}>
				{this.head(expand, closeButton)}
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
	if (c.type === "media" && c.media === "podcast") return podcastPreview.call(this, c, context);
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
						{sender ? (
							<div className={"preview-sender"}>
								{avatar(sender, 36)}
								<span>
									<b>{sender}</b>
									<small>
										{[cardDate(c.sentAt)?.text, cardReadingTime(c)].filter(Boolean).join(" · ")}
									</small>
								</span>
							</div>
						) : (
							this.meta(c)
						)}
						{h1}
						<div className={"preview-full"}>
							{keyed(
								(c.body || [c.summary]).map((p?: any) => (
									<>
										<p>{p}</p>
									</>
								)),
							)}
						</div>
						{c.attachment ? (
							<>
								<span className={"ref attachment"}>
									{icon("file", 15)}
									<span>{c.attachment}</span>
								</span>
							</>
						) : (
							""
						)}
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
						{keyed(
							c.body?.length ? (
								<>
									<div className={"preview-full"}>
										{keyed(
											c.body.map((p?: any) => (
												<>
													<p>{p}</p>
												</>
											)),
										)}
									</div>
								</>
							) : (
								""
							),
						)}
					</>,
				),
			)}
			{tools}
		</>
	);
}

function podcastPreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { app, s, h1, tools, closeButton } = context;

	return (
		<>
			{
				<>
					<div className={"sheet preview-sheet"}>
						{this.head(closeButton)}
						{/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keep the podcast scroll container keyboard-accessible and preserve restored focus. */}
						<div className={"sheet-scroll"} tabIndex={0}>
							<div className={"player"}>
								<div className={"player-art"}></div>
								{h1}
								{this.meta(c)}
								{c.duration !== undefined && (
									<div className="player-times num">{duration(c.duration)}</div>
								)}
								{c.summary && <p className="preview-lead">{c.summary}</p>}
								{c.body?.length ? (
									<div className="preview-full">
										{c.body.map((p, index) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: Paragraphs may repeat; these static text rows have no component state.
											<p key={index}>{p}</p>
										))}
									</div>
								) : null}
								<p className="empty-description">{copy("web.media.playbackUnavailable")}</p>
								{personalNote(s.note)}
								{this.foot(agentAction(app, c))}
							</div>
						</div>
					</div>
				</>
			}
			{tools}
		</>
	);
}

function filePreview(this: PanelRenderers, c: PreviewCard, context: PreviewContext) {
	const { sheet, h1, tools } = context;

	return (
		<>
			{keyed(
				sheet(
					<>
						<div className={"preview-meta"}>
							{icon("folder", 15)}
							<span>
								{copy("web.preview.fileSourcePrefix")}
								{[cardSource(c), cardReadingTime(c)].filter(Boolean).join(" · ")}
							</span>
						</div>
						{h1}
						<div className={"detail-rows"}>
							{keyed(
								(c.files || []).map((f?: any) => (
									<>
										<div className={"detail-row"}>
											<span className={"row-icon"}>
												{icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? "image" : "file", 16)}
											</span>
											<span>
												<b>{f.name}</b>
												<em>{fileDescription(f)}</em>
											</span>
											<small>{f.modifiedAt || ""}</small>
										</div>
									</>
								)),
							)}
						</div>
					</>,
				),
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
						{icon((CardTypes[c.type] || CardTypes.note).icon, 15)}
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
					{c.summary ? (
						<>
							<p className={"preview-lead"}>{c.summary}</p>
						</>
					) : (
						""
					)}
					{keyed(list)}
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
				articleContent.call(this, c),
				"",
				"",
				c.body?.length ? <div className="reader-end" id="reader-end" aria-hidden="true" /> : null,
			)}
			{tools}
		</>
	);
}

export function articleContent(this: PanelRenderers, c: PreviewCard) {
	const lead =
		c.summary && c.form !== "quote" && c.summary !== c.body?.[0] ? (
			<>
				<p className={"preview-lead"}>{c.summary}</p>
			</>
		) : (
			""
		);
	const points = c.points?.length ? (
		<>
			<ol className={"key-points"}>
				{keyed(
					c.points.map((p?: any, i?: any) => (
						<>
							<li>
								<i className={"num"}>{i + 1}</i>
								<span>{p}</span>
							</li>
						</>
					)),
				)}
			</ol>
		</>
	) : (
		""
	);
	const related =
		c.type === "suggestion" ? (
			<>
				<div className={"refs"}>
					{keyed(
						(c.related || [])
							.map((id?: any) => Store.card(id))
							.filter(Boolean)
							.map((r?: any) => (
								<>
									<button
										type={"button"}
										className={"ref"}
										data-action={"card-open"}
										data-id={r.id}
									>
										{icon(CardTypes[r.type].icon, 15)}
										<span>{r.title}</span>
										{icon("chevron", 14)}
									</button>
								</>
							)),
					)}
				</div>
			</>
		) : (
			""
		);
	const full = c.body?.length ? (
		<>
			<div className={"preview-full"}>
				{keyed(
					c.body.map((p?: any) => (
						<>
							<p>{p}</p>
						</>
					)),
				)}
			</div>
		</>
	) : (
		""
	);
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
			{this.meta(c)}
			<h1 id="modal-title" data-shared="title">
				{c.title}
			</h1>
			{this.tags(c)}
			{this.publication(c)}
			{c.type === "media" && c.duration !== undefined ? (
				<div className="player-times num">{duration(c.duration)}</div>
			) : null}
			{cover}
			{lead}
			{points}
			{related}
			{full}
		</>
	);
}

function standaloneDisplay() {
	return (
		typeof window !== "undefined" &&
		(window.matchMedia?.("(display-mode: standalone)").matches ||
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
