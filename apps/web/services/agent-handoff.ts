import { copy } from "../copy.ts";

export type AgentScope = { kind: "cloud"; owner: string } | { kind: "local" };
export type AgentCard = {
	id: string;
	title: string;
	type?: string;
	summary?: string;
	body?: string;
	revision?: number;
};
export type AgentPayload = ReturnType<typeof agentPayload>;
export type AgentHost = {
	canDiscuss: () => boolean;
	discuss: (payload: AgentPayload, current: () => boolean) => Promise<void>;
};

export function agentFailure(code: string, message: string) {
	return Object.assign(new Error(message), { code });
}

export function agentKey(id: string, scope: AgentScope) {
	return JSON.stringify([scope.kind, scope.kind === "cloud" ? scope.owner : "", id]);
}

const brief = (value: string, limit: number) => {
	const text = value.replace(/\s+/g, " ").trim();
	const characters = Array.from(text);
	return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : text;
};

/** Attach explicit card content; exclude personal state and unknown fields. */
export function agentPayload(card: AgentCard, scope: AgentScope) {
	if (!card?.id || !/^[a-zA-Z0-9_-]{1,100}$/.test(card.id))
		throw agentFailure("card_unavailable", copy("web.agent.noCard"));
	if (scope.kind === "cloud" && !scope.owner)
		throw agentFailure("account_unavailable", copy("web.agent.disconnected"));
	const reference = {
		workspace: scope.kind,
		...(scope.kind === "cloud" ? { expected_owner: scope.owner } : {}),
		card: {
			id: card.id,
			title: brief(card.title || "", 200),
			...(card.type ? { type: brief(card.type, 100) } : {}),
			...(Number.isSafeInteger(card.revision) && card.revision > 0
				? { revision: card.revision }
				: {}),
			...(card.summary ? { summary: card.summary } : {}),
			...(card.body ? { body: card.body } : {}),
		},
	};
	const prompt = copy(scope.kind === "cloud" ? "web.agent.promptCloud" : "web.agent.promptLocal");
	return { reference, text: prompt + "\n\n" + JSON.stringify(reference, null, 2) };
}

/** One explicit click can send once. A lost message receipt never becomes an automatic retry. */
export class AgentHandoff {
	private pending = new Set<string>();
	private sent = new Set<string>();
	private unknown = new Set<string>();

	/** Reopening a detail allows a fresh explicit discussion; uncertain deliveries stay disabled. */
	beginDetail(key: string) {
		this.sent.delete(key);
	}

	state(key: string, host?: AgentHost) {
		if (this.pending.has(key)) return "sending";
		if (this.sent.has(key)) return "sent";
		if (this.unknown.has(key)) return "unknown";
		return host?.canDiscuss?.() ? "discuss" : "unavailable";
	}

	async run(
		key: string,
		prepare: () => Promise<AgentPayload>,
		host: AgentHost | undefined,
		current: () => boolean,
	) {
		if (this.pending.has(key) || this.sent.has(key)) return;
		if (this.unknown.has(key)) return;
		if (!host?.canDiscuss?.()) return;
		this.pending.add(key);
		try {
			const payload = await prepare();
			if (!current()) throw agentFailure("account_changed", copy("web.agent.accountChanged"));
			await host.discuss(payload, current);
			this.sent.add(key);
			return "sent";
		} catch (error) {
			if (error.code === "message_unknown") this.unknown.add(key);
			throw error;
		} finally {
			this.pending.delete(key);
		}
	}
}

/** The host owns navigation in an MCP App; browser popups are only for independent pages. */
export async function openCardLink(
	value: string,
	host: { openLink?: (url: string) => Promise<void> } | undefined,
	openWindow: (url: string) => unknown,
) {
	let url: URL;
	try {
		url = new URL(value);
		if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error();
	} catch {
		throw agentFailure("invalid_link", copy("web.agent.invalidLink"));
	}
	if (host) {
		if (!host.openLink) throw agentFailure("link_unavailable", copy("web.agent.linkUnavailable"));
		await host.openLink(url.href);
		return true;
	}
	// With noopener a browser can return null even after opening; this is not proof of a read.
	return !!openWindow(url.href);
}
