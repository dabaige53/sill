import { type CSSProperties, Fragment, type ReactNode } from "react";
import { dateLabel, eventRelative, relativeDay, timeString } from "../atoms/primitives.ts";
import { Avatars } from "../atoms/react-primitives.tsx";
import { DetailSummary } from "../cards/card-blocks.tsx";
import { ReminderMark } from "../cards/card-face.tsx";
import { CardSchedule } from "../cards/card-schedule.tsx";
import { FileList, RelatedCards, TaskFacts } from "../cards/detail-blocks.tsx";
import { DetailText } from "../cards/markdown.tsx";
import { MediaDetail, type PlaybackApp } from "../cards/media-detail.tsx";
import { PullRequest } from "../cards/pull-request.tsx";
import {
	type DetailRecipe,
	detailRecipe,
	type Entry,
	entryName,
	entryOptions,
	readerRecipe,
} from "../cards/recipes.ts";
import { SourceMark } from "../cards/source-mark.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import {
	cardCover,
	cardDateLabel,
	cardReadingTime,
	cardSender,
	cardSource,
} from "../data/card-source.ts";
import { AssetTones } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import {
	agentAction,
	avatar,
	button,
	checkItem,
	icon,
	keyed,
	personalNote,
	SheetEdges,
} from "./panel-primitives.tsx";
import type { PanelRenderers } from "./panels-components.tsx";

import { VideoSurface } from "./video-surface.tsx";

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
/** Preview is the detail sheet; reader is the full-screen reading page. */
type Mode = "preview" | "reader";
type Scope = { mode: Mode; recipe: DetailRecipe; s: ReturnType<typeof Store.item> };
type DetailBlock = (
	this: PanelRenderers,
	card: PreviewCard,
	options: Record<string, any>,
	scope: Scope,
) => ReactNode;

export function previewView(this: PanelRenderers, app?: PreviewApp, c?: PreviewCard) {
	const recipe = detailRecipe(c);
	if (recipe.composite === "videoPlayer")
		return <VideoSurface key={c.id} card={c} app={app} renderers={this} />;
	const s = Store.item(c.id),
		note = personalNote(s.note);
	const tags = this.tags(c);
	const closeButton = button("x", copy("web.preview.close"), "close");
	const expand =
		c.body?.trim() && !standaloneDisplay() && ["article", "note", "digest", "mail"].includes(c.type)
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
						? ({ "--podcast-tone": AssetTones[cardCover(c)] || "var(--surface)" } as CSSProperties)
						: undefined
				}
			>
				{this.head(expand, closeButton)}
				<SheetEdges />
				{/* biome-ignore lint/a11y/useSemanticElements: The existing named scroll region must receive keyboard focus for scrolling and focus restoration. */}
				<div
					className={"sheet-scroll"}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: This scroll region needs keyboard focus for scrolling and focus restoration.
					tabIndex={0}
					role={"region"}
					aria-label={copy("web.preview.contentRegion")}
				>
					<div className="gesture-content">
						{cover}
						<div className={c.type === "article" ? "preview-body is-article" : "preview-body"}>
							{inner}
							{note}
							{this.foot(action, agentAction(app, c))}
							{end}
						</div>
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

	return detailPreview.call(this, c, context, recipe);
}

function coverImage(c: PreviewCard) {
	return (
		<div className={"preview-cover"}>
			<img
				referrerPolicy="no-referrer"
				onError={(event) => {
					event.currentTarget.style.opacity = "0";
				}}
				onLoad={(event) => {
					event.currentTarget.style.opacity = "1";
				}}
				data-shared={"image"}
				src={assetURL(cardCover(c))}
				alt={""}
				draggable={false}
			/>
		</div>
	);
}

function previewMeta(c: PreviewCard, label: ReactNode, size?: number) {
	return (
		<div className={"preview-meta"}>
			<SourceMark card={c} size={size} />
			<span>{label}</span>
		</div>
	);
}

/** Detail source lines, by the recipe's `line` option. */
const detailLines: Record<string, DetailBlock> = {
	meta(c) {
		return this.meta(c);
	},
	digest: (c) =>
		previewMeta(
			c,
			[
				cardSource(c),
				cardDateLabel(c),
				cardReadingTime(c),
				c.related?.length ? `${c.related.length}${copy("web.card.relatedCount")}` : "",
			]
				.filter(Boolean)
				.join(" · "),
		),
	task: (c) => previewMeta(c, copy("web.task"), 15),
	reminder: (c) => previewMeta(c, copy("web.reminder"), 15),
};

const detailBlocks: Record<string, DetailBlock> = {
	source(c, o, scope) {
		return (detailLines[o.line] || detailLines.meta).call(this, c, o, scope);
	},
	sender(c) {
		const sender = cardSender(c);
		return sender ? (
			<div className={"preview-sender"}>
				{avatar(sender, 36)}
				<span>
					<b>{sender}</b>
					<small>
						{[cardSource(c), cardDateLabel(c), cardReadingTime(c)].filter(Boolean).join(" · ")}
					</small>
				</span>
			</div>
		) : (
			this.meta(c)
		);
	},
	eventDate: (c) => (
		<div className={"preview-meta"}>
			{dateLabel(c.start)}
			{eventRelative(c) ? (
				<>
					{" · "}
					<span className="event-relative">{eventRelative(c)}</span>
				</>
			) : (
				""
			)}
		</div>
	),
	timeSpan: (c) => (
		<div className={"event-hero"}>
			<span className={"num"}>{timeString(c.start)}</span>
			<small className={"num"}>
				{copy("web.templates.83532308ecca")}
				{timeString(c.end)}
				{" · "}
				{Math.round((c.end - c.start) / 60000)}
				{copy("web.templates.40de54344d22")}
			</small>
		</div>
	),
	title(c, o, { mode, recipe }) {
		const h1 = (
			<h1 id="modal-title" data-shared={mode === "preview" || recipe.end ? "title" : undefined}>
				{c.title}
			</h1>
		);
		if (o.bare) return h1;
		return (
			<>
				{h1}
				{this.tags(c)}
				{o.publication === false ? null : this.publication(c)}
			</>
		);
	},
	tags(c) {
		return this.tags(c);
	},
	schedule: (c, _o, { s }) => <CardSchedule card={c} state={s} />,
	reminderMark: (c, _o, { s }) => <ReminderMark card={c} done={!!s.reminderDone} />,
	cover: (c, _o, { mode }) => (cardCover(c) && mode === "reader" ? coverImage(c) : null),
	body: (c, o) =>
		o.section === "agenda" ? (
			c.body?.trim() && (
				<section className="detail-section">
					<h2>{copy("web.card.agenda")}</h2>
					<DetailText body={c.body} />
				</section>
			)
		) : (
			<DetailText body={c.body} outline={!!o.outline && c.type === "article"} />
		),
	files: (c) => <FileList files={c.files} />,
	participants: (c) =>
		c.people?.length ? (
			<div className="detail-row detail-people">
				<Avatars names={c.people} />
				<span>{c.people.join("、")}</span>
			</div>
		) : null,
	references: (c) => <RelatedCards card={c} />,
	facts: (c) => <TaskFacts card={c} />,
	checklist: (c) => (
		<div className={"detail-task-list"}>{keyed(Store.tasks(c).map((t) => checkItem(c, t)))}</div>
	),
	info(c, o) {
		if (o.style === "line")
			return c.project ? (
				<p className="preview-published">
					{copy("web.metadata.project")} · {c.project.name}
				</p>
			) : null;
		const rows = [
			c.meeting ? (
				<div className={"detail-row meeting-row"} key="meeting">
					<span className={"row-icon"}>{icon("video", 16)}</span>
					<span className="meeting-info">
						<span className="meeting-name">{c.meeting.name}</span>
						{c.meeting.code && <small className="meeting-code num">{c.meeting.code}</small>}
					</span>
				</div>
			) : null,
			c.location ? (
				<div className={"detail-row"} key="location">
					<span className={"row-icon"}>{icon("pin", 16)}</span>
					<span>{c.location}</span>
				</div>
			) : null,
		].filter(Boolean);
		return rows.length ? <div className={"detail-rows"}>{keyed(rows)}</div> : null;
	},
};

const detailGroups: Record<string, string> = {
	reminderRow: "reminder-row preview-title-row",
};

function renderDetail(
	this: PanelRenderers,
	entries: Entry[] | undefined,
	c: PreviewCard,
	scope: Scope,
): ReactNode[] {
	return (entries || []).map((entry, key) => {
		if (typeof entry !== "string" && "group" in entry)
			return (
				// biome-ignore lint/suspicious/noArrayIndexKey: Recipe entries are fixed per card type.
				<div className={detailGroups[entry.group]} key={key}>
					{renderDetail.call(this, entry.blocks, c, scope)}
				</div>
			);
		const block = detailBlocks[entryName(entry)];
		return (
			// biome-ignore lint/suspicious/noArrayIndexKey: Recipe entries are fixed per card type.
			<Fragment key={key}>{block?.call(this, c, entryOptions(entry), scope)}</Fragment>
		);
	});
}

/** One detail surface: the recipe's head inside the header, then its body blocks. */
function detailContent(
	this: PanelRenderers,
	c: PreviewCard,
	recipe: DetailRecipe,
	mode: Mode,
	s: ReturnType<typeof Store.item>,
) {
	const scope = { mode, recipe, s };
	return (
		<>
			<header className={`detail-header ${recipe.ruled ? "ruled-header" : ""}`}>
				{renderDetail.call(this, recipe.head, c, scope)}
			</header>
			<DetailSummary card={c} />
			{renderDetail.call(this, recipe.body, c, scope)}
		</>
	);
}

function detailPreview(
	this: PanelRenderers,
	c: PreviewCard,
	{ app, s, sheet, tools }: PreviewContext,
	recipe: DetailRecipe,
) {
	if (recipe.composite === "podcastDetail")
		return (
			<>
				{sheet(<MediaDetail key={c.id} card={c} app={app} />)}
				{tools}
			</>
		);
	if (recipe.composite === "pullRequest")
		return (
			<>
				{sheet(<PullRequest card={c} detail />)}
				{tools}
			</>
		);
	const hoisted = recipe.body?.some(
		(entry) => entryName(entry) === "cover" && entryOptions(entry).preview === "hoist",
	);
	return (
		<>
			{sheet(
				detailContent.call(this, c, recipe, "preview", s),
				hoisted && cardCover(c) ? coverImage(c) : "",
				"",
				recipe.end && c.body?.trim() ? (
					<div className="reader-end" id="reader-end" aria-hidden="true" />
				) : null,
			)}
			{tools}
		</>
	);
}

export function readingContent(this: PanelRenderers, c: PreviewCard, app?: PreviewApp) {
	const recipe = readerRecipe(c);
	if (recipe.composite === "videoPlayer" || recipe.composite === "podcastDetail")
		return <MediaDetail key={c.id} card={c} app={app} full />;
	return detailContent.call(this, c, recipe, "reader", Store.item(c.id));
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
