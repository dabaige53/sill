import { type ReactElement, type ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { dateLabel, eventTimely } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardDates, cardSource, cardSourceKind, detailSource } from "../data/card-source.ts";
import { CardTypes, SourceKinds } from "../data/cards.ts";
import type { CardItem } from "../data/store.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import {
	type PanelRenderers,
	type PreviewApp,
	type PreviewCard,
	type ToolbarAction,
} from "./panel-contract.ts";
import { agentAction, button, keyed, ownButton, sourceIcon } from "./panel-primitives.tsx";
import { previewView as preview } from "./previews-components.tsx";

export const panelCard = {
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
	publication(this: PanelRenderers, c?: Record<string, unknown>) {
		const date = cardDates(c).published;
		const [year, month, day] = date?.text.slice(0, 10).split("-").map(Number) || [];
		const label = date
			? new Intl.DateTimeFormat("zh-CN", {
					year: year === new Date().getFullYear() ? undefined : "numeric",
					month: "long",
					day: "numeric",
				}).format(new Date(year, month - 1, day))
			: "";
		return date ? (
			<div className="preview-published">
				<time dateTime={date.datetime} title={date.text}>
					{label}
				</time>
			</div>
		) : null;
	},
	details(this: PanelRenderers, c?: Pick<Card, "type" | "meta"> & Record<string, unknown>) {
		const note =
			c.meta?.trim() && !["task", "reminder", "event", "mail", "file"].includes(c.type)
				? c.meta
				: "";
		return note ? (
			<div className="preview-source-details">
				{note ? <p className="preview-source-note">{note}</p> : null}
			</div>
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
	preview(this: PanelRenderers, app?: PreviewApp, c?: PreviewCard): ReactNode {
		return preview.call(this, app, c);
	},
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
											style={{ transform: `scaleX(${Math.max(0, Math.min(1, s.progress))})` }}
										></div>
										<div className={"reader-scroll"} id={"reader-scroll"}>
											<article className={"reader-body"}>
												{this.meta(c)}
												<h1 id={"modal-title"} data-shared={"title"}>
													{c.title}
												</h1>
												{this.tags(c)}
												{this.publication(c)}
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
												{loading ? "" : this.details(c)}
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
};
