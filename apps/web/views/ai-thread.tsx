import React from "react";
import { timeString } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import {
	type AIMessage,
	type AIResult,
	type AISession,
	type AISessionStatus,
	sessionGroups,
	sessionStatus,
} from "../data/ai-conversation.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";

// The conversation parts shared by the desktop panel, the full view and the phone AI page
// (handbook ai-conversation.md). Buttons only carry data-action; the controller decides.

/** A ring that turns while something runs; the controller starts the turn after paint. */
export function AISpinner({ size = 18 }: { size?: number }) {
	return (
		<svg className="ai-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="8" className="ai-spin-track" />
			<path d="M12 4a8 8 0 0 1 8 8" className="ai-spin-arc" />
		</svg>
	);
}

/** The session button's face: running, a new result, or something to check. */
export function AIStatusFace({ status }: { status: AISessionStatus }) {
	if (status === "running") return <AISpinner size={20} />;
	if (status === "attention")
		return (
			<span className="ai-status-attention">
				<Icon name="info" size={20} />
			</span>
		);
	return (
		<span className="ai-status-face">
			<Icon name="chat" size={18} />
			{status === "unseen" ? <i className="ai-status-dot" aria-hidden="true" /> : null}
		</span>
	);
}

export function statusLabel(status: AISessionStatus) {
	return status === "idle" ? "" : copy(`ai.status.${status}`);
}

const resultIcon = (state: AIResult["state"]) => {
	if (state === "running") return <AISpinner />;
	if (state === "pending") return <span className="ai-result-pending" />;
	if (state === "written") return <Icon name="check" size={18} />;
	return <Icon name={state === "failed" ? "x" : "info"} size={18} />;
};

/** One changed card: type, title, what changed, and its real write state. */
export function AIResultRow({ result, connected }: { result: AIResult; connected: boolean }) {
	const warn = result.state === "failed" || result.state === "unknown";
	const type = CardTypes[result.type] || CardTypes.note;
	return (
		<li className={`ai-result is-${result.state}`}>
			<button
				type="button"
				className="ai-result-open"
				data-action="ai-result-open"
				data-id={result.cardId}
				aria-label={copy("ai.openCard").replace("{title}", result.title)}
			>
				<span className="ai-result-tile">
					<Icon name={type.icon} size={20} />
				</span>
				<span className="ai-result-text">
					<b>{result.title}</b>
					<span className={warn ? "is-warn" : ""}>
						{warn ? copy(`ai.result.${result.state}`) : result.change}
					</span>
				</span>
			</button>
			{result.state === "failed" ? (
				<button
					type="button"
					className="ai-result-action"
					data-action="ai-result-retry"
					data-id={result.cardId}
					disabled={!connected}
					aria-label={connected ? copy("ai.retry") : copy("ai.retryUnavailable")}
				>
					{copy("ai.retry")}
				</button>
			) : null}
			{result.state === "unknown" ? (
				<button
					type="button"
					className="ai-result-action"
					data-action="ai-result-open"
					data-id={result.cardId}
				>
					{copy("ai.check")}
				</button>
			) : null}
			<span className="ai-result-state" role="img" aria-label={copy(`ai.result.${result.state}`)}>
				{resultIcon(result.state)}
			</span>
		</li>
	);
}

function Message({ message, connected }: { message: AIMessage; connected: boolean }) {
	if (message.role === "you") {
		const cards = (message.cards || []).map((id) => Store.card(id)).filter(Boolean);
		return (
			<div className="ai-you">
				{cards.length ? (
					<ul className="ai-attached" aria-label={copy("ai.attached")}>
						{cards.map((card) => (
							<li key={card.id}>{card.title}</li>
						))}
					</ul>
				) : null}
				<p className="ai-bubble">{message.text}</p>
			</div>
		);
	}
	return (
		<div className="ai-says">
			<p>
				{message.text}
				{message.streaming ? <i className="ai-stream-dot" aria-hidden="true" /> : null}
			</p>
			{message.results?.length ? (
				<ul className="ai-results">
					{message.results.map((result) => (
						<AIResultRow
							key={`${message.id}-${result.cardId}`}
							result={result}
							connected={connected}
						/>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** The conversation, oldest first; the view keeps it pinned to the newest line. */
export function AIMessages({ session, connected }: { session: AISession; connected: boolean }) {
	return (
		<div className="ai-messages">
			{session.messages.map((message) => (
				<Message key={message.id} message={message} connected={connected} />
			))}
		</div>
	);
}

/** New chat, running sessions, then history by day. */
export function AISessionList({
	sessions,
	currentId,
	connected,
	now = Date.now(),
}: {
	sessions: AISession[];
	currentId: string | null;
	connected: boolean;
	now?: number;
}) {
	const time = (at: number) => {
		const date = new Date(at);
		return new Date(now).toDateString() === date.toDateString()
			? timeString(at)
			: copy("ai.date")
					.replace("{month}", String(date.getMonth() + 1))
					.replace("{day}", String(date.getDate()));
	};
	return (
		<>
			<button
				type="button"
				className="ai-session ai-session-new"
				disabled={!connected}
				aria-label={connected ? copy("ai.newChat") : copy("ai.newChatUnavailable")}
			>
				<span className="ai-session-mark">
					<Icon name="plus" size={18} />
				</span>
				<span className="ai-session-title">{copy("ai.newChat")}</span>
			</button>
			{sessionGroups(sessions, now).map((group) => (
				<section key={group.key} className="ai-session-group">
					<h3>{copy(`ai.group.${group.key}`)}</h3>
					<ul>
						{group.sessions.map((session) => {
							const status = sessionStatus(session);
							return (
								<li key={session.id}>
									<button
										type="button"
										className="ai-session"
										data-action="ai-session"
										data-id={session.id}
										aria-current={session.id === currentId ? "true" : undefined}
									>
										<span className="ai-session-mark">
											{status === "running" ? (
												<AISpinner size={16} />
											) : status === "attention" ? (
												<Icon name="info" size={16} />
											) : (
												<Icon name="check" size={16} />
											)}
										</span>
										<span className="ai-session-title">{session.title}</span>
										{session.running ? null : (
											<span className="ai-session-time">{time(session.updatedAt)}</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</>
	);
}
