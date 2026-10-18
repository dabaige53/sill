import { CardActions } from "../../../contracts/card-actions.ts";
import { icon, sillIcon } from "../atoms/icons.ts";
import {
	button,
	dateLabel,
	esc,
	eventRelative,
	eventTimely,
	relativeDay,
	segmented,
	timeString,
	toggle,
} from "../atoms/primitives.ts";
import { CardPresentation, cardHTML } from "../cards/templates.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardDates, cardSource, cardSourceKind, detailSource } from "../data/card-source.ts";
import { CardTypes, SourceKinds } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import { preview, relativeTime } from "./previews.ts";

/** Overlay entry points share card renderers in previews.ts; AppController owns state and focus. */
const Panels: Record<string, any> = {
	close(label?: any) {
		return `<div class="sheet-close">${button("x", label, "close")}</div>`;
	},
	meta(c?: any) {
		return `<div class="preview-meta">${CardPresentation.sourceIcon(c, 15)}<span>${esc(detailSource(c) || (CardTypes[c.type] || CardTypes.note).label)}</span></div>`;
	},
	tags(c?: any) {
		return Store.tags(c).length
			? `<div class="preview-tags">${Store.tags(c)
					.map((t?: any) => `<span class="chip soft">#${esc(t)}</span>`)
					.join("")}</div>`
			: "";
	},
	details(c?: any) {
		const dates = cardDates(c);
		// A row without a value says nothing; it is left out rather than shown as unknown.
		const row = (label: string, date: ReturnType<typeof cardDates>["created"]) =>
			date
				? `<div class="preview-detail-row"><dt>${esc(label)}</dt><dd><time datetime="${esc(date.datetime)}">${esc(date.text)}</time></dd></div>`
				: "";
		const rows = [
			row(copy("web.metadata.published"), dates.published),
			row(copy("web.metadata.saved"), dates.saved),
			row(copy("web.metadata.created"), dates.created),
			row(
				copy("web.metadata.updated"),
				dates.updated && dates.updated.datetime !== dates.created?.datetime ? dates.updated : null,
			),
			c.meta && !["task", "reminder", "event", "mail", "file"].includes(c.type)
				? `<div class="preview-detail-row preview-source-note"><dt>${copy("web.metadata.note")}</dt><dd>${esc(c.meta)}</dd></div>`
				: "",
		].join("");
		return rows
			? `<dl class="preview-details" aria-label="${copy("web.metadata.label")}">${rows}</dl>`
			: "";
	},
	bookmark(c?: any, s?: any) {
		return button(
			"bookmark",
			s.bookmarked ? copy("web.preview.removeBookmark") : copy("web.bookmark"),
			"bookmark",
			c.id,
			"",
			s.bookmarked ? "active" : "",
		);
	},
	later(c?: any, s?: any) {
		return button(
			"glasses",
			s.later ? copy("web.preview.removeLater") : copy("web.later"),
			"later",
			c.id,
			"",
			s.later ? "active" : "",
		);
	},
	bar(...parts: any[]) {
		return `<div class="float-bar glass" role="toolbar" aria-label="${copy("web.preview.cardTools")}">${parts.filter(Boolean).join("")}</div>`;
	},
	sep: '<span class="toolbar-sep" aria-hidden="true"></span>',
	/** Every card's toolbar: the shared verbs in ink, a rule, then at most three of this card's own verbs
	 * in accent. Icons only; the name lives in aria-label and shows on a long press. Settings can hide any. */
	tools(c?: any, s?: any, own: any[] = []) {
		const hidden = new Set(Store.pref("hiddenActions") || []);
		const shared = [
			["bookmark", this.bookmark(c, s)],
			["tag", button("tag", copy("web.editor.openTagsAndNote"), "edit", c.id)],
			["later", this.later(c, s)],
		]
			.filter(([key]) => !hidden.has(key))
			.map(([, html]) => html);
		const mine = own
			.filter(([key, html]) => html && !hidden.has(key))
			.slice(0, 3)
			.map(([, html]) => html.replace('class="icon-button ', 'class="icon-button is-own '));
		if (!shared.length && !mine.length) return "";
		return this.bar(...shared, shared.length && mine.length ? this.sep : "", ...mine);
	},
	/** This card's own verbs, keyed for the settings switches. Leaving Sill is an icon with the source in its name. */
	own(c?: any) {
		const s = Store.item(c.id);
		const open = c.url ? button("external", this.externalLabel(c), "external", c.id) : "";
		const reminder = FeedPolicy.supports(c)
			? // A finished reminder is restored by its own circle, so the toolbar does not repeat it.
				s.dismissed || s.snoozedUntil || (s.reminderDone && c.type !== "reminder")
				? ["snooze", button("bell", copy("web.templates.4b03be14c1f4"), "restore-reminder", c.id)]
				: ["snooze", button("snooze", copy("web.reminder.again"), "snooze", c.id)]
			: ["snooze", ""];
		const dismiss = ["dismiss", this.reminderTools(c)];
		if (c.type === "mail")
			return [["reply", c.url ? button("reply", copy("web.preview.reply"), "external", c.id) : ""]];
		if (c.type === "event")
			return [
				[
					"join",
					eventTimely(c) && c.meeting
						? button("video", copy("web.templates.451755e3831f"), "join", c.id)
						: "",
				],
				reminder,
				[
					"download",
					button("download", copy("web.preview.downloadCalendar"), "download-calendar", c.id),
				],
				dismiss,
			];
		if (c.type === "task" || c.type === "reminder") return [reminder, dismiss];
		if (c.type === "file") return [];
		return [["open", open]];
	},
	/** The sheet head holds the way out (and full screen) in its own row, never over the text. */
	head(...tools: any[]) {
		return `<button type="button" class="sheet-handle" aria-label="${copy("web.panels.resizeSheet")}" aria-expanded="false"><span class="grabber" aria-hidden="true"></span></button><div class="sheet-head"><div class="sheet-head-tools">${tools.filter(Boolean).join("")}</div></div>`;
	},
	/** Specific actions in words, after the content: they never compete with the toolbar icons. */
	foot(...actions: any[]) {
		const list = actions.filter(Boolean);
		return list.length ? `<div class="preview-foot">${list.join("")}</div>` : "";
	},
	whyLink(c?: any) {
		return c.why
			? `<button type="button" class="text-button" data-action="why" data-id="${esc(c.id)}">${copy("web.why.title")}</button>`
			: "";
	},
	/** The toolbar keeps the generic verb as an icon: stop reminding. */
	reminderTools(c?: any) {
		if (!FeedPolicy.supports(c)) return "";
		const s = Store.item(c.id);
		if (s.dismissed || s.reminderDone || s.snoozedUntil) return "";
		return button("bell-off", copy("web.preview.dismissReminder"), "dismiss-reminder", c.id);
	},
	externalLabel(c?: any) {
		if (c.type === "media" && c.media === "podcast") return copy("web.preview.podcast.openApp");
		const kind = SourceKinds[cardSourceKind(c)]?.label;
		return `${copy("web.preview.openSourcePrefix")}${kind && !["RSS", copy("web.local"), copy("web.cards.e727b8cc2df0")].includes(kind) ? kind : copy("web.preview.originalSource")}`;
	},
	readButton(c?: any, s?: any) {
		const p = Math.round((s.progress || 0) * 100);
		return `<button type="button" class="solid-button" data-action="reader" data-id="${esc(c.id)}">${s.read ? copy("web.reader.readAgain") : p > 0 ? copy("web.reader.continueReading") : copy("web.cards.ce9b12499c47")}${p > 0 && !s.read ? ` <small>${p}%</small>` : ""}</button>`;
	},
	/* Preview: content is read here; actions go back to where they belong. */
	preview(app?: any, c?: any) {
		return preview.call(this, app, c);
	},
	/* Reader: a page with a thin progress line. Reaching the end closes the ring. */
	reader(app?: any, c?: any, loading: any = false) {
		const s = Store.item(c.id);
		const body = loading
			? `<div class="skeleton-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`
			: c.body.map((p?: any) => `<p>${esc(p)}</p>`).join("");
		return (
			`<div class="reader-progress" id="reader-progress" style="width:${Math.round(s.progress * 100)}%"></div><div class="reader-scroll" id="reader-scroll"><article class="reader-body">${this.meta(c)}<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>${this.tags(c)}${this.details(c)}${c.image ? `<img class="reader-cover" src="${Assets[c.image]}" alt="" draggable="false">` : ""}<div class="reading-caption sr-only">${esc([cardSource(c), c.meta].filter(Boolean).join(" · "))}</div>${body}${loading ? "" : this.foot(app.agentAction?.(c))}<div class="reader-end" id="reader-end" aria-hidden="true"></div></article></div>` +
			`<div class="reader-edge is-top" aria-hidden="true"></div><div class="reader-edge is-bottom" aria-hidden="true"></div>` +
			`<div class="reader-head glass" role="toolbar" aria-label="${copy("web.readerTools")}">${button("collapse", copy("web.reader.exitFullscreen"), "close")}${button("x", copy("web.reader.close"), "close-all")}</div>` +
			this.tools(c, s, this.own(c))
		);
	},
	lightbox(c?: any, index: any = 0, app?: any) {
		const photos = c.photos?.length ? c.photos : [c.image];
		const i = Math.max(0, Math.min(photos.length - 1, index));
		return `<div class="lightbox-top"><span>${esc([c.location, dateLabel(c.time)].filter(Boolean).join(" · "))}</span><span id="modal-title" class="sr-only">${esc(c.title)}</span>${button("x", copy("web.photo.close"), "close")}</div>
   <div class="lightbox-stage">${photos.length > 1 ? button("back", copy("web.photo.previous"), "photo-step", c.id, "-1") : ""}<img src="${Assets[photos[i]]}" alt="${esc(c.title)}${copy("web.photo.altIndexPrefix")}${i + 1}${copy("web.common.cardCountSuffix")}">${photos.length > 1 ? button("arrow", copy("web.photo.next"), "photo-step", c.id, "1") : ""}</div>
   <div class="lightbox-thumbs">${photos.map((p?: any, n?: any) => `<button type="button" class="${n === i ? "on" : ""}" data-action="photo-go" data-id="${esc(c.id)}" data-extra="${n}" aria-label="${copy("web.photo.indexPrefix")}${n + 1}${copy("web.common.cardCountSuffix")}"><img src="${Assets[p]}" alt=""></button>`).join("")}</div>${this.foot(app?.agentAction?.(c))}`;
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
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.editor.closeTagsAndNote"))}<div class="panel-content"><div class="panel-sub" id="modal-title">${esc(c.title)}</div>
   <div class="tag-editor" id="editor-tags">${current.map((t?: any) => `<span class="tag-pill">${esc(t)}<button type="button" data-action="editor-tag" data-extra="${esc(t)}" aria-label="${copy("web.editor.removeTagPrefix")}${esc(t)}">${icon("x", 12)}</button></span>`).join("")}<input id="tag-new" aria-label="${copy("web.editor.newTagLabel")}" placeholder="${copy("web.editor.addTagPlaceholder")}" maxlength="30"></div>
   ${suggest.length ? `<div class="chip-suggest">${suggest.map((t?: any) => `<button type="button" class="chip soft" data-action="editor-tag" data-extra="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
   <label class="sr-only" for="note-editor">${copy("web.editor.noteLabel")}</label><textarea class="editor-note" id="note-editor" maxlength="4000" placeholder="${copy("web.editor.notePlaceholder")}">${esc(s.note)}</textarea>
   <div class="panel-footer"><span class="muted">${icon("lock", 13)}${copy("web.editor.deviceStorageHint")}</span><button class="solid-button" data-action="save-note" data-id="${esc(id)}">${copy("web.save")}</button></div></div></div>`;
	},
	/* Why am I seeing this: reason, evidence, and two ways to adjust. */
	why(app?: any, c?: any) {
		const w = c.why || {
			reason: `${copy("web.why.connectedSourcePrefix")}${cardSource(c) || copy("web.local")}」`,
			basis: [c.time ? `${relativeDay(c.time)}${copy("web.why.updatedSuffix")}` : ""],
		};
		const related = (c.related || []).map((id?: any) => Store.card(id)).filter(Boolean);
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.why.close"))}<div class="panel-content"><h1 id="modal-title">${copy("web.why.title")}</h1>
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
   <div class="why-actions" style="margin-top:16px"><button type="button" class="text-link" data-action="less-like" data-id="${esc(c.id)}">${copy("web.why.showLess")}</button><button type="button" class="text-link" data-action="never-show" data-id="${esc(c.id)}">${copy("web.why.stopPrompting")}</button></div></div></div>`;
	},
	/* Search: field, chips, and grouped results. Archived matches come last. */
	search(app?: any) {
		const f = app.searchFilter,
			tags = [...new Set<any>(Store.state.cards.flatMap((c?: any) => Store.tags(c)))].slice(0, 8);
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
		return `<h1 id="modal-title" class="sr-only">${copy("web.search.title")}</h1><div class="search-header"><div class="search-pill">${icon("search", 18)}<input type="search" id="filter-search" aria-label="${copy("web.search.inputLabel")}" placeholder="${copy("web.search.inputPlaceholder")}" value="${esc(f.query)}" data-input="search" autocomplete="off"><span class="search-count num sr-only" id="filter-result" role="status" aria-live="polite" aria-atomic="true">${Object.values(app.searchAll(f.query)).flat().length}${copy("web.common.cardCountSuffix")}</span>${f.query ? button("x", copy("web.search.clear"), "clear-query") : ""}</div>${button("x", copy("web.close"), "close")}</div>
   <div class="search-chips" role="group" aria-label="${copy("web.search.filtersLabel")}">${types.map(([k, v, ic]: any) => `<button type="button" class="chip ${f.type === k ? "active" : ""}" data-action="filter-type" data-extra="${k}" aria-pressed="${f.type === k}">${v}</button>`).join("")}${status.map(([k, v]: any) => `<button type="button" class="chip ${f.status === k ? "active" : ""}" data-action="filter-status" data-extra="${k}" aria-pressed="${f.status === k}">${v}</button>`).join("")}${tags.map((t?: any) => `<button type="button" class="chip ${f.tag === t ? "active" : ""}" data-action="filter-tag" data-extra="${esc(t)}" aria-pressed="${f.tag === t}">#${esc(t)}</button>`).join("")}</div>
   <div class="search-results" id="search-results">${this.searchResults(app)}</div>`;
	},
	searchResults(app?: any) {
		const q = app.searchFilter.query.trim(),
			hits = app.searchAll(q);
		if (!hits.desk.length && !hits.shelved.length)
			return `<p class="search-empty">${copy("web.search.noResultsPrefix")}${esc(q)}」</p>`;
		const desk = hits.desk.slice(0, app.searchLimit || 40),
			shelved = hits.shelved.slice(0, Math.max(0, (app.searchLimit || 40) - desk.length));
		const cards = (list: any[]) =>
			`<div class="search-card-grid">${list.map((c) => cardHTML(c, { now: app.feedNow })).join("")}</div>`;
		return `${desk.length ? cards(desk) : ""}${shelved.length ? `<div class="group-label">${copy("web.search.shelvedGroup")}</div>${cards(shelved)}` : ""}`;
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
						? copy("web.archive.thisWeek")
						: age < 14 * 86400000
							? copy("web.primitives.0cf8b14f4651")
							: copy("web.archive.earlier");
			(groups.get(label) || groups.set(label, []).get(label)).push(c);
		}
		const date = (ts?: any) => {
			const d = new Date(ts);
			return `${d.getMonth() + 1}${copy("web.primitives.1625179badc0")}${d.getDate()}${copy("web.primitives.85217f7aff77")}`;
		};
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.close"))}<div class="panel-content"><div class="panel-head"><h1 id="modal-title">${which === "read" ? copy("web.templates.7b7e6e8bd4ba") : copy("web.templates.709b79e460c8")}</h1>${which === "stale" && list.length ? `<button type="button" class="text-link" data-action="archive-all">${copy("web.archive.archiveAll")}</button>` : `<span class="muted num">${list.length}</span>`}</div>
   <div class="sheet-scroll" style="max-height:60vh;margin:0 -28px;padding:0 28px">${list.length ? [...groups].map(([label, cards]: any) => `<div class="group-label">${label}</div><div class="row-list">${cards.map((c?: any) => `<div class="list-row hoverable"><span class="row-icon">${icon((CardTypes[c.type] || CardTypes.note).icon, 16)}</span><button type="button" class="row-main" data-action="card-open" data-id="${esc(c.id)}" style="text-align:left"><b>${esc(c.title)}</b><small>${esc(cardSource(c) || "")}</small></button><span class="row-side"><span class="row-date num">${date(which === "read" ? Store.item(c.id).readAt || c.time : c.time)}</span><button type="button" class="text-link row-put" data-action="restore-card" data-id="${esc(c.id)}">${copy("web.archive.restoreToDesk")}</button></span></div>`).join("")}</div>`).join("") : `<p class="search-empty">${copy("web.archive.empty")}</p>`}</div></div></div>`;
	},
	/* Settings: five groups, one screen each. */
	settingsGroups: [
		["add", copy("web.settings.add"), "plus"],
		["desk", copy("web.common.desk"), "monitor"],
		["look", copy("web.settings.appearance"), "eye"],
		["keys", copy("web.settings.shortcuts"), "keyboard"],
		["data", copy("web.cloudentry.ebdc835e8f87"), "lock"],
	],
	settings(app?: any, group: any = "desk") {
		const p = (k?: any) => Store.pref(k),
			row = (label?: any, side?: any) =>
				`<div class="setting-row"><span>${label}</span><span class="setting-side">${side}</span></div>`;
		const pages: Record<string, any> = {
			// Adding lives here now: the same one field as the capture sheet. N still opens the sheet directly.
			add: () =>
				`<h1 id="modal-title">${copy("web.settings.add")}</h1><div class="settings-card settings-add"><div class="capture-field">${icon("plus", 18)}<textarea id="capture-text" aria-label="${copy("web.capture.placeholder")}" placeholder="${copy("web.capture.placeholder")}" maxlength="4000"></textarea></div><div class="panel-footer"><span class="muted"><kbd>N</kbd>${copy("web.capture.shortcutHint")}</span><button type="button" class="solid-button" data-action="capture-save">${copy("web.capture.save")}</button></div></div>`,
			desk: () => `<h1 id="modal-title">${copy("web.common.desk")}</h1><div class="settings-card">${row(copy("web.settings.stackSameSource"), `<span>${copy("web.settings.stackThreshold")}</span>${toggle("stack", p("stack"), copy("web.settings.stackSameSource"))}`)}${row(copy("web.settings.fadeRead"), toggle("fadeRead", p("fadeRead"), copy("web.settings.fadeRead")))}${row(copy("web.settings.floatTimely"), toggle("floatTimely", p("floatTimely"), copy("web.settings.floatTimely")))}</div>
       <div class="group-label">${copy("web.actions.title")}</div><div class="settings-card">${CardActions.map(
					(key) =>
						row(
							copy(`web.actions.${key}`),
							toggle(
								key,
								!(p("hiddenActions") || []).includes(key),
								copy(`web.actions.${key}`),
								"action-toggle",
							),
						),
				).join("")}</div><p class="settings-hint muted">${copy("web.actions.hint")}</p>
       <div class="settings-card">${row(copy("web.settings.collapseOnFinish"), toggle("collapseOnFinish", p("collapseOnFinish"), copy("web.settings.collapseOnFinish")))}${row(
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
				)}</div>`,
			look: () =>
				`<h1 id="modal-title">${copy("web.settings.appearance")}</h1><div class="settings-card">${row(
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
				)}${row(
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
				)}${row(copy("web.settings.reduceMotion"), toggle("reduceMotion", p("reduceMotion"), copy("web.settings.reduceMotion")))}${row(copy("web.settings.reduceTransparency"), toggle("reduceTransparency", p("reduceTransparency"), copy("web.settings.reduceTransparency")))}</div>`,
			keys: () =>
				`<h1 id="modal-title">${copy("web.settings.shortcuts")}</h1><div class="settings-card">${row(copy("web.settings.singleKeyShortcuts"), toggle("singleKeyShortcuts", p("singleKeyShortcuts"), copy("web.settings.singleKeyShortcuts")))}${[
					[copy("web.search"), "⌘ K"],
					[copy("web.capture.title"), "N"],
					[copy("web.settings.shortcuts.openCard"), "Enter"],
					[copy("web.settings.shortcuts.closeOverlay"), "Esc"],
					[copy("web.settings.shortcuts.refresh"), "R"],
					[copy("web.settings.shortcuts.backToTop"), "T"],
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
			data: () => `<h1 id="modal-title">${copy("web.cloudentry.ebdc835e8f87")}</h1><div class="settings-card">${row(copy("web.settings.storage.location"), `<span>${window.__QG_LOCAL__ ? copy("web.settings.storage.localDirectory") : copy("web.settings.storage.browser")}</span>`)}${row(copy("web.settings.storage.usage"), `<span class="num">${formatBytes(Store.bytes())}</span>`)}${row(copy("web.settings.aiLocal"), toggle("aiLocal", p("aiLocal"), copy("web.settings.aiLocal")))}</div>
       <div class="settings-card">${row(`<button type="button" class="text-link" data-action="export-all">${copy("web.settings.exportAllCards")}</button>`, "")}${row(`<button type="button" class="text-link warn" data-action="clear-all">${copy("web.settings.clearAllData")}</button>`, "")}</div>`,
		};
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.settings.close"))}<div class="settings-layout"><nav class="settings-nav" aria-label="${copy("web.settings.groupsLabel")}">${this.settingsGroups.map(([k, v, ic]: any) => `<button type="button" class="${k === group ? "on" : ""}" data-action="settings-group" data-extra="${k}" aria-current="${k === group}">${v}</button>`).join("")}</nav><div class="settings-main">${pages[group]()}</div></div></div>`;
	},
	/* Sources: one dot says the state; only a broken source shows a button. */
	confirm(title?: any, detail?: any, actions?: any) {
		return `<div class="sheet"><div class="permission"><h1 id="modal-title">${esc(title)}</h1><p class="muted">${esc(detail)}</p><div class="permission-actions">${actions}</div></div></div>`;
	},
	/* AI: a place kept for the assistant. It says plainly that nothing works here yet. */
	ai(app?: any) {
		const cards = [...new Set<string>(app?.aiSelectionIds || [])]
			.map((id) => Store.card(id))
			.filter(Boolean);
		const context = cards
			.map((card) => {
				const excerpt = (card.summary || (card.body || []).join(" ") || "").slice(0, 180);
				return `<article class="ai-context-card" data-ai-context="${esc(card.id)}"><h3>${esc(card.title)}</h3>${excerpt ? `<p>${esc(excerpt)}</p>` : ""}</article>`;
			})
			.join("");
		return `<div class="sheet ai-conversation"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.close"))}<header class="ai-conversation-head">${icon("chat", 24)}<h1 id="modal-title">${copy("web.ai.title")}</h1><span class="soon-badge">${copy("web.ai.soon")}</span></header><p id="ai-availability" class="muted">${copy("web.ai.localOnly")}</p><section class="ai-context" aria-label="${copy("web.ai.context")}">${context || `<p class="muted ai-context-empty">${copy("web.ai.emptyContext")}</p>`}</section><div class="ai-composer"><textarea id="ai-local-draft" aria-label="${copy("web.ai.composer")}" aria-describedby="ai-availability" placeholder="${copy("web.ai.placeholder")}" maxlength="4000" rows="3"></textarea><button type="button" class="icon-button" disabled aria-label="${copy("web.ai.sendUnavailable")}">${icon("send", 20)}</button></div></div>`;
	},
	/* Capture: one field. A link becomes an article, a line becomes a note. */
	capture(app?: any) {
		const next = Store.state.cards
			.filter(
				(c?: any) => c.type === "event" && c.end > Date.now() && c.start - Date.now() < 3 * 3600000,
			)
			.sort((a?: any, b?: any) => a.start - b.start)[0];
		return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close(copy("web.close"))}<div class="panel-content"><h1 id="modal-title" class="sr-only">${copy("web.capture.title")}</h1><div class="capture-field">${icon("plus", 18)}<textarea id="capture-text" aria-label="${copy("web.capture.placeholder")}" placeholder="${copy("web.capture.placeholder")}" maxlength="4000"></textarea></div>
   ${next ? `<div class="next-event"><span class="num">${timeString(next.start)}</span><span>${esc(next.title)}<small>${esc(eventRelative(next))}</small></span>${eventTimely(next) && next.meeting ? `<button type="button" class="solid-button" data-action="join" data-id="${esc(next.id)}">${copy("web.templates.451755e3831f")}</button>` : ""}</div>` : ""}
   <div class="panel-footer"><span class="muted"><kbd>N</kbd>${copy("web.capture.shortcutHint")}</span><button type="button" class="solid-button" data-action="capture-save">${copy("web.capture.save")}</button></div></div></div>`;
	},
};

function welcomeHTML({ actions = null, detail = "" }: any = {}) {
	return `<section class="welcome" aria-labelledby="welcome-title">${sillIcon(72)}<h1 id="welcome-title">Sill</h1><p>${copy("web.welcome.tagline")}</p>${detail}<div class="welcome-actions">${actions === null ? `<button type="button" class="solid-button" data-action="capture">${copy("web.capture.title")}</button><button type="button" class="text-link" data-action="welcome-demo">${copy("web.welcome.viewDemo")}</button>` : actions}</div></section>`;
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
