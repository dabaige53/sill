import { copy } from "../copy.ts";
import { icon } from "./icons.ts";

function esc(value: any = "") {
	return String(value).replace(
		/[&<>"']/g,
		(c?: any) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
	);
}
function button(
	glyph?: any,
	label?: any,
	action?: any,
	id: any = "",
	extra: any = "",
	className: any = "",
) {
	return `<button type="button" class="icon-button ${className}" aria-label="${esc(label)}" data-action="${esc(action)}"${id ? ` data-id="${esc(id)}"` : ""}${extra ? ` data-extra="${esc(extra)}"` : ""}>${icon(glyph)}</button>`;
}
/** A pill with words: timely actions on cards and the primary action in a toolbar. */
function pill(
	text?: any,
	action?: any,
	id: any = "",
	className: any = "",
	extra: any = "",
	label: any = "",
) {
	return `<button type="button" class="pill ${className}" data-action="${esc(action)}"${id ? ` data-id="${esc(id)}"` : ""}${extra ? ` data-extra="${esc(extra)}"` : ""}${label ? ` aria-label="${esc(label)}"` : ""}>${text}</button>`;
}
function ring(progress: any = 0, size: any = 22) {
	const p = Math.max(0, Math.min(1, Number(progress) || 0)),
		c = 50.265;
	return `<span class="progress-ring" role="progressbar" aria-label="${copy("web.primitives.8bf1d0b76278")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="2.4"/><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 10 10)"/></svg></span>`;
}
function checkMark(done?: any) {
	return `<span class="check-dot">${done ? icon("check", 12) : ""}</span>`;
}
function checkItem(c?: any, t?: any) {
	return `<button class="check-item ${t.done ? "is-done" : ""}" data-action="task" data-id="${esc(c.id)}" data-extra="${esc(t.id)}" type="button" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.text)}">${checkMark(t.done)}<span>${esc(t.text)}</span></button>`;
}
const AvatarTones = ["#5e7a99", "#7d6b8f", "#6b8a7a", "#9a7b5f", "#5f8a99", "#8a6b6b"];
function avatarTone(name: any = "") {
	let n = 0;
	for (const ch of String(name)) n += ch.codePointAt(0);
	return AvatarTones[n % AvatarTones.length];
}
function avatar(name: any = "", size: any = 28) {
	return `<span class="avatar" style="width:${size}px;height:${size}px;background:${avatarTone(name)}" aria-hidden="true">${esc(String(name).slice(0, 1))}</span>`;
}
function avatars(names: any = []) {
	return `<span class="avatars" role="img" aria-label="${names.length}${copy("web.primitives.0b27068f8071")}">${names.map((n?: any) => avatar(n, 24)).join("")}</span>`;
}
function timeString(ts?: any) {
	return new Date(ts).toLocaleTimeString("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}
function dateLabel(ts?: any) {
	const d = new Date(ts);
	return `${d.getMonth() + 1}${copy("web.primitives.1625179badc0")}${d.getDate()}${copy("web.primitives.453e841e7da3")}${d.toLocaleDateString("zh-CN", { weekday: "short" })}`;
}
/** A reminder's own time: the clock today, the date before it on any other day. */
function reminderClock(at?: any, now: any = Date.now()) {
	return new Date(at).toDateString() === new Date(now).toDateString()
		? timeString(at)
		: `${dateLabel(at)} ${timeString(at)}`;
}
function relativeDay(ts?: any, now: any = Date.now()) {
	const day = 86400000,
		start = new Date(now);
	start.setHours(0, 0, 0, 0);
	if (ts >= start.getTime()) return copy("web.primitives.d5f5a7a01073");
	if (ts >= start.getTime() - day) return copy("web.primitives.0c184871f658");
	const days = Math.floor((start.getTime() - ts) / day) + 1;
	if (days < 7) return `${days}${copy("web.primitives.5972982ce6bc")}`;
	if (days < 14) return copy("web.primitives.0cf8b14f4651");
	const d = new Date(ts);
	return `${d.getMonth() + 1}${copy("web.primitives.1625179badc0")}${d.getDate()}${copy("web.primitives.85217f7aff77")}`;
}
function eventRelative(c?: any, now: any = Date.now()) {
	const min = Math.ceil((c.start - now) / 60000);
	if (min > 90) return `${Math.round(min / 60)}${copy("web.primitives.ec13a671ba0c")}`;
	if (min > 0) return `${min}${copy("web.primitives.a63a9dc60e00")}`;
	// An ended event says nothing; the card fades instead.
	return eventEnded(c, now) ? "" : copy("web.primitives.055da4d50c7e");
}
function eventEnded(c?: any, now: any = Date.now()) {
	return now >= c.end;
}
function eventTimely(c?: any, now: any = Date.now()) {
	return c.start - now <= 15 * 60000 && now < c.end;
}
function duration(seconds: any = 0) {
	const s = Math.max(0, Math.round(seconds)),
		h = Math.floor(s / 3600),
		m = Math.floor((s % 3600) / 60),
		r = String(s % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
function minutes(seconds?: any) {
	return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function tagChip(label?: any, active: any = false, action: any = "filter-tag") {
	return `<button type="button" class="chip ${active ? "active" : ""}" data-action="${action}" data-extra="${esc(label)}" aria-pressed="${active}">${esc(label)}</button>`;
}
function segmented(name?: any, options?: any, value?: any, label?: any) {
	return `<span class="segmented" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, t]: any) => `<button type="button" role="radio" tabindex="${v === value ? 0 : -1}" aria-checked="${v === value}" class="${v === value ? "on" : ""}" data-action="pref" data-id="${esc(name)}" data-extra="${esc(v)}">${esc(t)}</button>`).join("")}</span>`;
}
function toggle(
	name?: any,
	on?: any,
	label?: any,
	action: any = "pref-toggle",
	descriptionId = "",
) {
	return `<button class="toggle" type="button" role="switch" aria-label="${esc(label)}"${descriptionId ? ` aria-describedby="${esc(descriptionId)}"` : ""} aria-checked="${!!on}" data-action="${action}" data-id="${esc(name)}"></button>`;
}
function highlight(text?: any, query?: any) {
	const t = String(text || "");
	if (!query) return esc(t);
	const i = t.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
	if (i < 0) return esc(t);
	return (
		esc(t.slice(0, i)) +
		`<mark>${esc(t.slice(i, i + query.length))}</mark>` +
		esc(t.slice(i + query.length))
	);
}
function emptyState(title?: any, description: any = "", actions: any = "") {
	return `<section class="empty-card feed-item"><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ""}${actions}</section>`;
}

export {
	AvatarTones,
	avatar,
	avatars,
	avatarTone,
	button,
	checkItem,
	checkMark,
	dateLabel,
	duration,
	emptyState,
	esc,
	eventEnded,
	eventRelative,
	eventTimely,
	highlight,
	minutes,
	pill,
	relativeDay,
	reminderClock,
	ring,
	segmented,
	tagChip,
	timeString,
	toggle,
};
