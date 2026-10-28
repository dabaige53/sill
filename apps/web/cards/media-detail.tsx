import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion";
import foundation from "../../../design-system/tokens/foundation.json" with { type: "json" };
import type { Card } from "../../../contracts/card.ts";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import { detailDate } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { type AgentScope, agentKey } from "../services/agent-handoff.ts";
import { DetailText } from "./markdown.tsx";
import type { PlaybackHandle, PlaybackSnapshot } from "./playback.ts";
import { PodcastDetail } from "./podcast-detail.tsx";
import { publicationName, SourceMark } from "./source-mark.tsx";
import { VideoTabs, type VideoTab, videoTabNames } from "./video-tabs.tsx";
import { YouTubePlayer, youtubeID } from "./youtube-player.tsx";

type Line = { start: number; title?: string; text?: string };
/**
 * Playback reports its position several times a second. Transcripts hold up to 10,000 lines,
 * so the lists re-render only when the current line, availability or the lines change.
 */
export const MediaLines = memo(function MediaLines({
	lines,
	current,
	available,
	label,
	onSeek,
}: {
	lines: Line[];
	current: number;
	available: boolean;
	label: "title" | "text";
	onSeek: (seconds: number) => void;
}) {
	return lines.map((line, i) => (
		<button
			type="button"
			key={line.start}
			disabled={!available}
			aria-current={i === current}
			onClick={() => onSeek(line.start)}
		>
			<time className="num">{duration(line.start)}</time>
			<span>{line[label]}</span>
		</button>
	));
});
export type PlaybackApp = { agentScope?: () => AgentScope; refreshCard?: (id: string) => void };
export function MediaDetail(props: { card: Card; app?: PlaybackApp; full?: boolean }) {
	return props.card.media === "podcast" ? (
		<PodcastDetail card={props.card} />
	) : (
		<VideoDetail {...props} />
	);
}
function VideoDetail({
	card,
	app,
	full = false,
}: {
	card: Card;
	app?: PlaybackApp;
	full?: boolean;
}) {
	const currentScope = () => {
		try {
			return app?.agentScope ? agentKey(card.id, app.agentScope()) : "local";
		} catch {
			return null;
		}
	};
	const scope = useRef(currentScope());
	const controls = useRef<PlaybackHandle | null>(null),
		initial = useRef(Store.item(card.id).playbackPosition || 0);
	const [state, setState] = useState<PlaybackSnapshot>({
		position: initial.current,
		duration: card.duration || 0,
		playing: false,
	});
	const tabId = useId();
	const direction = useRef(1);
	const panel = useRef<HTMLDivElement>(null);
	const switched = useRef(false);
	const [tab, setTab] = useState<VideoTab>(
			full && card.transcript?.length ? "transcript" : "summary",
		),
		[follow, setFollow] = useState(true);
	const transcript = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (!switched.current || !panel.current) return;
		switched.current = false;
		const run = animate(
			panel.current,
			{
				opacity: [0, 1],
				transform: [`translateX(${direction.current * 8}px)`, "translateX(0px)"],
				filter: ["blur(4px)", "blur(0px)"],
			},
			{ duration: foundation.motion.videoTabs.panelEnter, ease: [0.23, 1, 0.32, 1] },
		);
		return () => run.stop();
	}, [tab]);
	const chapterIndex = (card.chapters || []).findLastIndex(
		(chapter) => chapter.start <= state.position,
	);
	const active = (card.transcript || []).findLastIndex((line) => line.start <= state.position);
	useEffect(() => {
		if (state.playing && active >= 0 && follow && tab === "transcript")
			transcript.current
				?.querySelector('[aria-current="true"]')
				?.scrollIntoView({ block: "nearest" });
	}, [active, follow, tab, state.playing]);
	const save = (position: number, ended: boolean) => {
		if (
			!scope.current ||
			currentScope() !== scope.current ||
			!Store.card(card.id) ||
			!Number.isFinite(position)
		)
			return;
		Store.patch(card.id, {
			playbackPosition: position,
			...(ended ? { read: true, readAt: Date.now() } : {}),
		});
		app?.refreshCard?.(card.id);
	};
	const seek = useCallback((seconds: number) => controls.current?.seek(seconds), []);
	const video = youtubeID(card.url);
	const available = !!video;
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
						cover={card.image ? assetURL(card.image) : undefined}
						knownDuration={card.duration}
						onSave={save}
						onTime={setState}
						controls={controls}
					/>
				) : (
					<div className="unavailable-video">
						{card.image && (
							<img
								referrerPolicy="no-referrer"
								decoding="async"
								onError={(event) => {
									event.currentTarget.style.opacity = "0";
								}}
								onLoad={(event) => {
									event.currentTarget.style.opacity = "1";
								}}
								src={assetURL(card.image)}
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
				{full && card.media !== "podcast" && (
					<div className="video-chapters">
						<div className="chapter-segments">
							{card.chapters?.length ? (
								card.chapters.map((chapter, i) => {
									const end = card.chapters?.[i + 1]?.start ?? state.duration;
									const length = Math.max(1, end - chapter.start);
									return (
										<button
											type="button"
											key={chapter.start}
											disabled={!available || state.duration <= 0}
											style={{ flex: length }}
											aria-label={chapter.title}
											title={chapter.title}
											onClick={() => controls.current?.seek(chapter.start)}
										>
											<i
												style={{
													width: `${Math.max(0, Math.min(1, (state.position - chapter.start) / length)) * 100}%`,
												}}
											/>
										</button>
									);
								})
							) : (
								<button type="button" disabled aria-label={copy("web.media.emptyChapters")} />
							)}
						</div>
						<div className="video-current-chapter">
							<Icon name="list" size={14} />
							<span>
								{card.chapters?.findLast((chapter) => chapter.start <= state.position)?.title ||
									copy("web.media.emptyChapters")}
							</span>
							<time className="num">
								{duration(state.position)} /{" "}
								{state.duration > 0 ? duration(state.duration) : copy("web.media.unknownDuration")}
							</time>
						</div>
					</div>
				)}
			</div>
			<div className="media-secondary">
				{full && (
					<div className="media-tab-header">
						<VideoTabs
							id={tabId}
							value={tab}
							onChange={(next) => {
								if (next === tab) return;
								const current = panel.current;
								direction.current =
									videoTabNames.indexOf(next) > videoTabNames.indexOf(tab) ? 1 : -1;
								if (current && document.documentElement.dataset.inputModality !== "keyboard") {
									const old = current.cloneNode(true) as HTMLDivElement;
									old.removeAttribute("id");
									old.setAttribute("aria-hidden", "true");
									old.setAttribute("inert", "");
									current.parentElement
										?.querySelectorAll(".video-tab-exit")
										.forEach((node) => node.remove());
									old.classList.add("video-tab-exit");
									current.parentElement?.append(old);
									animate(
										old,
										{
											opacity: [1, 0],
											transform: ["translateX(0px)", `translateX(${direction.current * -6}px)`],
										},
										{ duration: foundation.motion.videoTabs.panelExit, ease: [0.23, 1, 0.32, 1] },
									).finished.then(() => old.remove());
									switched.current = true;
								}
								setTab(next);
							}}
						/>
						{tab === "transcript" && (
							<button
								className="media-follow"
								type="button"
								disabled={!card.transcript?.length || !available}
								aria-pressed={follow}
								onClick={() => setFollow(!follow)}
							>
								<Icon name="clock" size={14} />
								{copy("web.media.follow")}
							</button>
						)}
					</div>
				)}
				<div className="video-tab-panels">
					<div
						ref={panel}
						className="video-tab-panel"
						role={full ? "tabpanel" : undefined}
						id={`${tabId}-panel-${tab}`}
						aria-labelledby={full ? `${tabId}-${tab}` : undefined}
					>
						{tab === "summary" &&
							(card.body?.trim() ? (
								<DetailText body={card.body} />
							) : (
								<p className="media-empty">{copy("web.media.emptyNotes")}</p>
							))}
						{tab === "chapters" && (
							<div className="media-lines">
								{!card.chapters?.length && (
									<p className="media-empty">{copy("web.media.emptyChapters")}</p>
								)}
								{card.chapters?.length ? (
									<MediaLines
										lines={card.chapters}
										current={chapterIndex}
										available={available}
										label="title"
										onSeek={seek}
									/>
								) : null}
							</div>
						)}
						{tab === "transcript" && (
							<>
								<div
									className="media-lines"
									ref={transcript}
									onWheel={() => setFollow(false)}
									onTouchMove={() => setFollow(false)}
								>
									{!card.transcript?.length && (
										<p className="media-empty">{copy("web.media.emptyTranscript")}</p>
									)}
									{card.transcript?.length ? (
										<MediaLines
											lines={card.transcript}
											current={active}
											available={available}
											label="text"
											onSeek={seek}
										/>
									) : null}
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
