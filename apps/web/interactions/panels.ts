import { icon, sillIcon } from "../atoms/icons.ts";
import {
	avatar,
	button,
	checkItem,
	dateLabel,
	duration,
	esc,
	eventRelative,
	eventTimely,
	highlight,
	pill,
	relativeDay,
	segmented,
	timeString,
	toggle,
} from "../atoms/primitives.ts";
import { CardPresentation, CardTemplates } from "../cards/templates.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardSource, cardSourceKind } from "../data/card-source.ts";
import { CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";

/** Every overlay is built here. Panels return HTML; AppController owns state and focus. */
const Panels: Record<string, any> = {
	close(label?: any) {
		return `<div class="sheet-close">${button("x", label, "close")}</div>`;
	},
	meta(c?: any) {
		return `<div class="preview-meta">${CardPresentation.sourceIcon(c, 15)}<span>${esc(CardTemplates.sourceLine(c))}</span></div>`;
	},
	bookmark(c?: any, s?: any) {
		return button(
			"bookmark",
			s.bookmarked ? copy("web.panels.dca60869e7d2") : copy("web.bookmark"),
			"bookmark",
			c.id,
			"",
			s.bookmarked ? "active" : "",
		);
	},
	later(c?: any, s?: any) {
		return button(
			"glasses",
			s.later ? copy("web.panels.c4d2d1edba13") : copy("web.later"),
			"later",
			c.id,
			"",
			s.later ? "active" : "",
		);
	},
	bar(...parts: any[]) {
		return `<div class="float-bar glass" role="toolbar" aria-label="${copy("web.panels.c8bf87742cc0")}">${parts.filter(Boolean).join("")}</div>`;
	},
	sep: '<span class="toolbar-sep" aria-hidden="true"></span>',
	/** The sheet head holds the way out (and full screen) in its own row, never over the text. */
	head(...tools: any[]) {
		return `<div class="sheet-head"><div class="grabber" aria-hidden="true"></div><div class="sheet-head-tools">${tools.filter(Boolean).join("")}</div></div>`;
	},
	/** Specific actions in words, after the content: they never compete with the toolbar icons. */
	foot(...actions: any[]) {
		const list = actions.filter(Boolean);
		return list.length ? `<div class="preview-foot">${list.join("")}</div>` : "";
	},
	whyLink(c?: any) {
		return c.why
			? `<button type="button" class="text-button" data-action="why" data-id="${esc(c.id)}">${copy("web.panels.fdc032965548")}</button>`
			: "";
	},
	/** The toolbar keeps the generic verb as an icon: stop reminding. */
	reminderTools(c?: any) {
		if (!FeedPolicy.supports(c)) return "";
		const s = Store.item(c.id);
		if (s.dismissed || s.reminderDone || s.snoozedUntil) return "";
		return button("bell-off", copy("web.panels.311b1a019362"), "dismiss-reminder", c.id);
	},
	/** The same action row as on the card, with the same words, under the content. */
	reminderRow(c?: any) {
		if (!FeedPolicy.supports(c)) return "";
		const s = Store.item(c.id);
		const acts =
			s.dismissed || s.reminderDone || s.snoozedUntil
				? pill(copy("web.templates.4b03be14c1f4"), "restore-reminder", c.id, "soft")
				: pill(
						copy("web.templates.2d89d6318b38"),
						"snooze",
						c.id,
						"soft grow",
						"",
						copy("web.templates.5273ca462f40"),
					) +
					(c.type === "reminder"
						? pill(
								copy("web.done"),
								"complete-reminder",
								c.id,
								"primary",
								"",
								copy("web.templates.56c2b97093d8"),
							)
						: "");
		return `<div class="reminder-actions" role="group" aria-label="${copy("web.templates.9d9382cf8476")}">${acts}</div>`;
	},
	external(c?: any, label?: any) {
		if (!c.url) return "";
		const kind = SourceKinds[cardSourceKind(c)]?.label;
		return `<button type="button" class="solid-button" data-action="external" data-id="${esc(c.id)}">${esc(label || `${copy("web.panels.99ae21ea6c39")}${kind && !["RSS", copy("web.local"), copy("web.cards.e727b8cc2df0")].includes(kind) ? kind : copy("web.panels.354b28c85333")}`)}</button>`;
	},
	readButton(c?: any, s?: any) {
		const p = Math.round((s.progress || 0) * 100);
		return `<button type="button" class="solid-button" data-action="reader" data-id="${esc(c.id)}">${s.read ? copy("web.panels.04316fccb7c7") : p > 0 ? copy("web.panels.4ec2a77b1ae3") : copy("web.cards.ce9b12499c47")}${p > 0 && !s.read ? ` <small>${p}%</small>` : ""}</button>`;
	},
	/* Preview: content is read here; actions go back to where they belong. */
	preview(app?: any, c?: any) {
		const s = Store.item(c.id),
			note = s.note ? `<div class="preview-note">${esc(s.note)}</div>` : "";
		const tags = Store.tags(c).length
			? `<div class="preview-tags">${Store.tags(c)
					.map((t?: any) => `<span class="chip soft">#${esc(t)}</span>`)
					.join("")}</div>`
			: "";
		const closeButton = button("x", copy("web.panels.1eb05d311508"), "close");
		const expand = c.body?.length && !["event", "mail", "media", "task", "reminder", "digest", "file"].includes(c.type)
			? button("expand", copy("web.panels.22ea3f47fee8"), "reader", c.id)
			: "";
		const sheet = (inner?: any, cover: any = "", foot: any = "") =>
			`<div class="sheet preview-sheet">${this.head(expand, closeButton)}<div class="sheet-scroll" tabindex="0" role="region" aria-label="${copy("web.panels.a67b98c6cf92")}">${cover}<div class="preview-body">${inner}${note}${tags}${foot}</div></div></div>`;
				const editTags = button("tag", copy("web.panels.786e2e9252a8"), "edit", c.id);
		const h1 = `<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>`;
		if (c.type === "mail") {
			const sender = c.sender || cardSource(c);
			return (
				sheet(
					`<div class="preview-sender">${avatar(sender, 36)}<span><b>${esc(sender)}</b><small>${copy("web.panels.711078d887e0")}${esc(c.meta || "")}</small></span></div>${h1}<div class="preview-full">${(c.body || [c.summary]).map((p?: any) => `<p>${esc(p)}</p>`).join("")}</div>${c.attachment ? `<span class="ref attachment">${icon("file", 15)}<span>${esc(c.attachment)}</span></span>` : ""}`,
					"",
					this.foot(this.external(c, copy("web.panels.cf945e21ddef"))),
				) + this.bar(this.bookmark(c, s), editTags, this.later(c, s))
			);
		}
		if (c.type === "event") {
			const span = Math.round((c.end - c.start) / 60000),
				timely = eventTimely(c);
			const rows = [
				c.meeting
					? `<div class="detail-row"><span class="row-icon">${icon("video", 16)}</span><span>${esc(c.meeting.name)}</span><small class="num">${esc(c.meeting.code || "")}</small></div>`
					: "",
				c.location
					? `<div class="detail-row"><span class="row-icon">${icon("pin", 16)}</span><span>${esc(c.location)}</span></div>`
					: "",
				c.people?.length
					? `<div class="detail-row"><span class="row-icon">${icon("at", 16)}</span><span>${esc(c.people.join("、"))}</span><small>${c.people.length}${copy("web.panels.d63842643d06")}</small></div>`
					: "",
			].join("");
			return (
				sheet(
					`<div class="preview-meta">${esc(dateLabel(c.start))}${eventRelative(c) ? ` · <span style="color:var(--accent);font-weight:500">${esc(eventRelative(c))}</span>` : ""}</div><div class="event-hero"><span class="num">${timeString(c.start)}</span><small class="num">${copy("web.templates.83532308ecca")}${timeString(c.end)} · ${span}${copy("web.templates.40de54344d22")}</small></div>${h1}${rows ? `<div class="detail-rows">${rows}</div>` : ""}${c.body?.length ? `<div class="preview-full">${c.body.map((p?: any) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}${this.reminderRow(c)}`,
					"",
					this.foot(
						timely && c.meeting
							? `<button type="button" class="solid-button" data-action="join" data-id="${esc(c.id)}">${copy("web.templates.451755e3831f")}</button>`
							: "",
					),
				) +
				this.bar(
					button("download", copy("web.panels.5510cee6e987"), "download-calendar", c.id),
					editTags,
					this.reminderTools(c),
				)
			);
		}
		if (c.type === "media" && c.media === "podcast") {
			const total = c.duration || 0,
				played = Math.round(total * (s.progress || 0));
			return (
				`<div class="sheet preview-sheet">${this.head(closeButton)}<div class="sheet-scroll" tabindex="0"><div class="player"><div class="player-art"></div>${h1}${this.meta(c)}<div class="player-bar"><span class="bar"><i id="podcast-bar" style="width:${Math.round((s.progress || 0) * 100)}%"></i></span><span class="player-times num"><span id="podcast-played">${duration(played)}</span><span>-${duration(total - played)}</span></span></div><div class="player-controls">${button("rewind", copy("web.panels.e18eb0c65e26"), "podcast-seek", c.id, "-15")}<button type="button" class="player-main" data-action="podcast-play" data-id="${esc(c.id)}" aria-label="${copy("web.panels.c3396195e91c")}">${icon("play", 22)}</button>${button("ffwd", copy("web.panels.ec8b7a23ea62"), "podcast-seek", c.id, "30")}</div>${this.foot(this.external(c, copy("web.panels.c7f9a9b3d472")))}</div></div></div>` +
				this.bar(this.bookmark(c, s), editTags, this.later(c, s))
			);
		}
		if (c.type === "media") {
			return (
				sheet(
					`${this.meta(c)}${h1}<div class="media-player"><img src="${Assets[c.image]}" alt=""><div class="media-slide" id="media-slide"></div></div><div class="media-controls">${button("back", copy("web.panels.b445bfa61071"), "media-prev", c.id)}${button("play", copy("web.panels.105587569775"), "media-play", c.id)}<span class="media-step" id="media-step">1 / ${c.body.length || 1}</span>${button("arrow", copy("web.panels.abd1f787accc"), "media-next", c.id)}</div>`,
					"",
					this.foot(this.external(c)),
				) + this.bar(this.bookmark(c, s), editTags, this.later(c, s))
			);
		}
		if (c.type === "file") {
			return (
				sheet(
					`<div class="preview-meta">${icon("folder", 15)}<span>${copy("web.panels.e93cb3b4dd1f")}${esc(cardSource(c) || "")}</span></div>${h1}<div class="detail-rows">${(c.files || []).map((f?: any) => `<div class="detail-row"><span class="row-icon">${icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? "image" : "file", 16)}</span><span><b>${esc(f.name)}</b><em>${esc(f.meta || "")}</em></span><small>${f.time ? esc(relativeTime(f.time)) : ""}</small></div>`).join("")}</div>`,
				) +
				this.bar(this.bookmark(c, s), editTags)
			);
		}
		if (c.type === "task" || c.type === "reminder") {
			const list =
				c.type === "task"
					? `<div class="detail-task-list">${Store.tasks(c)
							.map((t?: any) => checkItem(c, t))
							.join("")}</div>`
					: "";
			const label =
				c.type === "reminder"
					? [copy("web.reminder"), FeedPolicy.label(c, s, Date.now())].filter(Boolean).join(" · ")
					: c.meta || "";
			return (
				sheet(
					`<div class="preview-meta">${icon((CardTypes[c.type] || CardTypes.note).icon, 15)}<span>${esc(label)}</span></div>${h1}${c.summary ? `<p class="preview-lead">${esc(c.summary)}</p>` : ""}${list}${this.reminderRow(c)}`,
				) +
				this.bar(this.bookmark(c, s), editTags, this.reminderTools(c))
			);
		}
		if (c.type === "digest") {
			const st = CardPresentation.weekStats();
			return (
				sheet(
					`${this.meta(c)}${h1}<div class="stats-trio"><div><b class="num">${st.read}</b><span>${copy("web.read")}</span></div><div><b class="num">${st.saved}</b><span>${copy("web.bookmark")}</span></div><div><b class="num">${st.done}</b><span>${copy("web.done")}</span></div></div><p class="preview-lead">${esc(st.line)}</p>${(c.body || []).map((p?: any) => `<p class="muted">${esc(p)}</p>`).join("")}`,
					"",
					this.foot(this.whyLink(c)),
				) + this.bar(this.bookmark(c, s), editTags)
			);
		}
		// Articles, notes, suggestions: the lifted card shows everything.
		const lead =
			c.summary && c.form !== "quote" && c.summary !== c.body?.[0]
				? `<p class="preview-lead">${esc(c.summary)}</p>`
				: "";
		const points = c.points?.length
			? `<ol class="key-points">${c.points.map((p?: any, i?: any) => `<li><i class="num">${i + 1}</i><span>${esc(p)}</span></li>`).join("")}</ol>`
			: "";
		const related =
			c.type === "suggestion"
				? `<div class="refs">${(c.related || [])
						.map((id?: any) => Store.card(id))
						.filter(Boolean)
						.map(
							(r?: any) =>
								`<button type="button" class="ref" data-action="card-open" data-id="${esc(r.id)}">${icon(CardTypes[r.type].icon, 15)}<span>${esc(r.title)}</span>${icon("chevron", 14)}</button>`,
						)
						.join("")}</div>`
				: "";
		// The whole piece opens right here; full screen is only a wider page for the same text.
		const full = c.body?.length
			? `<div class="preview-full">${c.body.map((p?: any) => `<p>${esc(p)}</p>`).join("")}</div><div class="reader-end" id="reader-end" aria-hidden="true"></div>`
			: "";
		const cover = c.image
			? `<div class="preview-cover"><img data-shared="image" src="${Assets[c.image]}" alt="" draggable="false"></div>`
			: "";
		return (
			sheet(
				`${this.meta(c)}${h1}${lead}${points}${related}${full}`,
				cover,
				this.foot(this.external(c), this.whyLink(c)),
			) + this.bar(this.bookmark(c, s), editTags, this.later(c, s))
		);
	},
	/* Reader: a page with a thin progress line. Reaching the end closes the ring. */
	reader(app?: any, c?: any, loading: any = false) {
		const s = Store.item(c.id);
		const body = loading
			? `<div class="skeleton-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`
			: c.body.map((p?: any) => `<p>${esc(p)}</p>`).join("");
		return (
			`<div class="reader-progress" id="reader-progress" style="width:${Math.round(s.progress * 100)}%"></div><div class="reader-scroll" id="reader-scroll"><article class="reader-body">${this.meta(c)}<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>${c.image ? `<img class="reader-cover" src="${Assets[c.image]}" alt="" draggable="false">` : ""}<div class="reading-caption sr-only">${esc([cardSource(c), c.meta].filter(Boolean).join(" · "))}</div>${body}${loading ? "" : this.foot(this.external(c))}<div class="reader-end" id="reader-end" aria-hidden="true"></div></article></div>` +
			`<div class="reader-edge is-top" aria-hidden="true"></div><div class="reader-edge is-bottom" aria-hidden="true"></div>` +
			`<div class="reader-head glass" role="toolbar" aria-label="${copy("web.panels.0f1505b6ad3f")}">${button("collapse", copy("web.panels.0f1505b6ad3f"), "close")}${button("x", copy("web.panels.f2a5f3f7db0f"), "close-all")}</div>` +
			this.bar(
				this.bookmark(c, s),
				button("tag", copy("web.panels.786e2e9252a8"), "edit", c.id),
				this.later(c, s),
			)
		);
	},
	lightbox(c?: any, index: any = 0) {
		const photos = c.photos?.length ? c.photos : [c.image];
		const i = Math.max(0, Math.min(photos.length - 1, index));
		return `<div class="lightbox-top"><span>${esc([c.location, dateLabel(c.time)].filter(Boolean).join(" · "))}</span><span id="modal-title" class="sr-only">${esc(c.title)}</span>${button("x", copy("web.panels.28d70fb85c88"), "close")}</div>
   <div class="lightbox-stage">${photos.length > 1 ? button("back", copy("web.panels.bcf200709dbc"), "photo-step", c.id, "-1") : ""}<img src="${Assets[photos[i]]}" alt="${esc(c.title)}${copy("web.panels.fab2a038b6d0")}${i + 1}${copy("web.panels.e9e0fdc242b4")}">${photos.length > 1 ? button("arrow", copy("web.panels.dcd4eb027369"), "photo-step", c.id, "1") : ""}</div>
   <div class="lightbox-thumbs">${photos.map((p?: any, n?: any) => `<button type="button" class="${n === i ? "on" : ""}" data-action="photo-go" data-id="${esc(c.id)}" data-extra="${n}" aria-label="${copy("web.panels.9552fe3bd366")}${n + 1}${copy("web.panels.e9e0fdc242b4")}"><img src="${Assets[p]}" alt=""></button>`).join("")}</div>`;
	},
	/* Tags and notes: chips you can remove, a field to add, a note below. */
	editor(app?: any, id?: any) {
		const c = Store.card(id),
			s = Store.item(id),
			current = [...app.editTags];
		const suggest = [
			...new Set<any>([
				...(c.tags || []),
				copy("web.cards.bc62d1b6b936"),
				copy("web.cards.ce9b12499c47"),
				copy("web.cards.0e65f5e407c4"),
				copy("web.cards.56c255e19858"),
				"AI",
				copy("web.cards.15d208d1b4c9"),
			]),
		]
			.filter((t?: any) => !app.editTags.has(t))
			.slice(0, 6);
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.panels.2d41b6a035a0"))}<div class="panel-content"><div class="panel-sub" id="modal-title">${esc(c.title)}</div>
   <div class="tag-editor" id="editor-tags">${current.map((t?: any) => `<span class="tag-pill">${esc(t)}<button type="button" data-action="editor-tag" data-extra="${esc(t)}" aria-label="${copy("web.panels.0d1e7200becb")}${esc(t)}">${icon("x", 12)}</button></span>`).join("")}<input id="tag-new" aria-label="${copy("web.panels.7e2f159f6491")}" placeholder="${copy("web.panels.795cbff909c4")}" maxlength="30"></div>
   ${suggest.length ? `<div class="chip-suggest">${suggest.map((t?: any) => `<button type="button" class="chip soft" data-action="editor-tag" data-extra="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
   <label class="sr-only" for="note-editor">${copy("web.panels.daede9881787")}</label><textarea class="editor-note" id="note-editor" maxlength="4000" placeholder="${copy("web.panels.9cdbdc0a45a7")}">${esc(s.note)}</textarea>
   <div class="panel-footer"><span class="muted">${icon("lock", 13)}${copy("web.panels.b7325aa77693")}</span><button class="solid-button" data-action="save-note" data-id="${esc(id)}">${copy("web.save")}</button></div></div></div>`;
	},
	/* Why am I seeing this: reason, evidence, and two ways to adjust. */
	why(app?: any, c?: any) {
		const w = c.why || {
			reason: `${copy("web.panels.26ec49d512cf")}${cardSource(c) || copy("web.local")}」`,
			basis: [c.time ? `${relativeDay(c.time)}${copy("web.panels.3055a035f0eb")}` : ""],
		};
		const related = (c.related || []).map((id?: any) => Store.card(id)).filter(Boolean);
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.panels.9667e2fa911a"))}<div class="panel-content"><h1 id="modal-title">${copy("web.panels.fdc032965548")}</h1>
   <div class="row-list" style="margin-top:12px"><div class="why-line" style="min-height:36px">${icon("sparkles", 16)}<span>${esc(w.reason)}</span></div>${(
			w.basis || []
		)
			.filter(Boolean)
			.map(
				(b?: any) =>
					`<div class="why-line" style="min-height:36px">${icon("clock", 16)}<span>${esc(b)}</span></div>`,
			)
			.join("")}</div>
   ${related.length ? `<div class="chips" style="margin-top:12px">${related.map((r?: any) => `<button type="button" class="chip soft" data-action="card-open" data-id="${esc(r.id)}">${esc(r.title.slice(0, 10))}${r.title.length > 10 ? "…" : ""}</button>`).join("")}</div>` : ""}
   <div class="why-actions" style="margin-top:16px"><button type="button" class="text-link" data-action="less-like" data-id="${esc(c.id)}">${copy("web.panels.e31c8842b98a")}</button><button type="button" class="text-link" data-action="never-show" data-id="${esc(c.id)}">${copy("web.panels.a54a0add5447")}</button></div></div></div>`;
	},
	/* Search: field, chips, and grouped results. Archived matches come last. */
	search(app?: any) {
		const f = app.filter,
			tags = [...new Set<any>(Store.state.cards.flatMap((c?: any) => Store.tags(c)))].slice(0, 8);
		const types = [
			["all", copy("web.all"), ""],
			["article", copy("web.panels.71d9a93075be"), "book"],
			["mail", copy("web.panels.4da199fae933"), "mail"],
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
		return `<h1 id="modal-title" class="sr-only">${copy("web.panels.f6d4e9026e14")}</h1><div class="search-pill">${icon("search", 18)}<input type="search" id="filter-search" aria-label="${copy("web.panels.1589e32bc6d5")}" placeholder="${copy("web.panels.a76ee88e6c2e")}" value="${esc(f.query)}" data-input="search" autocomplete="off"><span class="search-count num" id="filter-result" role="status" aria-live="polite" aria-atomic="true">${app.filtered().length}${copy("web.panels.e9e0fdc242b4")}</span>${f.query ? button("x", copy("web.panels.b6f00afa6537"), "clear-query") : ""}</div>
   <div class="search-chips" role="group" aria-label="${copy("web.panels.b5f15473fdc0")}">${types.map(([k, v, ic]: any) => `<button type="button" class="chip ${f.type === k ? "active" : ""}" data-action="filter-type" data-extra="${k}" aria-pressed="${f.type === k}">${v}</button>`).join("")}${status.map(([k, v]: any) => `<button type="button" class="chip ${f.status === k ? "active" : ""}" data-action="filter-status" data-extra="${k}" aria-pressed="${f.status === k}">${v}</button>`).join("")}${tags.map((t?: any) => `<button type="button" class="chip ${f.tag === t ? "active" : ""}" data-action="filter-tag" data-extra="${esc(t)}" aria-pressed="${f.tag === t}">#${esc(t)}</button>`).join("")}</div>
   <div class="search-results" id="search-results">${this.searchResults(app)}</div>`;
	},
	searchResults(app?: any) {
		const q = app.filter.query.trim();
		if (!q) return "";
		const now = Date.now(),
			hits = app.searchAll(q);
		if (!hits.desk.length && !hits.shelved.length)
			return `<p class="search-empty">${copy("web.panels.11a8f9879575")}${esc(q)}」</p>`;
		const row = (c?: any) => {
			const s = Store.item(c.id),
				text =
					[c.summary, s.note, ...(c.body || [])].find(
						(t?: any) => t && t.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
					) ||
					c.summary ||
					"";
			const i = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()),
				snippet = i > 18 ? "…" + text.slice(i - 14) : text;
			return `<button type="button" class="list-row" data-action="card-open" data-id="${esc(c.id)}"><span class="row-icon">${icon((CardTypes[c.type] || CardTypes.note).icon, 16)}</span><span class="row-main"><b>${highlight(c.title, q)}</b><small>${highlight(snippet.slice(0, 60), q)}</small></span><span class="row-side">${esc(relativeDay(c.time || now, now))}</span></button>`;
		};
		return `${hits.desk.length ? `<div class="group-label">${copy("web.panels.51984343bcac")}<span class="num">${hits.desk.length}</span></div><div class="row-list">${hits.desk.slice(0, 8).map(row).join("")}</div>` : ""}${hits.shelved.length ? `<div class="group-label">${copy("web.panels.342927bba059")}<span class="num">${hits.shelved.length}</span></div><div class="row-list">${hits.shelved.slice(0, 8).map(row).join("")}</div>` : ""}`;
	},
	/* Archives: grouped by week, one row per card; “放回桌面” appears on hover. */
	archive(app?: any, which?: any) {
		const now = Date.now(),
			list = app.shelved(which).sort((a?: any, b?: any) => (b.time || 0) - (a.time || 0));
		const groups = new Map<any, any>();
		for (const c of list) {
			const at = which === "read" ? Store.item(c.id).readAt || c.time : c.time,
				age = now - at,
				label =
					age < 7 * 86400000
						? copy("web.panels.b4c6c3eb0bce")
						: age < 14 * 86400000
							? copy("web.primitives.0cf8b14f4651")
							: copy("web.panels.c56a5bb657de");
			(groups.get(label) || groups.set(label, []).get(label)).push(c);
		}
		const date = (ts?: any) => {
			const d = new Date(ts);
			return `${d.getMonth() + 1}${copy("web.primitives.1625179badc0")}${d.getDate()}${copy("web.primitives.85217f7aff77")}`;
		};
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.close"))}<div class="panel-content"><div class="panel-head"><h1 id="modal-title">${which === "read" ? copy("web.templates.7b7e6e8bd4ba") : copy("web.templates.709b79e460c8")}</h1>${which === "stale" && list.length ? `<button type="button" class="text-link" data-action="archive-all">${copy("web.panels.cb7aa46a18d2")}</button>` : `<span class="muted num">${list.length}</span>`}</div>
   <div class="sheet-scroll" style="max-height:60vh;margin:0 -28px;padding:0 28px">${list.length ? [...groups].map(([label, cards]: any) => `<div class="group-label">${label}</div><div class="row-list">${cards.map((c?: any) => `<div class="list-row hoverable"><span class="row-icon">${icon((CardTypes[c.type] || CardTypes.note).icon, 16)}</span><button type="button" class="row-main" data-action="card-open" data-id="${esc(c.id)}" style="text-align:left"><b>${esc(c.title)}</b><small>${esc(cardSource(c) || "")}</small></button><span class="row-side"><span class="row-date num">${date(which === "read" ? Store.item(c.id).readAt || c.time : c.time)}</span><button type="button" class="text-link row-put" data-action="restore-card" data-id="${esc(c.id)}">${copy("web.panels.561642967386")}</button></span></div>`).join("")}</div>`).join("") : `<p class="search-empty">${copy("web.panels.d2156defb0c9")}</p>`}</div></div></div>`;
	},
	/* Settings: five groups, one screen each. */
	settingsGroups: [
		["desk", copy("web.panels.f48d334495f6"), "monitor"],
		["look", copy("web.panels.86a63f23a076"), "eye"],
		["keys", copy("web.panels.ee2638183d3e"), "keyboard"],
		["data", copy("web.cloudentry.ebdc835e8f87"), "lock"],
	],
	settings(app?: any, group: any = "desk") {
		const p = (k?: any) => Store.pref(k),
			row = (label?: any, side?: any) =>
				`<div class="setting-row"><span>${label}</span><span class="setting-side">${side}</span></div>`;
		const pages: Record<string, any> = {
			desk: () => `<h1 id="modal-title">${copy("web.panels.f48d334495f6")}</h1><div class="settings-card">${row(copy("web.panels.5142e436b1f9"), `<span>${copy("web.panels.840f6c8f8823")}</span>${toggle("stack", p("stack"), copy("web.panels.5142e436b1f9"))}`)}${row(copy("web.panels.a11a80a0843c"), toggle("fadeRead", p("fadeRead"), copy("web.panels.a11a80a0843c")))}${row(
				copy("web.panels.1495127fad02"),
				segmented(
					"archiveAfter",
					[
						["3d", copy("web.panels.0c3f03b97727")],
						["7d", copy("web.panels.d94daba31605")],
						["never", copy("web.panels.3e8a08c97402")],
					],
					p("archiveAfter"),
					copy("web.panels.f28b5313cf29"),
				),
			)}${row(copy("web.panels.0f01370710b6"), toggle("floatTimely", p("floatTimely"), copy("web.panels.0f01370710b6")))}</div>
       <div class="settings-card">${row(copy("web.panels.ba8a435e2ff0"), toggle("collapseOnFinish", p("collapseOnFinish"), copy("web.panels.ba8a435e2ff0")))}${row(
					copy("web.panels.87852ffbea52"),
					segmented(
						"newHint",
						[
							["away", copy("web.panels.d4d78fb603fd")],
							["off", copy("web.panels.a0937d519f82")],
						],
						p("newHint"),
						copy("web.panels.87852ffbea52"),
					),
				)}</div>`,
			look: () =>
				`<h1 id="modal-title">${copy("web.panels.86a63f23a076")}</h1><div class="settings-card">${row(
					copy("web.panels.788db1cfec2a"),
					segmented(
						"theme",
						[
							["system", copy("web.panels.217cfe7db1e3")],
							["light", copy("web.panels.aa0819dfc4d8")],
							["dark", copy("web.panels.a6b75d068032")],
						],
						p("theme"),
						copy("web.panels.788db1cfec2a"),
					),
				)}${row(
					copy("web.panels.1cbb90eb7995"),
					segmented(
						"density",
						[
							["compact", copy("web.panels.5d63d587b0b0")],
							["standard", copy("web.panels.6bea77acefb3")],
							["roomy", copy("web.panels.051a34d53a73")],
						],
						p("density"),
						copy("web.panels.1cbb90eb7995"),
					),
				)}${row(copy("web.panels.7a56d47cadcb"), toggle("reduceMotion", p("reduceMotion"), copy("web.panels.7a56d47cadcb")))}${row(copy("web.panels.0ff470103d8e"), toggle("reduceTransparency", p("reduceTransparency"), copy("web.panels.0ff470103d8e")))}</div>`,
			keys: () =>
				`<h1 id="modal-title">${copy("web.panels.ee2638183d3e")}</h1><div class="settings-card">${row(copy("web.panels.cad165d34a9d"), toggle("singleKeyShortcuts", p("singleKeyShortcuts"), copy("web.panels.cad165d34a9d")))}${[
					[copy("web.search"), "⌘ K"],
					[copy("web.panels.5a15649c2481"), "N"],
					[copy("web.panels.9347631d48bf"), "Enter"],
					[copy("web.panels.ba167b0c3011"), "Esc"],
					[copy("web.panels.aee887434131"), "R"],
					[copy("web.panels.53d77f56548d"), "T"],
				]
					.map(([a, k]: any) =>
						row(
							a,
							k
								.split(" ")
								.map((x?: any) => `<kbd>${x}</kbd>`)
								.join(""),
						),
					)
					.join("")}</div>`,
			data: () => `<h1 id="modal-title">${copy("web.cloudentry.ebdc835e8f87")}</h1><div class="settings-card">${row(copy("web.panels.f3a8c4c52977"), `<span>${window.__QG_LOCAL__ ? copy("web.panels.e722a46eabe8") : copy("web.panels.9bf6eeb295f4")}</span>`)}${row(copy("web.panels.c0aa76aebce6"), `<span class="num">${formatBytes(Store.bytes())}</span>`)}${row(copy("web.panels.18fb131cc724"), toggle("aiLocal", p("aiLocal"), copy("web.panels.18fb131cc724")))}</div>
       <div class="settings-card">${row(`<button type="button" class="text-link" data-action="export-all">${copy("web.panels.af419089eb31")}</button>`, "")}${row(`<button type="button" class="text-link warn" data-action="clear-all">${copy("web.panels.21f7e90ee0f1")}</button>`, "")}</div>`,
		};
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.panels.77b17fc4a52a"))}<div class="settings-layout"><nav class="settings-nav" aria-label="${copy("web.panels.4a48d745e350")}">${this.settingsGroups.map(([k, v, ic]: any) => `<button type="button" class="${k === group ? "on" : ""}" data-action="settings-group" data-extra="${k}" aria-current="${k === group}">${v}</button>`).join("")}</nav><div class="settings-main">${pages[group]()}</div></div></div>`;
	},
	/* Sources: one dot says the state; only a broken source shows a button. */
	confirm(title?: any, detail?: any, actions?: any) {
		return `<div class="sheet"><div class="permission"><h1 id="modal-title">${esc(title)}</h1><p class="muted">${esc(detail)}</p><div class="permission-actions">${actions}</div></div></div>`;
	},
	/* Capture: one field. A link becomes an article, a line becomes a note. */
	capture(app?: any) {
		const next = Store.state.cards
			.filter(
				(c?: any) => c.type === "event" && c.end > Date.now() && c.start - Date.now() < 3 * 3600000,
			)
			.sort((a?: any, b?: any) => a.start - b.start)[0];
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.close"))}<div class="panel-content"><h1 id="modal-title" class="sr-only">${copy("web.panels.5a15649c2481")}</h1><div class="capture-field">${icon("plus", 18)}<textarea id="capture-text" aria-label="${copy("web.panels.fd06b053572e")}" placeholder="${copy("web.panels.fd06b053572e")}" maxlength="4000"></textarea></div>
   ${next ? `<div class="next-event"><span class="num">${timeString(next.start)}</span><span>${esc(next.title)}<small>${esc(eventRelative(next))}</small></span>${eventTimely(next) && next.meeting ? `<button type="button" class="solid-button" data-action="join" data-id="${esc(next.id)}">${copy("web.templates.451755e3831f")}</button>` : ""}</div>` : ""}
   <div class="panel-footer"><span class="muted"><kbd>N</kbd>${copy("web.panels.9be4933b25fb")}</span><button type="button" class="solid-button" data-action="capture-save">${copy("web.panels.a0fb6bc1d3c5")}</button></div></div></div>`;
	},
};
function welcomeHTML({ actions = null, detail = "" }: any = {}) {
	return `<section class="welcome" aria-labelledby="welcome-title">${sillIcon(72)}<h1 id="welcome-title">Sill</h1><p>${copy("web.panels.3d7d3ac3581f")}</p>${detail}<div class="welcome-actions">${actions === null ? `<button type="button" class="solid-button" data-action="capture">${copy("web.panels.5a15649c2481")}</button><button type="button" class="text-link" data-action="welcome-demo">${copy("web.panels.0245f51ac89a")}</button>` : actions}</div></section>`;
}
function relativeTime(ts?: any, now: any = Date.now()) {
	const min = Math.round((now - ts) / 60000);
	if (min < 1) return copy("web.cards.de6785d99e02");
	if (min < 60) return `${min}${copy("web.panels.f8083e01520b")}`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h}${copy("web.panels.9ebf77f67bc4")}`;
	return relativeDay(ts, now);
}
function formatBytes(n?: any) {
	return n < 1024
		? `${n} B`
		: n < 1048576
			? `${(n / 1024).toFixed(1)} KB`
			: n < 1073741824
				? `${(n / 1048576).toFixed(1)} MB`
				: `${(n / 1073741824).toFixed(1)} GB`;
}

export { formatBytes, Panels, relativeTime, welcomeHTML };
