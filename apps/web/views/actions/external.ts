import { copy } from "../../copy.ts";
import { CardTypes } from "../../data/cards.ts";
import { Store } from "../../data/store.ts";
import { agentKey } from "../../services/agent-handoff.ts";
import type { AppController } from "../app.ts";
import type { ActionContext, ActionHandler } from "./types.ts";

function agentHandoff(this: AppController, { id }: ActionContext) {
	void this.handoffCard(id);
}

function join(this: AppController, { id }: ActionContext) {
	const c = Store.card(id);
	if (c?.meeting?.url) void this.openExternal(c, c.meeting.url);
}

function external(this: AppController, { id }: ActionContext) {
	const card = Store.card(id);
	let scope: string;
	try {
		scope = agentKey(id, this.agentScope());
	} catch {
		this.alert(copy("web.agent.disconnected"));
		return;
	}
	void this.openExternal(card).then((opened) => {
		let current = false;
		try {
			current = scope === agentKey(id, this.agentScope());
		} catch {}
		const type = Store.card(id)?.type;
		if (opened && current && type && CardTypes[type]?.readable && !Store.item(id).read) {
			Store.patch(id, { read: true });
			this.refreshCard(id);
		}
	});
}

function downloadCalendar(this: AppController, { id }: ActionContext) {
	const c = Store.card(id),
		date = (x?: any) =>
			new Date(x)
				.toISOString()
				.replace(/[-:]/g, "")
				.replace(/\.\d{3}/, "");
	const escapeText = (text: string) =>
		text
			.replace(/\\/g, "\\\\")
			.replace(/;/g, "\\;")
			.replace(/,/g, "\\,")
			.replace(/\r\n|\n/g, "\\n");
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sill//Local//ZH",
		"BEGIN:VEVENT",
		`UID:${c.id}@sill.local`,
		`DTSTAMP:${date(Date.now())}`,
		`DTSTART:${date(c.start)}`,
		`DTEND:${date(c.end)}`,
		`SUMMARY:${escapeText(c.title)}`,
	];
	if (c.location) lines.push(`LOCATION:${escapeText(c.location)}`);
	lines.push("END:VEVENT", "END:VCALENDAR");
	this.download("sill.ics", lines.join("\r\n") + "\r\n", "text/calendar");
}

export const externalActions = {
	"agent-handoff": agentHandoff,
	join: join,
	external: external,
	"download-calendar": downloadCalendar,
} satisfies Record<string, ActionHandler>;
