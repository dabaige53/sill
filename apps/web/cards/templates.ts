import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { icon } from "../atoms/icons.ts";
import { markdownBlocks } from "../atoms/markdown.ts";
import {
	avatar,
	avatars,
	checkItem,
	checkMark,
	dateLabel,
	esc,
	eventRelative,
	eventTimely,
	pill,
	reminderClock,
	ring,
	shortDay,
	timeString,
} from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import {
	articleDate,
	cardReadingTime,
	cardSource,
	cardSourceKind,
	contentDay,
} from "../data/card-source.ts";
import { AssetTones, CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { CardView, OpenStackView, ShelfView, StackView } from "./components.tsx";
import { CardPresentation, reminderMark } from "./presentation.ts";
import { Media } from "./media-card.tsx";
import { publicationName } from "./source-mark.tsx";

export { CardView, OpenStackView, reminderMark, ShelfView, StackView };

const CardTemplates: Record<string, any> = {
	head(c?: any, ctx?: any, text?: any, right: any = "") {
		return `<div class="card-head">${CardPresentation.sourceIcon(c)}<span class="card-src">${esc(text)}</span>${right ? `<span class="card-head-right">${right}</span>` : ""}</div>`;
	},
	sourceLine(c?: any, date: Date | null = null) {
		return [
			(["article", "media"].includes(c.type) ? publicationName(c) : cardSource(c)) ||
				(CardTypes[c.type] || CardTypes.note).label,
			date ? shortDay(date.getTime()) : "",
			// A relation lists its cards below; a count in the head would say it twice.
			cardReadingTime(c),
		]
			.filter(Boolean)
			.join(" · ");
	},
	// Unfinished reading shows its percentage; a finished read changes the card color instead.
	progress(c?: any, ctx?: any) {
		const s = ctx.state;
		if (!(CardTypes[c.type] || CardTypes.note).readable || s.read || !(s.progress > 0)) return "";
		return `<span class="card-progress num">${ring(s.progress, 14)}${Math.round(s.progress * 100)}%</span>`;
	},
	title(c?: any, ctx?: any, className: any = "") {
		const tag = ctx.passive ? "span" : "button",
			attributes = ctx.passive
				? ""
				: ` type="button" data-action="card-open" data-id="${esc(c.id)}"`;
		return `<h2 class="card-title ${className}"><${tag}${attributes} class="card-title-button" data-shared="title">${esc(c.title)}</${tag}></h2>`;
	},
	// @design card-summary
	summary(c?: any, short: any = false) {
		const summary = c.summary || markdownBlocks(c.body || "")[0] || "";
		return summary
			? `<p class="card-summary ${c.type === "article" || c.type === "mail" ? "reading-summary" : short ? "clamp-2" : ""}">${esc(summary)}</p>`
			: "";
	},
	cover(c?: any, ctx?: any, inner: any = "") {
		const tone = AssetTones[c.image] || "var(--surface)";
		return `<div class="card-cover" style="background:${tone}"><img class="card-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false" loading="lazy" decoding="async">${inner}</div>`;
	},
	article(c?: any, ctx?: any) {
		return `${c.image ? this.cover(c, ctx) : ""}<div class="card-body">${this.head(c, ctx, this.sourceLine(c, articleDate(c)), this.progress(c, ctx))}${this.title(c, ctx)}${this.summary(c)}</div>`;
	},
	mail(c?: any, ctx?: any) {
		const sender = c.sender?.trim();
		return `<div class="card-body">${sender ? `<div class="sender">${avatar(sender)}<span><b>${esc(sender)}</b><small>${copy("web.mail")}${c.sentAt ? " · " + esc(dateLabel(Date.parse(c.sentAt))) : ""}${cardReadingTime(c) ? " · " + esc(cardReadingTime(c)) : ""}</small></span></div>` : this.head(c, ctx, [cardSource(c) || copy("web.mail"), c.sentAt ? dateLabel(Date.parse(c.sentAt)) : "", cardReadingTime(c)].filter(Boolean).join(" · "))}${this.title(c, ctx)}${this.summary(c)}${c.attachment ? `<span class="file-row attachment">${icon("file", 15)}<span>${esc(c.attachment)}</span></span>` : ""}</div>`;
	},
	note(c?: any, ctx?: any) {
		if (cardSourceKind(c) !== "capture" && c.form !== "quote")
			return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c), this.progress(c, ctx))}${this.title(c, ctx)}${this.summary(c)}</div>`;
		if (c.form === "quote")
			return `<div class="card-body quote-body">${this.head(c, ctx, this.sourceLine(c))}${this.title(c, ctx, "quote-text")}</div>`;
		// A quick note is its own text; the title only names it in search and archives.
		const tag = ctx.passive ? "span" : "button",
			attributes = ctx.passive
				? ""
				: ` type="button" data-action="card-open" data-id="${esc(c.id)}" aria-label="${esc(c.title)}"`;
		return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c))}<h2 class="card-title note-text"><${tag}${attributes} class="card-title-button" data-shared="title">${esc(c.summary || c.title)}</${tag}></h2></div>`;
	},
	task(c?: any, ctx?: any) {
		const tasks = ctx.tasks,
			done = tasks.filter((t?: any) => t.done).length,
			byId = new Map(tasks.map((t?: any) => [t.id, t])),
			held = [...new Set(ctx.taskPreviewOrder)].map((id) => byId.get(id)).filter(Boolean);
		const item = (t?: any) =>
			ctx.passive
				? `<div class="check-item ${t.done ? "is-done" : ""}" role="img" aria-label="${esc(t.text)}：${t.done ? copy("web.templates.f28461bb49c8") : copy("web.templates.6707de42c29d")}">${checkMark(t.done)}<span>${esc(t.text)}</span></div>`
				: checkItem(c, t);
		// Preserve the current keyboard preview until focus leaves the card; Store keeps its order.
		const ordered = [...tasks.filter((t?: any) => !t.done), ...tasks.filter((t?: any) => t.done)];
		const visible = [...held, ...ordered.filter((t?: any) => !held.includes(t))].slice(0, 3);
		return `<div class="card-body">${this.head(c, ctx, c.project?.name || copy("web.task"), tasks.length ? `<span class="num task-count">${done}/${tasks.length}</span>` : "")}${this.title(c, ctx)}${tasks.length ? `<div class="checklist">${visible.map(item).join("")}</div>` : this.summary(c)}${tasks.length > 3 ? `<span class="more-items">${copy("web.templates.dff74742a6f0")}${tasks.length - 3}${copy("web.templates.f9d529eacdf3")}</span>` : ""}</div>`;
	},
	event(c?: any, ctx?: any) {
		const span = Math.round((c.end - c.start) / 60000),
			timely = eventTimely(c, ctx.now) && c.meeting,
			relative = eventRelative(c, ctx.now);
		return `<div class="card-body">${this.head(c, ctx, dateLabel(c.start), relative ? `<span class="event-relative">${esc(relative)}</span>` : "")}
   <div class="event-time"><span class="num event-start">${timeString(c.start)}</span><span class="event-end"><span class="num">${copy("web.templates.83532308ecca")}${timeString(c.end)}</span><small>${copy("web.templates.2428420e407f")}${span}${copy("web.templates.40de54344d22")}</small></span></div>
   ${this.title(c, ctx)}${c.people?.length ? `<div class="people">${avatars(c.people)}<span>${esc(c.people.join("、"))}</span></div>` : ""}
   ${timely && !ctx.passive ? `<div class="card-actions-row">${pill(copy("web.templates.451755e3831f"), "join", c.id, "primary", "", `${copy("web.templates.451755e3831f")}${c.meeting.name}`)}</div>` : ""}</div>`;
	},
	// The head shows the source's own time; the circle is the only action and only changes Sill.
	reminder(c?: any, ctx?: any) {
		const s = ctx.state,
			done = !!s.reminderDone,
			when = FeedPolicy.reminderTime(c, s, ctx.now);
		const time = when
			? `<span class="reminder-label num ${when.due ? "is-due" : ""}">${esc(reminderClock(when.at, ctx.now))}</span>`
			: "";
		const mark = reminderMark(c, done, ctx.passive);
		return `<div class="card-body">${this.head(c, ctx, [...new Set([copy("web.reminder"), cardSource(c)].filter(Boolean))].join(" · "), time)}
   <div class="reminder-row">${mark}${this.title(c, ctx)}</div>${c.summary ? `<p class="card-summary indent">${esc(c.summary)}</p>` : ""}</div>`;
	},
	media(c?: any, ctx?: any) {
		return renderToStaticMarkup(createElement(Media, { card: c, ctx }));
	},
	digest(c?: any, ctx?: any) {
		const preview = {
			...c,
			summary: c.summary || markdownBlocks(c.body || "")[0] || "",
		};
		return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c))}${this.title(c, ctx)}${this.summary(preview)}</div>`;
	},
	suggestion(c?: any, ctx?: any) {
		const allRelated = (c.related || []).map((id?: any) => Store.card(id)).filter(Boolean),
			related = allRelated.slice(0, 2),
			tag = ctx.passive ? "span" : "button";
		return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c))}${this.title(c, ctx)}${this.summary(c)}<div class="refs" aria-label="${copy("web.templates.9f2ab3a03303")}">${related.map((r?: any) => `<${tag}${ctx.passive ? "" : ` type="button" data-action="card-open" data-id="${esc(r.id)}"`} class="ref">${icon((CardTypes[r.type] || CardTypes.note).icon, 15)}<span>${esc(r.title)}</span>${icon("chevron", 14)}</${tag}>`).join("")}</div>${allRelated.length > 2 ? `<span class="more-items related-more">${copy("web.templates.dff74742a6f0")}${allRelated.length - 2}${copy("web.related.moreSuffix")}</span>` : ""}</div>`;
	},
	photo(c?: any, ctx?: any) {
		const photos = c.photos?.length ? c.photos : [c.image];
		const taken = contentDay(c.takenAt);
		return `<div class="card-cover photo-grid n${Math.min(3, photos.length)}">${photos
			.slice(0, 3)
			.map(
				(p?: any) =>
					`<img class="card-image" src="${Assets[p]}" alt="" draggable="false" loading="lazy" decoding="async" style="background:${AssetTones[p]}">`,
			)
			.join(
				"",
			)}</div><div class="card-body">${this.head(c, ctx, [copy("web.photo"), c.location, taken ? shortDay(taken.getTime()) : ""].filter(Boolean).join(" · "), photos.length > 3 ? `<span class="num">${photos.length}</span>` : "")}${this.title(c, ctx)}</div>`;
	},
	file(c?: any, ctx?: any) {
		const files = c.files || [];
		return `<div class="card-body">${this.head(c, ctx, [copy("web.file"), cardSource(c), cardReadingTime(c)].filter(Boolean).join(" · "), "")}${this.title(c, ctx)}<div class="file-rows">${files
			.slice(0, 3)
			.map(
				(f?: any) =>
					`<span class="file-row">${icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? "image" : "file", 15)}<span>${esc(f.name)}</span></span>`,
			)
			.join(
				"",
			)}</div>${files.length > 3 ? `<span class="more-items">${copy("web.templates.dff74742a6f0")}${files.length - 3}${copy("web.templates.7aaf96ad52e0")}</span>` : ""}</div>`;
	},
};
function cardHTML(c?: any, options: any = {}) {
	return renderToStaticMarkup(createElement(CardView, { card: c, options }));
}
function stackHTML(key?: any, cards?: any) {
	return renderToStaticMarkup(createElement(StackView, { stackKey: key, cards }));
}
function stackOpenHTML(key?: any, cards?: any) {
	return renderToStaticMarkup(createElement(OpenStackView, { stackKey: key, cards }));
}
function shelfHTML(read?: any, stale?: any) {
	return renderToStaticMarkup(createElement(ShelfView, { read, stale }));
}

export { CardPresentation, CardTemplates, cardHTML, shelfHTML, stackHTML, stackOpenHTML };
