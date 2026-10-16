import { copy } from "../copy.ts";
import { cardSource, cardSourceKind } from "../data/card-source.ts";

/** Pure feed policy. Clock and item state are supplied by the caller. */
const FeedPolicy: Record<string, any> = {
	sorts: ["priority", "unread", "time"],
	// Time sinks cards. A read card leaves the desk after the archive delay; an untouched one after two weeks.
	// Nothing is deleted: both shelves stay searchable and any card can be put back.
	archiveDelay(pref?: any) {
		return pref === "3d" ? 3 * 86400000 : pref === "never" ? Infinity : 7 * 86400000;
	},
	shelf(c?: any, s?: any, now?: any, pref: any = "7d") {
		if (s.archived) return "read";
		if (["task", "event", "reminder"].includes(c.type)) return "desk";
		if (s.restoredAt && now - s.restoredAt < 7 * 86400000) return "desk";
		if (s.bookmarked || s.later) return "desk";
		if (s.read)
			return now - (s.readAt || c.time || now) >= this.archiveDelay(pref) ? "read" : "desk";
		return !s.seen && now - (c.time || now) >= 14 * 86400000 ? "stale" : "desk";
	},
	// More than five cards from one source within an hour fold into one stack.
	stackThreshold: 5,
	stacks(cards?: any, items?: any) {
		const groups = new Map<any, any>();
		for (const c of cards) {
			if (
				!["article", "media"].includes(c.type) ||
				!cardSource(c) ||
				["agent", "capture"].includes(cardSourceKind(c))
			)
				continue;
			const key = cardSourceKind(c) + ":" + cardSource(c);
			(groups.get(key) || groups.set(key, []).get(key)).push(c);
		}
		const result = new Map<any, any>();
		for (const [key, list] of groups) {
			const sorted = list.slice().sort((a?: any, b?: any) => (b.time || 0) - (a.time || 0));
			const recent = sorted.filter(
				(c?: any) => (sorted[0].time || 0) - (c.time || 0) <= 3600000 && !items[c.id]?.read,
			);
			if (recent.length > this.stackThreshold) result.set(key, recent);
		}
		return result;
	},

	cooldown: 60000,
	supports(c?: any) {
		return ["reminder", "event", "task"].includes(c.type);
	},
	trigger(c?: any, s: any = {}) {
		if (s.snoozedUntil > 0) return s.snoozedUntil;
		if (c.type === "event") return Number(c.start) - 15 * 60000;
		if (c.type === "task") return Number(c.due) - 30 * 60000;
		return c.type === "reminder" ? Number(c.due) : NaN;
	},
	key(c?: any, s: any = {}) {
		return `${c.id}:${this.trigger(c, s)}`;
	},
	completed(c?: any, s: any = {}) {
		if (s.reminderDone) return true;
		return (
			c.type === "task" &&
			c.tasks?.length > 0 &&
			c.tasks.every((t?: any) => (s.taskDone ? s.taskDone.includes(t.id) : t.done))
		);
	},
	eligible(c?: any, s?: any, now?: any) {
		const at = this.trigger(c, s);
		return (
			this.supports(c) &&
			Number.isFinite(at) &&
			at > 0 &&
			at <= now &&
			!s.dismissed &&
			!this.completed(c, s) &&
			!(c.type === "event" && c.end <= now) &&
			s.lastReminderKey !== this.key(c, s) &&
			(!s.lastNotifiedAt || now - s.lastNotifiedAt >= this.cooldown)
		);
	},
	visible(c?: any, s?: any, status: any = "all") {
		if (status === "snoozed") return s.snoozedUntil > 0 && !s.dismissed && !s.reminderDone;
		if (status === "dismissed") return !!s.dismissed;
		if (status === "done") return !!s.reminderDone;
		return !s.snoozedUntil && !s.dismissed && !s.reminderDone;
	},
	score(c?: any, s?: any, now?: any) {
		if (s.dismissed || this.completed(c, s)) return -1;
		const at = this.trigger(c, s);
		const urgent = Number.isFinite(at) && at <= now && !(c.type === "event" && c.end <= now);
		// Things about to happen float up: a reminder within 15 minutes, a meeting within 30.
		const start = c.type === "event" ? c.start : at,
			soon =
				!urgent &&
				Number.isFinite(start) &&
				start > now &&
				start - now <= (c.type === "event" ? 30 : 15) * 60000;
		return (
			(urgent ? 100 : 0) + (soon ? 50 : 0) + Math.max(0, Math.min(10, Number(c.priority) || 0))
		);
	},
	sort(cards?: any, mode?: any, items?: any, now?: any) {
		const unique = [...new Map<any, any>(cards.map((c?: any) => [c.id, c])).values()];
		return unique
			.map((c?: any, index?: any) => ({ c, index }))
			.sort((a?: any, b?: any) => {
				const x = items[a.c.id] || {},
					y = items[b.c.id] || {};
				if (!!x.lessLike !== !!y.lessLike) return Number(!!x.lessLike) - Number(!!y.lessLike);
				if (mode === "time") return (b.c.time || 0) - (a.c.time || 0) || a.index - b.index;
				if (mode === "unread") return Number(!!x.read) - Number(!!y.read) || a.index - b.index;
				return this.score(b.c, y, now) - this.score(a.c, x, now) || a.index - b.index;
			})
			.map((x?: any) => x.c);
	},
	label(c?: any, s?: any, now?: any) {
		if (s.dismissed) return copy("web.feedpolicy.f641f7ed9f5d");
		if (s.reminderDone) return copy("web.feedpolicy.0eb5f2f421ed");
		const at = s.snoozedUntil || c.due;
		// No time, no label: the head already says it is a reminder; meta is not a status line.
		if (!Number.isFinite(at)) return "";
		const minutes = Math.ceil((at - now) / 60000);
		return minutes > 0
			? `${minutes}${copy("web.primitives.a63a9dc60e00")}${s.snoozedUntil ? copy("web.feedpolicy.ab068f148b03") : ""}`
			: s.snoozedUntil
				? copy("web.feedpolicy.098d14f95600")
				: copy("web.feedpolicy.56c92f48088a");
	},
};

export { FeedPolicy };
