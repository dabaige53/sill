import React from "react";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { type AIHeight, type AISession, sessionStatus } from "../data/ai-conversation.ts";
import { AIMessages, AISessionList, AIStatusFace, statusLabel } from "./ai-thread.tsx";

// The desktop AI box's grown parts (handbook ai-conversation.md): the session button on the one
// line, the panel head and thread, and the full view's session column.

export function AIDockSessionButton({ session }: { session: AISession }) {
	const status = sessionStatus(session);
	const label = [copy("ai.sessionOpen"), session.title, statusLabel(status)]
		.filter(Boolean)
		.join("，");
	return (
		<button
			type="button"
			className={`ai-dock-button ai-dock-session is-${status}`}
			data-action="ai-open"
			aria-label={label}
		>
			<AIStatusFace status={status} />
		</button>
	);
}

export function AIDockThread({
	session,
	height,
	others,
	listOpen,
	connected,
}: {
	session: AISession;
	height: AIHeight;
	others: number;
	listOpen: boolean;
	connected: boolean;
}) {
	const head =
		height === "full" ? (
			<header className="ai-thread-head">
				<h2 className="ai-thread-title">{session.title}</h2>
				<span className="ai-thread-space" />
				<button
					type="button"
					className="ai-dock-button"
					data-action="ai-shrink"
					aria-label={copy("ai.shrink")}
				>
					<Icon name="collapse" size={18} />
				</button>
			</header>
		) : (
			<header className="ai-thread-head">
				<button
					type="button"
					className="ai-thread-switch"
					data-action="ai-sessions"
					aria-haspopup="listbox"
					aria-expanded={listOpen}
					aria-controls="ai-dock-sessions"
				>
					<span className="ai-thread-title">{session.title}</span>
					<span className="ai-chevron-down">
						<Icon name="chevron" size={16} />
					</span>
				</button>
				{others ? (
					<span className="ai-thread-others">
						{copy("ai.othersRunning").replace("{number}", String(others))}
					</span>
				) : null}
				<span className="ai-thread-space" />
				<button
					type="button"
					className="ai-dock-button"
					data-action="ai-full"
					aria-label={copy("ai.full")}
				>
					<Icon name="expand" size={18} />
				</button>
				<button
					type="button"
					className="ai-dock-button"
					data-action="ai-collapse"
					aria-label={copy("ai.collapse")}
				>
					<span className="ai-chevron-down">
						<Icon name="chevron" size={20} />
					</span>
				</button>
			</header>
		);
	return (
		<>
			{head}
			<div className="ai-thread-scroll" id="ai-thread-scroll">
				<AIMessages session={session} connected={connected} />
			</div>
		</>
	);
}

export function AIDockSessions({
	sessions,
	currentId,
	connected,
}: {
	sessions: AISession[];
	currentId: string | null;
	connected: boolean;
}) {
	return <AISessionList sessions={sessions} currentId={currentId} connected={connected} />;
}
