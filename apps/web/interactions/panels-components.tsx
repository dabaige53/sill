import React, { type ReactElement, type ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import type { CardAction } from "../../../contracts/card-actions.ts";
import { CardActions } from "../../../contracts/card-actions.ts";
import { dateLabel, eventRelative, eventTimely, timeString } from "../atoms/primitives.ts";
import { SelectionBar } from "../atoms/selection.tsx";
import { CardView } from "../cards/components.tsx";
import { type CopyKey, copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardDates, cardSource, cardSourceKind, detailSource } from "../data/card-source.ts";
import { CardTypes, SourceKinds } from "../data/cards.ts";
import type { CardItem, Preferences } from "../data/store.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "../views/app.ts";
import {
	agentAction,
	button,
	icon,
	keyed,
	ownButton,
	segmented,
	sillIcon,
	sourceIcon,
	TrustedFragment,
	toggle,
} from "./panel-primitives.tsx";
import { previewView as preview, relativeTime } from "./previews-components.tsx";

type ToolbarAction = [CardAction, ReactNode];
const actionTypeExamples = {
	bookmark: "web.actions.example.all",
	tag: "web.actions.example.all",
	later: "web.actions.example.all",
	reply: "web.actions.example.mail",
	open: "web.actions.example.source",
	join: "web.actions.example.event",
	snooze: "web.actions.example.reminder",
	download: "web.actions.example.event",
	dismiss: "web.actions.example.reminder",
} satisfies Record<CardAction, CopyKey>;
type PreviewApp = {
	agentAction?: (card: Card) => string;
	agentActionView?: (card: Card) => ReactNode;
};
type SearchApp = Pick<AppController, "searchFilter" | "searchAll" | "searchLimit" | "feedNow">;
/** Legacy callers may retain an unrecognized display form; the renderer keeps its fallback. */
type PreviewCard = { [K in keyof Card]: K extends "form" ? string : Card[K] };

type Fragments = ReactNode[];
interface PanelRenderers {
	close(label?: string): ReactNode;
	meta(card?: Card): ReactNode;
	tags(card?: Card): ReactNode;
	details(card?: Pick<Card, "type" | "meta"> & Record<string, unknown>): ReactNode;
	bookmark(card?: Card, state?: CardItem): ReactNode;
	later(card?: Card, state?: CardItem): ReactNode;
	bar(...parts: Fragments): ReactNode;
	sep: ReactNode;
	tools(card?: Card, state?: CardItem, own?: ToolbarAction[]): ReactNode;
	own(card?: Card): ToolbarAction[];
	head(...tools: Fragments): ReactNode;
	foot(...actions: Fragments): ReactNode;
	reminderTools(card?: Card): ReactNode;
	externalLabel(card?: Card): string;
	readButton(card?: Card, state?: Pick<CardItem, "progress" | "read">): ReactNode;
	preview(app?: PreviewApp, card?: PreviewCard): ReactNode;
	reader(app?: PreviewApp, card?: Card, loading?: boolean): ReactNode;
	lightbox(card?: Card, index?: number, app?: PreviewApp): ReactNode;
	editor(
		app?: Pick<AppController, "editTags"> & { cloudSavedAccount?: boolean },
		id?: string,
	): ReactNode;
	search(app?: SearchApp): ReactNode;
	searchResults(app?: SearchApp): ReactNode;
	archive(app?: Pick<AppController, "shelved">, which?: string): ReactNode;
	settingsGroups: string[][];
	settings(
		app?: Partial<AppController> & { cloudSettingsContent?: ReactNode },
		group?: string,
	): ReactNode;
	confirm(title?: string, detail?: string, actions?: ReactNode): ReactNode;
	ai(
		app?: Pick<AppController, "aiSelectionIds"> & Partial<Pick<AppController, "aiDraft">>,
	): ReactNode;
	capture(app?: unknown): ReactNode;
}

/** Overlay entry points share card renderers in previews.ts; AppController owns state and focus. */
const PanelViews: PanelRenderers = {
	close(this: PanelRenderers, label?: string) {
		return (
			<>
				<div className={"sheet-close"}>{button("x", label, "close")}</div>
			</>
		);
	},
	meta(this: PanelRenderers, c?: Card) {
		return (
			<>
				<div className={"preview-meta"}>
					{sourceIcon(c, 15)}
					<span>{detailSource(c) || (CardTypes[c.type] || CardTypes.note).label}</span>
				</div>
			</>
		);
	},
	tags(this: PanelRenderers, c?: Card) {
		return Store.tags(c).length ? (
			<>
				<div className={"preview-tags"}>
					{keyed(
						Store.tags(c).map((t) => (
							<>
								<span className={"chip soft"}>
									{"#"}
									{t}
								</span>
							</>
						)),
					)}
				</div>
			</>
		) : (
			""
		);
	},
	details(this: PanelRenderers, c?: Pick<Card, "type" | "meta"> & Record<string, unknown>) {
		const dates = cardDates(c);
		// A row without a value says nothing; it is left out rather than shown as unknown.
		const row = (label: string, date: ReturnType<typeof cardDates>["created"]) =>
			date ? (
				<>
					<div className={"preview-detail-row"}>
						<dt>{label}</dt>
						<dd>
							<time dateTime={date.datetime}>{date.text}</time>
						</dd>
					</div>
				</>
			) : (
				""
			);
		const rows = [
			row(copy("web.metadata.published"), dates.published),
			row(copy("web.metadata.saved"), dates.saved),
			row(copy("web.metadata.created"), dates.created),
			row(
				copy("web.metadata.updated"),
				dates.updated && dates.updated.datetime !== dates.created?.datetime ? dates.updated : null,
			),
			c.meta && !["task", "reminder", "event", "mail", "file"].includes(c.type) ? (
				<>
					<div className={"preview-detail-row preview-source-note"}>
						<dt>{copy("web.metadata.note")}</dt>
						<dd>{c.meta}</dd>
					</div>
				</>
			) : (
				""
			),
		];
		return rows.some(Boolean) ? (
			<>
				<dl className={"preview-details"} aria-label={copy("web.metadata.label")}>
					{keyed(rows)}
				</dl>
			</>
		) : (
			""
		);
	},
	bookmark(this: PanelRenderers, c?: Card, s?: CardItem) {
		return button(
			"bookmark",
			s.bookmarked ? copy("web.preview.removeBookmark") : copy("web.bookmark"),
			"bookmark",
			c.id,
			"",
			s.bookmarked ? "active" : "",
		);
	},
	later(this: PanelRenderers, c?: Card, s?: CardItem) {
		return button(
			"glasses",
			s.later ? copy("web.preview.removeLater") : copy("web.later"),
			"later",
			c.id,
			"",
			s.later ? "active" : "",
		);
	},
	bar(this: PanelRenderers, ...parts: ReactNode[]) {
		return (
			<>
				<div
					className={"float-bar glass"}
					role={"toolbar"}
					aria-label={copy("web.preview.cardTools")}
				>
					{keyed(parts.filter(Boolean))}
				</div>
			</>
		);
	},
	sep: (
		<>
			<span className={"toolbar-sep"} aria-hidden={"true"}></span>
		</>
	),
	/** Every card's toolbar: the shared verbs in ink, a rule, then at most three of this card's own verbs
	 * in accent. Icons only; the name lives in aria-label and shows on a long press. Settings can hide any. */
	tools(this: PanelRenderers, c?: Card, s?: CardItem, own: ToolbarAction[] = []): ReactNode {
		const hidden = new Set(Store.pref("hiddenActions") || []);
		const shared = (
			[
				["bookmark", this.bookmark(c, s)],
				["tag", button("tag", copy("web.editor.openTagsAndNote"), "edit", c.id)],
				["later", this.later(c, s)],
			] satisfies ToolbarAction[]
		)
			.filter(([key]) => !hidden.has(key))
			.map(([, html]) => html);
		const mine = own
			.filter(([key, html]) => html && !hidden.has(key))
			.slice(0, 3)
			.map(([, html]) => ownButton(html as ReactElement));
		if (!shared.length && !mine.length) return "";
		return this.bar(...shared, shared.length && mine.length ? this.sep : "", ...mine);
	},
	/** This card's own verbs, keyed for the settings switches. Leaving Sill is an icon with the source in its name. */
	own(this: PanelRenderers, c?: Card): ToolbarAction[] {
		const s = Store.item(c.id);
		const open = c.url ? button("external", this.externalLabel(c), "external", c.id) : "";
		const reminder: ToolbarAction = FeedPolicy.supports(c)
			? // A finished reminder is restored by its own circle, so the toolbar does not repeat it.
				s.dismissed || s.snoozedUntil || (s.reminderDone && c.type !== "reminder")
				? ["snooze", button("bell", copy("web.templates.4b03be14c1f4"), "restore-reminder", c.id)]
				: ["snooze", button("snooze", copy("web.reminder.again"), "snooze", c.id)]
			: ["snooze", ""];
		const dismiss: ToolbarAction = ["dismiss", this.reminderTools(c)];
		if (c.type === "mail")
			return [["reply", c.url ? button("reply", copy("web.preview.reply"), "external", c.id) : ""]];
		if (c.type === "event") {
			const join: ToolbarAction = [
				"join",
				eventTimely(c) && c.meeting
					? button("video", copy("web.templates.451755e3831f"), "join", c.id)
					: "",
			];
			const download: ToolbarAction = [
				"download",
				button("download", copy("web.preview.downloadCalendar"), "download-calendar", c.id),
			];
			return join[1] ? [join, reminder, dismiss, download] : [join, reminder, download, dismiss];
		}
		if (c.type === "task" || c.type === "reminder") return [reminder, dismiss];
		if (c.type === "file") return [];
		return [["open", open]];
	},
	/** The sheet head holds the way out (and full screen) in its own row, never over the text. */
	head(this: PanelRenderers, ...tools: ReactNode[]) {
		return (
			<>
				<button
					type={"button"}
					className={"sheet-handle"}
					aria-label={copy("web.panels.resizeSheet")}
					aria-expanded={"false"}
				>
					<span className={"grabber"} aria-hidden={"true"}></span>
				</button>
				<div className={"sheet-head"}>
					<div className={"sheet-head-tools"}>{keyed(tools.filter(Boolean))}</div>
				</div>
			</>
		);
	},
	/** Specific actions in words, after the content: they never compete with the toolbar icons. */
	foot(this: PanelRenderers, ...actions: ReactNode[]) {
		const list = actions.filter(Boolean);
		return list.length ? (
			<>
				<div className={"preview-foot"}>{keyed(list)}</div>
			</>
		) : (
			""
		);
	},
	/** The toolbar keeps the generic verb as an icon: stop reminding. */
	reminderTools(this: PanelRenderers, c?: Card) {
		if (!FeedPolicy.supports(c)) return "";
		const s = Store.item(c.id);
		if (s.dismissed || s.reminderDone || s.snoozedUntil) return "";
		return button("bell-off", copy("web.preview.dismissReminder"), "dismiss-reminder", c.id);
	},
	externalLabel(this: PanelRenderers, c?: Card) {
		if (c.type === "media" && c.media === "podcast") return copy("web.preview.podcast.openApp");
		const kind = SourceKinds[cardSourceKind(c)]?.label;
		return `${copy("web.preview.openSourcePrefix")}${kind && !["RSS", copy("web.local"), copy("web.cards.e727b8cc2df0")].includes(kind) ? kind : copy("web.preview.originalSource")}`;
	},
	readButton(this: PanelRenderers, c?: Card, s?: Pick<CardItem, "progress" | "read">) {
		const p = Math.round((s.progress || 0) * 100);
		return (
			<>
				<button type={"button"} className={"solid-button"} data-action={"reader"} data-id={c.id}>
					{s.read
						? copy("web.reader.readAgain")
						: p > 0
							? copy("web.reader.continueReading")
							: copy("web.cards.ce9b12499c47")}
					{p > 0 && !s.read ? (
						<>
							{" "}
							<small>
								{p}
								{"%"}
							</small>
						</>
					) : (
						""
					)}
				</button>
			</>
		);
	},
	/* Preview: content is read here; actions go back to where they belong. */
	preview(this: PanelRenderers, app?: PreviewApp, c?: PreviewCard): ReactNode {
		return preview.call(this, app, c);
	},
	/* Reader: a page with a thin progress line. Reaching the end closes the ring. */
	reader(this: PanelRenderers, app?: PreviewApp, c?: Card, loading = false) {
		const s = Store.item(c.id);
		const body = loading ? (
			<>
				<div className={"skeleton-lines"} aria-hidden={"true"}>
					<i></i>
					<i></i>
					<i></i>
					<i></i>
				</div>
			</>
		) : (
			c.body.map((p) => (
				<>
					<p>{p}</p>
				</>
			))
		);
		return (
			<>
				{
					<>
						{
							<>
								{
									<>
										<div
											className={"reader-progress"}
											id={"reader-progress"}
											style={{ width: "" + Math.round(s.progress * 100) + "%" }}
										></div>
										<div className={"reader-scroll"} id={"reader-scroll"}>
											<article className={"reader-body"}>
												{this.meta(c)}
												<h1 id={"modal-title"} data-shared={"title"}>
													{c.title}
												</h1>
												{this.tags(c)}
												{this.details(c)}
												{c.image ? (
													<>
														<img
															className={"reader-cover"}
															src={Assets[c.image]}
															alt={""}
															draggable={"false"}
														/>
													</>
												) : (
													""
												)}
												<div className={"reading-caption sr-only"}>
													{[cardSource(c), c.meta].filter(Boolean).join(" · ")}
												</div>
												{keyed(body)}
												{loading ? "" : this.foot(agentAction(app, c))}
												<div className={"reader-end"} id={"reader-end"} aria-hidden={"true"}></div>
											</article>
										</div>
									</>
								}
								{
									<>
										<div className={"reader-edge is-top"} aria-hidden={"true"}></div>
										<div className={"reader-edge is-bottom"} aria-hidden={"true"}></div>
									</>
								}
							</>
						}
						{
							<>
								<div
									className={"reader-head glass"}
									role={"toolbar"}
									aria-label={copy("web.readerTools")}
								>
									{button("collapse", copy("web.reader.exitFullscreen"), "close")}
									{button("x", copy("web.reader.close"), "close-all")}
								</div>
							</>
						}
					</>
				}
				{this.tools(c, s, this.own(c))}
			</>
		);
	},
	lightbox(this: PanelRenderers, c?: Card, index = 0, app?: PreviewApp) {
		const photos = c.photos?.length ? c.photos : [c.image];
		const i = Math.max(0, Math.min(photos.length - 1, index));
		return (
			<>
				<div className={"lightbox-top"}>
					<span>{[c.location, dateLabel(c.time)].filter(Boolean).join(" · ")}</span>
					<span id={"modal-title"} className={"sr-only"}>
						{c.title}
					</span>
					{button("x", copy("web.photo.close"), "close")}
				</div>
				{"\n   "}
				<div className={"lightbox-stage"}>
					{photos.length > 1
						? button("back", copy("web.photo.previous"), "photo-step", c.id, "-1")
						: ""}
					<img
						src={Assets[photos[i]]}
						alt={
							"" +
							c.title +
							"" +
							copy("web.photo.altIndexPrefix") +
							"" +
							(i + 1) +
							"" +
							copy("web.common.cardCountSuffix") +
							""
						}
					/>
					{photos.length > 1
						? button("arrow", copy("web.photo.next"), "photo-step", c.id, "1")
						: ""}
				</div>
				{"\n   "}
				<div className={"lightbox-thumbs"}>
					{keyed(
						photos.map((p, n) => (
							<>
								<button
									type={"button"}
									className={n === i ? "on" : ""}
									data-action={"photo-go"}
									data-id={c.id}
									data-extra={n}
									aria-label={
										"" +
										copy("web.photo.indexPrefix") +
										"" +
										(n + 1) +
										"" +
										copy("web.common.cardCountSuffix") +
										""
									}
								>
									<img src={Assets[p]} alt={""} />
								</button>
							</>
						)),
					)}
				</div>
				{this.tools(c, Store.item(c.id))}
				{this.foot(agentAction(app, c))}
			</>
		);
	},
	/* Tags and notes: chips you can remove, a field to add, a note below. */
	editor(
		this: PanelRenderers,
		app?: Pick<AppController, "editTags"> & { cloudSavedAccount?: boolean },
		id?: string,
	) {
		const c = Store.card(id),
			s = Store.item(id),
			current = [...app.editTags];
		const suggest = [
			...new Set<string>([
				...(c.tags || []),
				copy("web.cards.bc62d1b6b936"),
				copy("web.cards.ce9b12499c47"),
				copy("web.cards.0e65f5e407c4"),
				copy("web.cards.56c255e19858"),
				"AI",
				copy("web.cards.15d208d1b4c9"),
			]),
		]
			.filter((t) => !app.editTags.has(t))
			.slice(0, 6);
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.editor.closeTagsAndNote"))}
					<div className={"panel-content"}>
						<div className={"panel-sub"} id={"modal-title"}>
							{c.title}
						</div>
						{"\n   "}
						<div className={"tag-editor"} id={"editor-tags"}>
							{keyed(
								current.map((t) => (
									<>
										<span className={"tag-pill"}>
											{t}
											<button
												type={"button"}
												data-action={"editor-tag"}
												data-extra={t}
												aria-label={"" + copy("web.editor.removeTagPrefix") + "" + t + ""}
											>
												{icon("x", 12)}
											</button>
										</span>
									</>
								)),
							)}
							<input
								id={"tag-new"}
								aria-label={copy("web.editor.newTagLabel")}
								placeholder={copy("web.editor.addTagPlaceholder")}
								maxLength={30}
							/>
						</div>
						{"\n   "}
						{keyed(
							suggest.length ? (
								<>
									<div className={"chip-suggest"}>
										{keyed(
											suggest.map((t) => (
												<>
													<button
														type={"button"}
														className={"chip soft"}
														data-action={"editor-tag"}
														data-extra={t}
													>
														{t}
													</button>
												</>
											)),
										)}
									</div>
								</>
							) : (
								""
							),
						)}
						{"\n   "}
						<label className={"sr-only"} htmlFor={"note-editor"}>
							{copy("web.editor.noteLabel")}
						</label>
						<textarea
							className={"editor-note"}
							id={"note-editor"}
							maxLength={4000}
							placeholder={copy("web.editor.notePlaceholder")}
							defaultValue={s.note}
						/>
						{"\n   "}
						<div className={"panel-footer"}>
							<span className={"muted"}>
								{app?.cloudSavedAccount ? (
									copy("web.cloud.savedAccount")
								) : (
									<>
										{icon("lock", 13)}
										{copy("web.editor.deviceStorageHint")}
									</>
								)}
							</span>
							<button
								type="button"
								className={"solid-button"}
								data-action={"save-note"}
								data-id={id}
							>
								{copy("web.save")}
							</button>
						</div>
					</div>
				</div>
			</>
		);
	},
	/* Search: field, chips, and grouped results. Archived matches come last. */
	search(this: PanelRenderers, app?: SearchApp) {
		const f = app.searchFilter,
			tags = [...new Set<string>(Store.state.cards.flatMap((c?: Card) => Store.tags(c)))].slice(
				0,
				8,
			);
		const types = [
			["all", copy("web.all"), ""],
			["article", copy("web.search.type.article"), "book"],
			["mail", copy("web.search.type.mail"), "mail"],
			["note", copy("web.note"), "note"],
			["task", copy("web.task"), "check-circle"],
			["event", copy("web.event"), "calendar"],
			["media", copy("web.media"), "video"],
		];
		const status = [
			["unread", copy("web.unread")],
			["saved", copy("web.bookmark")],
			["later", copy("web.later")],
		];
		const row = (label: CopyKey, buttons: ReactNode) =>
			React.Children.count(buttons) ? (
				<>
					<div className={"search-filter-row"}>
						<span className={"search-filter-label"} aria-hidden={"true"}>
							{copy(label)}
						</span>
						{/* biome-ignore lint/a11y/useSemanticElements: Keep the existing filter layout; aria-label names this non-form button group. */}
						<div className={"search-filter-items"} role={"group"} aria-label={copy(label)}>
							{buttons}
						</div>
					</div>
				</>
			) : (
				""
			);
		return (
			<>
				<h1 id={"modal-title"} className={"sr-only"}>
					{copy("web.search.title")}
				</h1>
				<div className={"search-header"}>
					<div className={"search-pill"}>
						{icon("search", 18)}
						<input
							type={"search"}
							id={"filter-search"}
							aria-label={copy("web.search.inputLabel")}
							placeholder={copy("web.search.inputPlaceholder")}
							defaultValue={f.query}
							data-input={"search"}
							autoComplete={"off"}
						/>
						<span
							className={"search-count num sr-only"}
							id={"filter-result"}
							role={"status"}
							aria-live={"polite"}
							aria-atomic={"true"}
						>
							{Object.values(app.searchAll(f.query)).flat().length}
							{copy("web.common.cardCountSuffix")}
						</span>
						{f.query ? button("x", copy("web.search.clear"), "clear-query") : ""}
					</div>
					{button("x", copy("web.close"), "close")}
				</div>
				{"\n   "}
				{/* biome-ignore lint/a11y/useSemanticElements: This existing group contains filter button groups, not form fields. */}
				<div className={"search-chips"} role={"group"} aria-label={copy("web.search.filtersLabel")}>
					{keyed(
						row(
							"web.search.filters.type",
							types.map(([k, v, ic]) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.type === k ? "active" : "") + ""}
										data-action={"filter-type"}
										data-extra={k}
										aria-pressed={f.type === k}
									>
										{v}
									</button>
								</>
							)),
						),
					)}
					{keyed(
						row(
							"web.search.filters.status",
							status.map(([k, v]) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.status === k ? "active" : "") + ""}
										data-action={"filter-status"}
										data-extra={k}
										aria-pressed={f.status === k}
									>
										{v}
									</button>
								</>
							)),
						),
					)}
					{keyed(
						row(
							"web.search.filters.tag",
							tags.map((t) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.tag === t ? "active" : "") + ""}
										data-action={"filter-tag"}
										data-extra={t}
										aria-pressed={f.tag === t}
									>
										{"#"}
										{t}
									</button>
								</>
							)),
						),
					)}
				</div>
				{"\n   "}
				<div className={"search-results"} id={"search-results"}>
					{this.searchResults(app)}
				</div>
				<SelectionBar id="search-selection-bar" />
			</>
		);
	},
	searchResults(this: PanelRenderers, app?: SearchApp) {
		const q = app.searchFilter.query.trim(),
			hits = app.searchAll(q);
		if (!hits.desk.length && !hits.shelved.length)
			return (
				<>
					<p className={"search-empty"}>
						{copy("web.search.noResultsPrefix")}
						{q}
						{"」"}
					</p>
				</>
			);
		const desk = hits.desk.slice(0, app.searchLimit || 40),
			shelved = hits.shelved.slice(0, Math.max(0, (app.searchLimit || 40) - desk.length));
		const cards = (list: Card[]) => (
			<>
				<div className={"search-card-grid"}>
					{keyed(list.map((c) => <CardView key={c.id} card={c} options={{ now: app.feedNow }} />))}
				</div>
			</>
		);
		return (
			<>
				{desk.length ? cards(desk) : ""}
				{shelved.length ? (
					<>
						<div className={"group-label"}>{copy("web.search.shelvedGroup")}</div>
						{cards(shelved)}
					</>
				) : (
					""
				)}
			</>
		);
	},
	/* Archives: grouped by week, one row per card; “放回桌面” appears on hover. */
	archive(this: PanelRenderers, app?: Pick<AppController, "shelved">, which?: string) {
		const now = Date.now(),
			list = app.shelved(which).sort((a, b) => (b.time || 0) - (a.time || 0));
		const groups = new Map<string, Card[]>();
		for (const c of list) {
			const at = which === "read" ? Store.item(c.id).readAt || c.time : c.time,
				age = now - at,
				label =
					age < 7 * 86400000
						? copy("web.archive.thisWeek")
						: age < 14 * 86400000
							? copy("web.primitives.0cf8b14f4651")
							: copy("web.archive.earlier");
			(groups.get(label) || groups.set(label, []).get(label)).push(c);
		}
		const date = (ts?: number) => {
			const d = new Date(ts);
			return (
				<>
					{d.getMonth() + 1}
					{copy("web.primitives.1625179badc0")}
					{d.getDate()}
					{copy("web.primitives.85217f7aff77")}
				</>
			);
		};
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<div className={"panel-content"}>
						<div className={"panel-head"}>
							<h1 id={"modal-title"}>
								{which === "read"
									? copy("web.templates.7b7e6e8bd4ba")
									: copy("web.templates.709b79e460c8")}
							</h1>
							{which === "stale" && list.length ? (
								<>
									<button type={"button"} className={"text-link"} data-action={"archive-all"}>
										{copy("web.archive.archiveAll")}
									</button>
								</>
							) : (
								<>
									<span className={"muted num"}>{list.length}</span>
								</>
							)}
						</div>
						{"\n   "}
						<div
							className={"sheet-scroll"}
							style={{ maxHeight: "60vh", margin: "0 -28px", padding: "0 28px" }}
						>
							{keyed(
								list.length ? (
									[...groups].map(([label, cards]) => (
										<>
											<div className={"group-label"}>{label}</div>
											<div className={"row-list"}>
												{keyed(
													cards.map((c?: Card) => (
														<>
															<div className={"list-row hoverable"}>
																<span className={"row-icon"}>
																	{icon((CardTypes[c.type] || CardTypes.note).icon, 16)}
																</span>
																<button
																	type={"button"}
																	className={"row-main"}
																	data-action={"card-open"}
																	data-id={c.id}
																	style={{ textAlign: "left" }}
																>
																	<b>{c.title}</b>
																	<small>{cardSource(c) || ""}</small>
																</button>
																<span className={"row-side"}>
																	<span className={"row-date num"}>
																		{date(
																			which === "read" ? Store.item(c.id).readAt || c.time : c.time,
																		)}
																	</span>
																	<button
																		type={"button"}
																		className={"text-link row-put"}
																		data-action={"restore-card"}
																		data-id={c.id}
																	>
																		{copy("web.archive.restoreToDesk")}
																	</button>
																</span>
															</div>
														</>
													)),
												)}
											</div>
										</>
									))
								) : (
									<>
										<p className={"search-empty"}>{copy("web.archive.empty")}</p>
									</>
								),
							)}
						</div>
					</div>
				</div>
			</>
		);
	},
	/* Settings: five groups, one screen each. */
	settingsGroups: [
		["add", copy("web.settings.add"), "plus"],
		["desk", copy("web.common.desk"), "monitor"],
		["look", copy("web.settings.appearance"), "eye"],
		["keys", copy("web.settings.shortcuts"), "keyboard"],
		["data", copy("web.cloudentry.ebdc835e8f87"), "lock"],
	],
	settings(
		this: PanelRenderers,
		app?: Partial<AppController> & { cloudSettingsContent?: ReactNode },
		group = "desk",
	) {
		const p = <K extends keyof Preferences>(k?: K) => Store.pref(k),
			row = (label?: ReactNode, side?: ReactNode, example?: { text: string; id: string }) => (
				<>
					<div className={"setting-row"}>
						<span>
							{label}
							{example ? (
								<>
									<small className={"setting-example"} id={example.id}>
										{example.text}
									</small>
								</>
							) : (
								""
							)}
						</span>
						<span className={"setting-side"}>{side}</span>
					</div>
				</>
			);
		const pages: Record<string, () => ReactNode> = {
			// Adding lives here now: the same one field as the capture sheet. N still opens the sheet directly.
			add: () => (
				<>
					<h1 id={"modal-title"}>{copy("web.settings.add")}</h1>
					<div className={"settings-card settings-add"}>
						<div className={"capture-field"}>
							{icon("plus", 18)}
							<textarea
								id={"capture-text"}
								aria-label={copy("web.capture.placeholder")}
								placeholder={copy("web.capture.placeholder")}
								maxLength={4000}
								defaultValue={""}
							/>
						</div>
						<div className={"panel-footer"}>
							<span className={"muted"}>
								<kbd>{"N"}</kbd>
								{copy("web.capture.shortcutHint")}
							</span>
							<button type={"button"} className={"solid-button"} data-action={"capture-save"}>
								{copy("web.capture.save")}
							</button>
						</div>
					</div>
				</>
			),
			desk: () => (
				<>
					<h1 id={"modal-title"}>{copy("web.common.desk")}</h1>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.stackSameSource"),
							<>
								<span>{copy("web.settings.stackThreshold")}</span>
								{toggle("stack", p("stack"), copy("web.settings.stackSameSource"))}
							</>,
						)}
						{row(
							copy("web.settings.fadeRead"),
							toggle("fadeRead", p("fadeRead"), copy("web.settings.fadeRead")),
						)}
						{row(
							copy("web.settings.floatTimely"),
							toggle("floatTimely", p("floatTimely"), copy("web.settings.floatTimely")),
						)}
					</div>
					{"\n       "}
					<div className={"group-label"}>{copy("web.actions.title")}</div>
					<div className={"settings-card"}>
						{keyed(
							CardActions.map((key) =>
								row(
									copy(`web.actions.${key}`),
									toggle(
										key,
										!(p("hiddenActions") || []).includes(key),
										copy(`web.actions.${key}`),
										"action-toggle",
										`action-example-${key}`,
									),
									{ text: copy(actionTypeExamples[key]), id: `action-example-${key}` },
								),
							),
						)}
					</div>
					<p className={"settings-hint muted"}>{copy("web.actions.hint")}</p>
					{"\n       "}
					<div className={"settings-card"}>
						{row(
							copy("web.settings.collapseOnFinish"),
							toggle(
								"collapseOnFinish",
								p("collapseOnFinish"),
								copy("web.settings.collapseOnFinish"),
							),
						)}
						{row(
							copy("web.settings.newContentHint.label"),
							segmented(
								"newHint",
								[
									["away", copy("web.settings.newContentHint.awayFromTop")],
									["off", copy("web.settings.newContentHint.off")],
								],
								p("newHint"),
								copy("web.settings.newContentHint.label"),
							),
						)}
					</div>
				</>
			),
			look: () => (
				<>
					<h1 id={"modal-title"}>{copy("web.settings.appearance")}</h1>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.theme.label"),
							segmented(
								"theme",
								[
									["system", copy("web.settings.theme.system")],
									["light", copy("web.settings.theme.light")],
									["dark", copy("web.settings.theme.dark")],
								],
								p("theme"),
								copy("web.settings.theme.label"),
							),
						)}
						{row(
							copy("web.settings.cardWidth.label"),
							segmented(
								"density",
								[
									["compact", copy("web.settings.cardWidth.compact")],
									["standard", copy("web.settings.cardWidth.standard")],
									["roomy", copy("web.settings.cardWidth.roomy")],
								],
								p("density"),
								copy("web.settings.cardWidth.label"),
							),
						)}
						{row(
							copy("web.settings.reduceMotion"),
							toggle("reduceMotion", p("reduceMotion"), copy("web.settings.reduceMotion")),
						)}
						{row(
							copy("web.settings.reduceTransparency"),
							toggle(
								"reduceTransparency",
								p("reduceTransparency"),
								copy("web.settings.reduceTransparency"),
							),
						)}
					</div>
				</>
			),
			keys: () => (
				<>
					<h1 id={"modal-title"}>{copy("web.settings.shortcuts")}</h1>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.singleKeyShortcuts"),
							toggle(
								"singleKeyShortcuts",
								p("singleKeyShortcuts"),
								copy("web.settings.singleKeyShortcuts"),
							),
						)}
						{keyed(
							[
								[copy("web.search"), "⌘ K"],
								[copy("web.capture.title"), "N"],
								[copy("web.settings.shortcuts.openCard"), "Enter"],
								[copy("web.settings.shortcuts.closeOverlay"), "Esc"],
								[copy("web.settings.shortcuts.refresh"), "R"],
								[copy("web.settings.shortcuts.backToTop"), "T"],
							].map(([a, k]) =>
								row(
									a,
									k.split(" ").map((x) => (
										<>
											<kbd>{x}</kbd>
										</>
									)),
								),
							),
						)}
					</div>
				</>
			),
			data: () => (
				<>
					<h1 id={"modal-title"}>{copy("web.cloudentry.ebdc835e8f87")}</h1>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.storage.location"),
							<>
								<span>
									{window.__QG_LOCAL__
										? copy("web.settings.storage.localDirectory")
										: copy("web.settings.storage.browser")}
								</span>
							</>,
						)}
						{row(
							copy("web.settings.storage.usage"),
							<>
								<span className={"num"}>{formatBytes(Store.bytes())}</span>
							</>,
						)}
						{row(
							copy("web.settings.aiLocal"),
							toggle("aiLocal", p("aiLocal"), copy("web.settings.aiLocal")),
						)}
					</div>
					{"\n       "}
					<div className={"settings-card"}>
						{row(
							<>
								<button type={"button"} className={"text-link"} data-action={"export-all"}>
									{copy("web.settings.exportAllCards")}
								</button>
							</>,
							"",
						)}
						{row(
							<>
								<button type={"button"} className={"text-link warn"} data-action={"clear-all"}>
									{copy("web.settings.clearAllData")}
								</button>
							</>,
							"",
						)}
					</div>
				</>
			),
		};
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.settings.close"))}
					<div className={"settings-layout"}>
						<nav className={"settings-nav"} aria-label={copy("web.settings.groupsLabel")}>
							{keyed(
								this.settingsGroups.map(([k, v, ic]) => (
									<>
										<button
											type={"button"}
											className={k === group ? "on" : ""}
											data-action={"settings-group"}
											data-extra={k}
											aria-current={k === group}
										>
											{v}
										</button>
									</>
								)),
							)}
						</nav>
						<div className={"settings-main"}>
							{group === "data" && app?.cloudSettingsContent !== undefined
								? app.cloudSettingsContent
								: pages[group]()}
						</div>
					</div>
				</div>
			</>
		);
	},
	/* Sources: one dot says the state; only a broken source shows a button. */
	confirm(this: PanelRenderers, title?: string, detail?: string, actions?: ReactNode) {
		return (
			<>
				<div className={"sheet"}>
					<div className={"permission"}>
						<h1 id={"modal-title"}>{title}</h1>
						<p className={"muted"}>{detail}</p>
						<div className={"permission-actions"}>{actions}</div>
					</div>
				</div>
			</>
		);
	},
	/* AI: a place kept for the assistant. It says plainly that nothing works here yet. */
	ai(
		this: PanelRenderers,
		app?: Pick<AppController, "aiSelectionIds"> & Partial<Pick<AppController, "aiDraft">>,
	) {
		const cards = [...new Set<string>(app?.aiSelectionIds || [])]
			.map((id) => Store.card(id))
			.filter(Boolean);
		const context = cards.map((card) => {
			const excerpt = (card.summary || (card.body || []).join(" ") || "").slice(0, 180);
			return (
				<>
					<article key={card.id} className={"ai-context-card"} data-ai-context={card.id}>
						<h3>{card.title}</h3>
						{excerpt ? (
							<>
								<p>{excerpt}</p>
							</>
						) : (
							""
						)}
					</article>
				</>
			);
		});
		return (
			<>
				<div className={"sheet ai-conversation"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<header className={"ai-conversation-head"}>
						{icon("chat", 24)}
						<h1 id={"modal-title"}>{copy("web.ai.title")}</h1>
						<span className={"soon-badge"}>{copy("web.ai.soon")}</span>
					</header>
					<p id={"ai-availability"} className={"muted"}>
						{copy("web.ai.localOnly")}
					</p>
					<section className={"ai-context"} aria-label={copy("web.ai.context")}>
						{cards.length ? (
							keyed(context)
						) : (
							<>
								<p className={"muted ai-context-empty"}>{copy("web.ai.emptyContext")}</p>
							</>
						)}
					</section>
					<div className={"ai-composer"}>
						<textarea
							id={"ai-local-draft"}
							aria-label={copy("web.ai.composer")}
							aria-describedby={"ai-availability"}
							placeholder={copy("web.ai.placeholder")}
							maxLength={4000}
							rows={3}
							defaultValue={app?.aiDraft || ""}
						/>
						<button
							type={"button"}
							className={"icon-button"}
							disabled
							aria-label={copy("web.ai.sendUnavailable")}
						>
							{icon("send", 20)}
						</button>
					</div>
				</div>
			</>
		);
	},
	/* Capture: one field. A link becomes an article, a line becomes a note. */
	capture(this: PanelRenderers, app?: unknown) {
		const next = Store.state.cards
			.filter(
				(c?: Card) =>
					c.type === "event" && c.end > Date.now() && c.start - Date.now() < 3 * 3600000,
			)
			.sort((a, b) => a.start - b.start)[0];
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<div className={"panel-content"}>
						<h1 id={"modal-title"} className={"sr-only"}>
							{copy("web.capture.title")}
						</h1>
						<div className={"capture-field"}>
							{icon("plus", 18)}
							<textarea
								id={"capture-text"}
								aria-label={copy("web.capture.placeholder")}
								placeholder={copy("web.capture.placeholder")}
								maxLength={4000}
								defaultValue={""}
							/>
						</div>
						{"\n   "}
						{next ? (
							<>
								<div className={"next-event"}>
									<span className={"num"}>{timeString(next.start)}</span>
									<span>
										{next.title}
										<small>{eventRelative(next)}</small>
									</span>
									{eventTimely(next) && next.meeting ? (
										<>
											<button
												type={"button"}
												className={"solid-button"}
												data-action={"join"}
												data-id={next.id}
											>
												{copy("web.templates.451755e3831f")}
											</button>
										</>
									) : (
										""
									)}
								</div>
							</>
						) : (
							""
						)}
						{"\n   "}
						<div className={"panel-footer"}>
							<span className={"muted"}>
								<kbd>{"N"}</kbd>
								{copy("web.capture.shortcutHint")}
							</span>
							<button type={"button"} className={"solid-button"} data-action={"capture-save"}>
								{copy("web.capture.save")}
							</button>
						</div>
					</div>
				</div>
			</>
		);
	},
};

function WelcomeView({
	actions = null,
	detail = "",
}: {
	actions?: ReactNode;
	detail?: ReactNode;
} = {}) {
	return (
		<>
			<section className={"welcome"} aria-labelledby={"welcome-title"}>
				{sillIcon(72)}
				<h1 id={"welcome-title"}>{"Sill"}</h1>
				<p>{copy("web.welcome.tagline")}</p>
				{detail}
				<div className={"welcome-actions"}>
					{actions === null ? (
						<>
							<button type={"button"} className={"solid-button"} data-action={"capture"}>
								{copy("web.capture.title")}
							</button>
							<button type={"button"} className={"text-link"} data-action={"welcome-demo"}>
								{copy("web.welcome.viewDemo")}
							</button>
						</>
					) : (
						actions
					)}
				</div>
			</section>
		</>
	);
}

function formatBytes(n?: number) {
	return n < 1024
		? `${n} B`
		: n < 1048576
			? `${(n / 1024).toFixed(1)} KB`
			: n < 1073741824
				? `${(n / 1048576).toFixed(1)} MB`
				: `${(n / 1073741824).toFixed(1)} GB`;
}

export type { PanelRenderers };
export { formatBytes, PanelViews, relativeTime, WelcomeView };
