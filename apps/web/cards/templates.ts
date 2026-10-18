import { icon } from "../atoms/icons.ts";
import {
	avatar,
	avatars,
	button,
	checkItem,
	checkMark,
	dateLabel,
	duration,
	esc,
	eventEnded,
	eventRelative,
	eventTimely,
	minutes,
	pill,
	reminderClock,
	ring,
	timeString,
} from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardSource, cardSourceKind } from "../data/card-source.ts";
import { AssetTones, CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";

/** One renderer for the live feed; design-system/ documents the same blocks. Rendering never mutates Store.
 * A card is a stack of blocks: head · media · text · data · list · act. Content is read here; actions go back to the source.
 */
const CardPresentation: Record<string, any> = {
	state(c?: any, options: any = {}) {
		const defaults: Record<string, any> = {
			seen: false,
			read: false,
			bookmarked: false,
			later: false,
			selected: false,
			progress: 0,
			snoozedUntil: 0,
			dismissed: false,
			reminderDone: false,
		};
		return {
			...defaults,
			...(options.state !== undefined ? options.state : Store.state.items[c.id] || {}),
		};
	},
	tasks(c?: any, state?: any) {
		return (c.tasks || []).map((t?: any) => ({
			...t,
			done: Array.isArray(state.taskDone) ? state.taskDone.includes(t.id) : t.done,
		}));
	},
	action(
		ctx?: any,
		glyph?: any,
		label?: any,
		action?: any,
		id: any = "",
		extra: any = "",
		className: any = "",
	) {
		return ctx.passive
			? `<span class="icon-button ${className}" role="img" aria-label="${esc(label)}">${icon(glyph)}</span>`
			: button(glyph, label, action, id, extra, className);
	},
	sourceIcon(c?: any, size: any = 16) {
		if (c.sources?.length > 1)
			return `<span class="source-icons" aria-hidden="true">${c.sources
				.slice(0, 3)
				.map((s?: any) => `<span>${icon(SourceKinds[s.kind]?.icon || "book", 12)}</span>`)
				.join("")}</span>`;
		// Content shows where it came from; things to do show what they are.
		const byType = ["task", "event", "reminder", "digest", "photo", "file"].includes(c.type);
		return icon(
			byType
				? (CardTypes[c.type] || CardTypes.note).icon
				: SourceKinds[cardSourceKind(c)]?.icon || (CardTypes[c.type] || CardTypes.note).icon,
			size,
		);
	},
};
const CardTemplates: Record<string, any> = {
	head(c?: any, ctx?: any, text?: any, right: any = "") {
		return `<div class="card-head">${CardPresentation.sourceIcon(c)}<span class="card-src">${esc(text)}</span>${right ? `<span class="card-head-right">${right}</span>` : ""}</div>`;
	},
	sourceLine(c?: any) {
		return [
			c.sources?.length > 1
				? c.sources.map((s?: any) => s.name).join(" · ")
				: cardSource(c) || (CardTypes[c.type] || CardTypes.note).label,
			// A relation lists its cards below; a count in the head would say it twice.
			c.type === "suggestion" && c.related?.length ? "" : c.meta,
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
	summary(c?: any, short: any = false) {
		if (c.points?.length)
			return `${c.summary ? `<p class="card-summary clamp-2">${esc(c.summary)}</p>` : ""}<ol class="key-points">${c.points
				.slice(0, 3)
				.map((p?: any, i?: any) => `<li><i class="num">${i + 1}</i><span>${esc(p)}</span></li>`)
				.join("")}</ol>`;
		return c.summary
			? `<p class="card-summary ${short ? "clamp-2" : ""}">${esc(c.summary)}</p>`
			: "";
	},
	cover(c?: any, ctx?: any, inner: any = "") {
		const tone = AssetTones[c.image] || "var(--surface)";
		return `<div class="card-cover" style="background:${tone}"><img class="card-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false" loading="lazy" decoding="async">${inner}</div>`;
	},
	article(c?: any, ctx?: any) {
		return `${c.image ? this.cover(c, ctx) : ""}<div class="card-body">${this.head(c, ctx, this.sourceLine(c), this.progress(c, ctx))}${this.title(c, ctx)}${this.summary(c, !!c.image)}</div>`;
	},
	mail(c?: any, ctx?: any) {
		const sender = c.sender || cardSource(c) || copy("web.mail");
		return `<div class="card-body"><div class="sender">${avatar(sender)}<span><b>${esc(sender)}</b><small>${copy("web.mail")}${c.meta ? " · " + esc(c.meta) : ""}</small></span></div>${this.title(c, ctx)}${this.summary(c)}${c.attachment ? `<span class="ref attachment">${icon("file", 15)}<span>${esc(c.attachment)}</span></span>` : ""}</div>`;
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
		if (tasks.length > 0 && done === tasks.length && !held.length)
			return `<div class="card-body done-row"><span class="done-mark">${icon("check", 14)}</span><span class="done-copy"><small>${copy("web.templates.f838d1ef1773")}${tasks.length}${copy("web.templates.f9d529eacdf3")}</small>${this.title(c, ctx)}</span></div>`;
		const item = (t?: any) =>
			ctx.passive
				? `<div class="check-item ${t.done ? "is-done" : ""}" role="img" aria-label="${esc(t.text)}：${t.done ? copy("web.templates.f28461bb49c8") : copy("web.templates.6707de42c29d")}">${checkMark(t.done)}<span>${esc(t.text)}</span></div>`
				: checkItem(c, t);
		// Preserve the current keyboard preview until focus leaves the card; Store keeps its order.
		const ordered = [...tasks.filter((t?: any) => !t.done), ...tasks.filter((t?: any) => t.done)];
		const visible = [...held, ...ordered.filter((t?: any) => !held.includes(t))].slice(0, 3);
		return `<div class="card-body">${this.head(c, ctx, c.meta || copy("web.task"), tasks.length ? `<span class="num task-count">${done}/${tasks.length}</span>` : "")}${this.title(c, ctx)}${tasks.length ? `<div class="checklist">${visible.map(item).join("")}</div>` : this.summary(c)}${tasks.length > 3 ? `<span class="more-items">${copy("web.templates.dff74742a6f0")}${tasks.length - 3}${copy("web.templates.f9d529eacdf3")}</span>` : ""}</div>`;
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
		const mark = ctx.passive
			? `<span class="check-dot ${done ? "is-done" : ""}" aria-hidden="true">${done ? icon("check", 12) : ""}</span>`
			: `<button type="button" class="reminder-check" data-action="${done ? "restore-reminder" : "complete-reminder"}" data-id="${esc(c.id)}" aria-pressed="${done}" aria-label="${done ? copy("web.reminder.restore") : copy("web.reminder.complete")}"><span class="check-dot ${done ? "is-done" : ""}" aria-hidden="true">${done ? icon("check", 12) : ""}</span></button>`;
		return `<div class="card-body">${this.head(c, ctx, [...new Set([copy("web.reminder"), cardSource(c)].filter(Boolean))].join(" · "), time)}
   <div class="reminder-row">${mark}${this.title(c, ctx)}</div>${c.summary ? `<p class="card-summary indent">${esc(c.summary)}</p>` : ""}</div>`;
	},
	media(c?: any, ctx?: any) {
		const s = ctx.state;
		if (c.media === "podcast") {
			const total = c.duration || 0,
				played = total * (s.progress || 0);
			return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c), this.progress(c, ctx))}${this.title(c, ctx)}${this.summary(c, true)}
     <div class="mini-player"><span class="mini-play" aria-hidden="true">${icon("play", 14)}</span><span class="bar"><i style="width:${Math.round((s.progress || 0) * 100)}%"></i></span><span class="num">${played ? "-" + duration(total - played) : duration(total)}</span></div></div>`;
		}
		const inner = `<span class="play-mark" aria-hidden="true">${icon("play", 18)}</span>${c.duration ? `<span class="media-length num">${duration(c.duration)}</span>` : ""}`;
		return `${c.image ? this.cover(c, ctx, inner) : ""}<div class="card-body">${this.head(c, ctx, this.sourceLine(c), this.progress(c, ctx))}${this.title(c, ctx)}</div>`;
	},
	digest(c?: any, ctx?: any) {
		const preview = {
			...c,
			summary: c.summary || (c.points?.length ? "" : c.body?.[0] || ""),
		};
		return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c))}${this.title(c, ctx)}${this.summary(preview)}</div>`;
	},
	suggestion(c?: any, ctx?: any) {
		const related = (c.related || [])
				.map((id?: any) => Store.card(id))
				.filter(Boolean)
				.slice(0, 2),
			tag = ctx.passive ? "span" : "button";
		return `<div class="card-body">${this.head(c, ctx, this.sourceLine(c))}${this.title(c, ctx)}${this.summary(c)}<div class="refs" aria-label="${copy("web.templates.9f2ab3a03303")}">${related.map((r?: any) => `<${tag}${ctx.passive ? "" : ` type="button" data-action="card-open" data-id="${esc(r.id)}"`} class="ref">${icon((CardTypes[r.type] || CardTypes.note).icon, 15)}<span>${esc(r.title)}</span>${icon("chevron", 14)}</${tag}>`).join("")}</div></div>`;
	},
	photo(c?: any, ctx?: any) {
		const photos = c.photos?.length ? c.photos : [c.image];
		return `<div class="card-cover photo-grid n${Math.min(3, photos.length)}">${photos
			.slice(0, 3)
			.map(
				(p?: any) =>
					`<img class="card-image" src="${Assets[p]}" alt="" draggable="false" loading="lazy" decoding="async" style="background:${AssetTones[p]}">`,
			)
			.join(
				"",
			)}</div><div class="card-body">${this.head(c, ctx, [copy("web.photo"), c.location || c.meta].filter(Boolean).join(" · "), photos.length > 3 ? `<span class="num">${photos.length}</span>` : "")}${this.title(c, ctx)}</div>`;
	},
	file(c?: any, ctx?: any) {
		const files = c.files || [];
		return `<div class="card-body">${this.head(c, ctx, [copy("web.file"), cardSource(c)].filter(Boolean).join(" · "), c.meta ? esc(c.meta) : "")}${this.title(c, ctx)}<div class="file-rows">${files
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
	options = options && typeof options === "object" ? options : {};
	const s = CardPresentation.state(c, options),
		tasks = CardPresentation.tasks(c, s),
		isDone =
			(c.type === "task" && tasks.length && tasks.every((t?: any) => t.done)) ||
			(c.type === "reminder" && s.reminderDone);
	const ctx: Record<string, any> = {
		state: s,
		tasks,
		taskPreviewOrder:
			!options.passive && Array.isArray(options.taskPreviewOrder) ? options.taskPreviewOrder : [],
		passive: !!options.passive,
		now: options.now ?? Date.now(),
	};
	const read = (CardTypes[c.type] || CardTypes.note).readable && s.read && Store.pref("fadeRead");
	const ended = c.type === "event" && eventEnded(c, ctx.now);
	const attributes = ctx.passive
		? ' data-passive="true"'
		: ` tabindex="0" data-card="${esc(c.id)}"`;
	const covered = (c.image && ["article", "media"].includes(c.type)) || c.type === "photo";
	return `<article class="feed-card ${options.compact ? "" : "feed-item"} type-${esc(c.type)} ${covered ? "has-cover" : ""} ${options.compact ? "is-compact" : ""} ${read ? "is-read" : ""} ${ended ? "is-ended" : ""} ${s.bookmarked ? "is-bookmarked" : ""} ${s.selected ? "is-selected" : ""} ${s.snoozedUntil > 0 ? "is-snoozed" : ""} ${isDone ? "is-complete" : ""}"${attributes} aria-label="${esc((CardTypes[c.type] || CardTypes.note).label + "：" + c.title + (s.read ? copy("web.templates.732aa8f1efe5") : ""))}">
 ${Object.hasOwn(CardTypes, c.type) && Object.hasOwn(CardTemplates, c.type) ? CardTemplates[c.type](c, ctx) : CardTemplates.article(c, ctx)}
 </article>`;
}
/** A burst from one source, folded. Opening it expands in place; nothing navigates. */
function stackHTML(key?: any, cards?: any) {
	// A deck: one whole card per piece, in the same place. Swipe moves the top card away; tap spreads the pile out in place.
	const top = cards[0],
		n = cards.length;
	const face = (c?: any, i?: any) =>
		`<div class="deck-card${i === 0 ? " is-top" : i === 1 ? " is-next" : ""}" data-index="${i}"${i ? ' aria-hidden="true"' : ""}><div class="card-body">${CardTemplates.head(c, { state: {} }, cardSource(c), `<span class="num stack-count"><span class="stack-pos">${i + 1}</span>/${n}</span>`)}<h2 class="card-title">${i === 0 ? `<button type="button" class="card-title-button" data-action="stack-open" data-extra="${esc(key)}">${esc(c.title)}</button>` : esc(c.title)}</h2>${c.summary ? `<p class="card-summary clamp-2">${esc(c.summary)}</p>` : ""}</div></div>`;
	return `<article class="feed-card feed-item stack-card" tabindex="0" data-stack="${esc(key)}" aria-label="${esc(`${cardSource(top)}：${n}${copy("web.templates.50091bfc40b5")}`)}">
 <span class="deck-edge deep" aria-hidden="true"></span><span class="deck-edge" aria-hidden="true"></span><div class="deck">${cards.map(face).join("")}</div></article>`;
}
function stackOpenHTML(key?: any, cards?: any) {
	return `<section class="feed-item stack-open" data-stack-open="${esc(key)}"><div class="stack-open-head">${icon(SourceKinds[cardSourceKind(cards[0])]?.icon || "rss", 15)}<span>${esc(cardSource(cards[0]))} · <span class="num">${cards.length}</span></span><button type="button" class="text-link" data-action="stack-close" data-extra="${esc(key)}">${copy("web.templates.afd4b783536b")}</button></div>${cards.map((c?: any) => cardHTML(c, { compact: true })).join("")}</section>`;
}
/** The two quiet rows at the end of the desk: what was read, and what waited too long. */
function shelfHTML(read?: any, stale?: any) {
	if (!read && !stale) return "";
	return `<nav class="feed-item shelf-entry" aria-label="${copy("web.templates.25775c98c7b8")}">${read ? `<button type="button" class="shelf-row" data-action="archive" data-extra="read">${icon("ring", 16)}<b>${copy("web.templates.7b7e6e8bd4ba")}</b><span>${copy("web.templates.08ae1ab86ff2")}</span><span class="num">${read}</span></button>` : ""}${stale ? `<button type="button" class="shelf-row" data-action="archive" data-extra="stale">${icon("clock", 16)}<b>${copy("web.templates.709b79e460c8")}</b><span>${copy("web.templates.77edd3c039f9")}</span><span class="num">${stale}</span></button>` : ""}</nav>`;
}

export { CardPresentation, CardTemplates, cardHTML, shelfHTML, stackHTML, stackOpenHTML };
