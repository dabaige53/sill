import { useRef } from "react";
import type { Card } from "../../../contracts/card.ts";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import { detailDate } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { type AgentScope, agentKey } from "../services/agent-handoff.ts";
import { DetailText } from "./markdown.tsx";
import { PodcastDetail } from "./podcast-detail.tsx";
import { publicationName, SourceMark } from "./source-mark.tsx";
import { YouTubePlayer, youtubeID } from "./youtube-player.tsx";

export type PlaybackApp = { agentScope?: () => AgentScope; refreshCard?: (id: string) => void };
export function MediaDetail(props: { card: Card; app?: PlaybackApp; full?: boolean }) {
	return props.card.media === "podcast" ? (
		<PodcastDetail card={props.card} />
	) : (
		<VideoDetail {...props} />
	);
}
function VideoDetail({ card, app }: { card: Card; app?: PlaybackApp; full?: boolean }) {
	const currentScope = () => {
		try {
			return app?.agentScope ? agentKey(card.id, app.agentScope()) : "local";
		} catch {
			return null;
		}
	};
	const scope = useRef(currentScope());
	const initial = useRef(Store.item(card.id).playbackPosition || 0);
	const save = (position: number) => {
		if (
			!scope.current ||
			currentScope() !== scope.current ||
			!Store.card(card.id) ||
			!Number.isFinite(position)
		)
			return;
		Store.patch(card.id, { playbackPosition: position });
		app?.refreshCard?.(card.id);
	};
	const video = youtubeID(card.url);
	return (
		<div className="media-detail is-video">
			<div className="media-primary">
				{card.media !== "podcast" && (
					<div className="preview-meta">
						<SourceMark card={card} />
						<span>
							{[
								publicationName(card),
								detailDate(card.publishedAt),
								card.duration !== undefined ? duration(card.duration) : "",
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</div>
				)}
				<h1 id="modal-title">{card.title}</h1>
				{card.media !== "podcast" && !!Store.tags(card).length && (
					<div className="preview-tags">
						{Store.tags(card).map((tag) => (
							<span className="chip soft" key={tag}>
								#{tag}
							</span>
						))}
					</div>
				)}
				{video ? (
					<YouTubePlayer
						id={video}
						initialPosition={initial.current}
						cover={card.images?.[0] ? assetURL(card.images[0]) : undefined}
						knownDuration={card.duration}
						onSave={save}
					/>
				) : (
					<div className="unavailable-video">
						{card.images?.[0] && (
							<img
								referrerPolicy="no-referrer"
								decoding="async"
								onError={(event) => {
									event.currentTarget.style.opacity = "0";
								}}
								onLoad={(event) => {
									event.currentTarget.style.opacity = "1";
								}}
								src={assetURL(card.images[0])}
								alt=""
							/>
						)}
						<div>
							<button type="button" disabled aria-label={copy("web.media.play")}>
								<Icon name="play" />
							</button>
							<p>{copy("web.media.playbackUnavailable")}</p>
						</div>
					</div>
				)}
			</div>
			{card.body?.trim() ? <DetailText body={card.body} /> : null}
		</div>
	);
}
