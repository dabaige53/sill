import { markdownText } from "../atoms/markdown.ts";
import { copy } from "../copy.ts";
import type { AISession } from "../data/ai-conversation.ts";
import { Store } from "../data/store.ts";
import { AIMessages, AISessionList } from "../views/ai-thread.tsx";
import type { AppController } from "../views/app.ts";
import type { PanelRenderers } from "./panel-contract.ts";
import { icon, keyed } from "./panel-primitives.tsx";

export type AIPageState = Pick<AppController, "aiSelectionIds"> &
	Partial<
		Pick<AppController, "aiDraft" | "aiSessions" | "aiSessionId" | "aiHistoryOpen" | "aiConnected">
	>;

/**
 * The phone AI page (handbook ai-conversation.md). Without a session it is the empty page with
 * context cards; with one, the top row shrinks to the session title and the conversation fills
 * the page. The built-in AI is not connected, so send, voice and new chat stay disabled.
 */
export const panelAI = {
	ai(this: PanelRenderers, app?: AIPageState) {
		const sessions: AISession[] = app?.aiSessions || [];
		const session = sessions.find((s) => s.id === app?.aiSessionId) || sessions[0] || null;
		const connected = Boolean(app?.aiConnected);
		const cards = [...new Set<string>(app?.aiSelectionIds || [])]
			.map((id) => Store.card(id))
			.filter(Boolean);
		const context = session
			? cards.map((card) => (
					<span key={card.id} className={"ai-dock-chip"} data-ai-context={card.id}>
						<span className={"ai-dock-chip-title"}>{card.title}</span>
					</span>
				))
			: cards.map((card) => {
					const excerpt = (card.summary || markdownText(card.body || "")).slice(0, 180);
					return (
						<article key={card.id} className={"ai-context-card"} data-ai-context={card.id}>
							<h3>{card.title}</h3>
							{excerpt ? <p>{excerpt}</p> : ""}
						</article>
					);
				});
		const head = (
			<div className="ai-head-actions">
				<button
					type="button"
					className="icon-button ai-head-button"
					data-action="ai-history"
					aria-expanded={Boolean(app?.aiHistoryOpen)}
					disabled={!sessions.length}
					aria-label={sessions.length ? copy("ai.history") : copy("web.ai.history")}
				>
					{icon("clock", 20)}
				</button>
				<button
					type="button"
					className="icon-button ai-head-button"
					disabled={!connected}
					aria-label={connected ? copy("ai.newChat") : copy("web.ai.newChat")}
				>
					{icon("plus", 20)}
				</button>
			</div>
		);
		const running = Boolean(session?.running);
		return (
			<>
				<div className={`sheet ai-conversation${session ? " has-session" : ""}`}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<header className={"ai-conversation-head"}>
						{session ? (
							<h1 id={"modal-title"} className="ai-conversation-title">
								{session.title}
							</h1>
						) : (
							<h1 id={"modal-title"}>{copy("web.ai.title")}</h1>
						)}
						{head}
					</header>
					{session ? (
						<div className="ai-conversation-thread" id="ai-page-thread">
							<AIMessages session={session} connected={connected} />
						</div>
					) : null}
					<section
						className={`ai-context${session ? " is-compact" : ""}`}
						aria-label={copy("web.ai.context")}
					>
						{keyed(context)}
					</section>
					<div className={"ai-composer"}>
						<textarea
							id={"ai-local-draft"}
							aria-label={copy("web.ai.composer")}
							placeholder={session ? copy("ai.followUp") : copy("web.ai.placeholder")}
							maxLength={4000}
							rows={1}
							defaultValue={app?.aiDraft || ""}
						/>
						<div className="ai-composer-tools">
							<button
								type="button"
								className="icon-button ai-attach"
								disabled
								aria-label={copy("web.ai.attach")}
							>
								{icon("paperclip", 18)}
							</button>
							{running ? (
								<button
									type="button"
									className="icon-button ai-stop"
									disabled
									aria-label={copy("ai.stopUnavailable")}
								/>
							) : (
								<>
									<button
										type="button"
										className="icon-button ai-send"
										disabled
										aria-label={copy("web.ai.sendUnavailable")}
									>
										{icon("up", 20)}
									</button>
									<button type="button" className="ai-speak" disabled>
										{icon("audio-lines", 18)}
										<span>{copy("web.ai.speak")}</span>
									</button>
								</>
							)}
						</div>
					</div>
					{session && app?.aiHistoryOpen ? (
						<>
							<button
								type="button"
								className="ai-history-scrim"
								data-action="ai-history"
								aria-label={copy("web.close")}
							/>
							<div className="ai-history" role="dialog" aria-label={copy("ai.history")}>
								<span className="ai-history-grabber" aria-hidden="true" />
								<h2>{copy("ai.history")}</h2>
								<AISessionList sessions={sessions} currentId={session.id} connected={connected} />
							</div>
						</>
					) : null}
				</div>
			</>
		);
	},
};
