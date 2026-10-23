// AI conversation shapes and rules shared by the desktop box and the phone AI page
// (handbook ai-conversation.md, ADR 0064). Nothing here talks to a model: the built-in AI is not
// connected, so the product holds no sessions and the box stays one line.

/** One line (the dock), the panel grown up from it, and the centered full view. */
export type AIHeight = "line" | "panel" | "full";

/** Only a Sill receipt makes a result "written"; an unknown outcome is checked, never resent. */
export type AIResultState = "pending" | "running" | "written" | "failed" | "unknown";

export type AIResult = {
	cardId: string;
	title: string;
	/** Card type, for its icon. */
	type: string;
	/** What changed, in the card's words ("到期改为今天"). */
	change: string;
	state: AIResultState;
};

export type AIMessage =
	| { id: string; role: "you"; text: string; cards?: string[] }
	| { id: string; role: "ai"; text: string; streaming?: boolean; results?: AIResult[] };

export type AISession = {
	id: string;
	title: string;
	updatedAt: number;
	running: boolean;
	/** A result arrived since the person last looked. */
	unseen?: boolean;
	messages: AIMessage[];
};

/** What the session button shows on the one-line box. */
export type AISessionStatus = "running" | "attention" | "unseen" | "idle";

export function sessionStatus(session?: AISession | null): AISessionStatus {
	if (!session) return "idle";
	const results = session.messages.flatMap((m) => (m.role === "ai" ? m.results || [] : []));
	if (results.some((r) => r.state === "failed" || r.state === "unknown")) return "attention";
	if (session.running) return "running";
	return session.unseen ? "unseen" : "idle";
}

/** Sessions running besides the current one, for 「另 N 个进行中」. */
export function othersRunning(sessions: AISession[], currentId: string | null) {
	return sessions.filter((s) => s.running && s.id !== currentId).length;
}

export type AISessionGroup = {
	key: "running" | "today" | "yesterday" | "earlier";
	sessions: AISession[];
};

/** The session list: running first, then history by day, newest first. Empty groups drop. */
export function sessionGroups(sessions: AISession[], now = Date.now()): AISessionGroup[] {
	const day = new Date(now);
	day.setHours(0, 0, 0, 0);
	const today = day.getTime();
	const yesterday = today - 86400000;
	const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
	const groups: AISessionGroup[] = [
		{ key: "running", sessions: sorted.filter((s) => s.running) },
		{ key: "today", sessions: sorted.filter((s) => !s.running && s.updatedAt >= today) },
		{
			key: "yesterday",
			sessions: sorted.filter((s) => !s.running && s.updatedAt >= yesterday && s.updatedAt < today),
		},
		{ key: "earlier", sessions: sorted.filter((s) => !s.running && s.updatedAt < yesterday) },
	];
	return groups.filter((g) => g.sessions.length);
}

export type AIHeightEvent =
	| "open"
	| "collapse"
	| "full"
	| "shrink"
	| "escape"
	| "outside"
	| "detail"
	| "select";

/**
 * The height table in the handbook. Without a session the box cannot grow: there is nothing to
 * show and nothing is invented.
 */
export function nextHeight(height: AIHeight, event: AIHeightEvent, hasSession: boolean): AIHeight {
	if (!hasSession) return "line";
	switch (event) {
		case "open":
			return height === "line" ? "panel" : height;
		case "collapse":
			return height === "panel" ? "line" : height;
		case "full":
			return "full";
		case "shrink":
			return height === "full" ? "panel" : height;
		case "escape":
			return height === "full" ? "panel" : "line";
		case "outside":
		case "detail":
		case "select":
			return height === "panel" ? "line" : height;
	}
}
