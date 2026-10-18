import { icon } from "../atoms/icons.ts";
import {
	avatar,
	button,
	checkItem,
	dateLabel,
	duration,
	esc,
	eventRelative,
	relativeDay,
	reminderClock,
	timeString,
} from "../atoms/primitives.ts";
import { reminderMark } from "../cards/templates.ts";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardSource } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { Panels } from "./panels.ts";

export function preview(this: typeof Panels, app?: any, c?: any) {
	const s = Store.item(c.id),
		note = s.note ? `<div class="preview-note">${esc(s.note)}</div>` : "";
	const tags = this.tags(c);
	const closeButton = button("x", copy("web.panels.1eb05d311508"), "close");
	const expand =
		c.body?.length &&
		!standaloneDisplay() &&
		!["event", "mail", "media", "task", "reminder", "digest", "file"].includes(c.type)
			? button("expand", copy("web.panels.22ea3f47fee8"), "reader", c.id)
			: "";
	const sheet = (inner?: any, cover: any = "", action: any = "") =>
		`<div class="sheet preview-sheet">${this.head(expand, closeButton)}<div class="sheet-scroll" tabindex="0" role="region" aria-label="${copy("web.panels.a67b98c6cf92")}">${cover}<div class="preview-body">${inner}${note}${this.foot(action, app?.agentAction?.(c))}</div></div></div>`;
	const tools = this.tools(c, s, this.own(c));
	const h1 = `<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>${tags}${this.details(c)}`;
	if (c.type === "mail") {
		const sender = c.sender || cardSource(c);
		return (
			sheet(
				`<div class="preview-sender">${avatar(sender, 36)}<span><b>${esc(sender)}</b><small>${copy("web.panels.711078d887e0")}${esc(c.meta || "")}</small></span></div>${h1}<div class="preview-full">${(c.body || [c.summary]).map((p?: any) => `<p>${esc(p)}</p>`).join("")}</div>${c.attachment ? `<span class="ref attachment">${icon("file", 15)}<span>${esc(c.attachment)}</span></span>` : ""}`,
			) + tools
		);
	}
	if (c.type === "event") {
		const span = Math.round((c.end - c.start) / 60000);
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
				`<div class="preview-meta">${esc(dateLabel(c.start))}${eventRelative(c) ? ` · <span style="color:var(--accent);font-weight:500">${esc(eventRelative(c))}</span>` : ""}</div><div class="event-hero"><span class="num">${timeString(c.start)}</span><small class="num">${copy("web.templates.83532308ecca")}${timeString(c.end)} · ${span}${copy("web.templates.40de54344d22")}</small></div>${h1}${rows ? `<div class="detail-rows">${rows}</div>` : ""}${c.body?.length ? `<div class="preview-full">${c.body.map((p?: any) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}`,
			) + tools
		);
	}
	if (c.type === "media" && c.media === "podcast") {
		const total = c.duration || 0,
			played = Math.round(total * (s.progress || 0));
		return (
			`<div class="sheet preview-sheet">${this.head(closeButton)}<div class="sheet-scroll" tabindex="0"><div class="player"><div class="player-art"></div>${h1}${this.meta(c)}<div class="player-bar"><span class="bar"><i id="podcast-bar" style="width:${Math.round((s.progress || 0) * 100)}%"></i></span><span class="player-times num"><span id="podcast-played">${duration(played)}</span><span>-${duration(total - played)}</span></span></div><div class="player-controls">${button("rewind", copy("web.panels.e18eb0c65e26"), "podcast-seek", c.id, "-15")}<button type="button" class="player-main" data-action="podcast-play" data-id="${esc(c.id)}" aria-label="${copy("web.panels.c3396195e91c")}">${icon("play", 22)}</button>${button("ffwd", copy("web.panels.ec8b7a23ea62"), "podcast-seek", c.id, "30")}</div>${this.foot(app.agentAction?.(c))}</div></div></div>` +
			tools
		);
	}
	if (c.type === "media") {
		return (
			sheet(
				`${this.meta(c)}${h1}<div class="media-player"><img src="${Assets[c.image]}" alt=""><div class="media-slide" id="media-slide"></div></div><div class="media-controls">${button("back", copy("web.panels.b445bfa61071"), "media-prev", c.id)}${button("play", copy("web.panels.105587569775"), "media-play", c.id)}<span class="media-step" id="media-step">1 / ${c.body.length || 1}</span>${button("arrow", copy("web.panels.abd1f787accc"), "media-next", c.id)}</div>`,
			) + tools
		);
	}
	if (c.type === "file") {
		return (
			sheet(
				`<div class="preview-meta">${icon("folder", 15)}<span>${copy("web.panels.e93cb3b4dd1f")}${esc(cardSource(c) || "")}</span></div>${h1}<div class="detail-rows">${(c.files || []).map((f?: any) => `<div class="detail-row"><span class="row-icon">${icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? "image" : "file", 16)}</span><span><b>${esc(f.name)}</b><em>${esc(f.meta || "")}</em></span><small>${f.time ? esc(relativeTime(f.time)) : ""}</small></div>`).join("")}</div>`,
			) + tools
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
				? [
						...new Set([
							copy("web.reminder"),
							cardSource(c),
							FeedPolicy.reminderTime(c, s) ? reminderClock(FeedPolicy.reminderTime(c, s).at) : "",
						]),
					]
						.filter(Boolean)
						.join(" · ")
				: c.meta || "";
		return (
			sheet(
				`<div class="preview-meta">${icon((CardTypes[c.type] || CardTypes.note).icon, 15)}<span>${esc(label)}</span></div>${c.type === "reminder" ? `<div class="reminder-row preview-title-row">${reminderMark(c, !!s.reminderDone)}<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1></div>${tags}${this.details(c)}` : h1}${c.summary ? `<p class="preview-lead">${esc(c.summary)}</p>` : ""}${list}`,
			) + tools
		);
	}
	// Articles, notes, digests and suggestions show the content the agent actually wrote.
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
		sheet(`${this.meta(c)}${h1}${lead}${points}${related}${full}`, cover, this.whyLink(c)) + tools
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
	if (min < 60) return `${min}${copy("web.panels.f8083e01520b")}`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h}${copy("web.panels.9ebf77f67bc4")}`;
	return relativeDay(ts, now);
}
