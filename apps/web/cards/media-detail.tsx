import { animate } from "motion/mini";
import { useEffect, useRef, useState } from "react";
import type { Card } from "../../../contracts/card.ts";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import { detailDate } from "../data/card-source.ts";
import { AssetTones } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import { type AgentScope, agentKey } from "../services/agent-handoff.ts";
import { AudioPlayer, type PlaybackHandle, type PlaybackSnapshot } from "./audio-player.tsx";
import { DetailText } from "./markdown.tsx";
import { publicationName, SourceMark } from "./source-mark.tsx";
import { YouTubePlayer, youtubeID } from "./youtube-player.tsx";

export type PlaybackApp = { agentScope?: () => AgentScope; refreshCard?: (id: string) => void };
export function MediaDetail({
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
	const [tab, setTab] = useState(full || card.media === "podcast" ? "transcript" : "summary"),
		[follow, setFollow] = useState(true);
	const transcript = useRef<HTMLDivElement>(null);
	const primary = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);
	const compactPlayer = useRef<HTMLDivElement>(null);
	const playerBackdrop = useRef<HTMLDivElement>(null);
	const tabBackdrop = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (full) {
			setCompact(false);
			return;
		}
		const node = primary.current;
		const player = compactPlayer.current;
		const backdrop = playerBackdrop.current;
		const tabs = tabBackdrop.current;
		const scroll = node?.closest(".sheet-scroll");
		if (!node || !player || !backdrop || !tabs || !scroll || card.media !== "podcast") return;
		// One paused Motion timeline per surface. Scroll owns progress, with no timed catch-up.
		const options = { duration: 1, ease: "linear" as const, autoplay: false };
		const timelines = [
			animate(node, { opacity: [1, 0] }, options),
			animate(
				player,
				{ opacity: [0, 1], transform: ["translateY(calc(-1 * var(--space-8)))", "none"] },
				options,
			),
			animate(backdrop, { opacity: [0, 1] }, options),
			animate(tabs, { opacity: [0, 1] }, options),
		];
		let frame = 0;
		const update = () => {
			frame = 0;
			const top = Number.parseFloat(getComputedStyle(player.parentElement!).top) || 0;
			const range = Math.max(1, player.offsetHeight);
			const end = scroll.getBoundingClientRect().top + top + player.offsetHeight;
			const progress =
				scroll.scrollTop <= 0
					? 0
					: Math.max(0, Math.min(1, (end + range - node.getBoundingClientRect().bottom) / range));
			for (const timeline of timelines) timeline.time = progress;
			// Only the dominant player accepts focus and pointer input during the handoff.
			setCompact(progress >= 0.5);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		const resize = new ResizeObserver(schedule);
		resize.observe(node);
		resize.observe(scroll);
		scroll.addEventListener("scroll", schedule, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			scroll.removeEventListener("scroll", schedule);
			for (const timeline of timelines) timeline.cancel();
		};
	}, [card.media, full]);
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
	const video = youtubeID(card.url);
	const available = card.media === "podcast" ? !!card.audioUrl : !!video;
	return (
		<div
			className={`media-detail ${card.media === "podcast" ? "is-podcast" : "is-video"}${compact ? " is-compact" : ""}`}
			style={
				{
					"--podcast-tone": AssetTones[card.image] || "var(--surface)",
				} as import("react").CSSProperties
			}
		>
			<div
				className="media-primary"
				ref={primary}
				inert={compact}
				aria-hidden={compact || undefined}
			>
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
				{card.media === "podcast" && (
					<div className="player-art">
						{card.image && (
							<img
								referrerPolicy="no-referrer"
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
					</div>
				)}
				<h1 id="modal-title">{card.title}</h1>
				{card.media === "podcast" && (
					<div className="preview-meta">
						<SourceMark card={card} />
						<span>
							{[publicationName(card), detailDate(card.publishedAt)].filter(Boolean).join(" · ")}
						</span>
					</div>
				)}
				{card.media !== "podcast" && !!Store.tags(card).length && (
					<div className="preview-tags">
						{Store.tags(card).map((tag) => (
							<span className="chip soft" key={tag}>
								#{tag}
							</span>
						))}
					</div>
				)}
				{card.media === "podcast" ? (
					<p className="current-chapter">
						<Icon name="list" size={14} />{" "}
						{chapterIndex >= 0
							? `${copy("web.media.chapterNumber").replace("{number}", String(chapterIndex + 1))} · ${card.chapters[chapterIndex].title}`
							: copy("web.media.emptyChapters")}
					</p>
				) : null}
				{card.media === "podcast" ? (
					<AudioPlayer
						url={card.audioUrl}
						knownDuration={card.duration}
						initialPosition={initial.current}
						onSave={save}
						onTime={setState}
						controls={controls}
					/>
				) : video ? (
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
			{card.media === "podcast" && (
				<div className="compact-player-slot">
					<div className="compact-player-backdrop" ref={playerBackdrop} aria-hidden="true" />
					<div
						className="compact-player"
						ref={compactPlayer}
						inert={!compact}
						aria-hidden={!compact}
					>
						{card.image && (
							<img
								referrerPolicy="no-referrer"
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
						<button
							type="button"
							className="compact-title"
							onClick={() => primary.current?.scrollIntoView({ block: "start" })}
						>
							{card.title}
							<small>
								{chapterIndex >= 0
									? `${copy("web.media.chapterNumber").replace("{number}", String(chapterIndex + 1))} · `
									: ""}
								{duration(state.position)} /{" "}
								{state.duration > 0 ? duration(state.duration) : copy("web.media.unknownDuration")}
							</small>
						</button>
						<button
							type="button"
							disabled={!available}
							aria-label={copy("web.preview.podcast.rewind15")}
							onClick={() => controls.current?.seek(state.position - 15)}
						>
							<Icon name="rewind15" />
						</button>
						<button
							type="button"
							className="playback-primary"
							disabled={!available}
							aria-label={copy(state.playing ? "web.media.pause" : "web.media.play")}
							onClick={() => controls.current?.toggle()}
						>
							<Icon name={state.playing ? "pause" : "play"} />
						</button>
						<progress max={state.duration || 1} value={state.position} />
					</div>
				</div>
			)}
			<div className="media-secondary">
				{(full || card.media === "podcast") && (
					<div className="media-tab-header">
						<div className="media-tab-backdrop" ref={tabBackdrop} aria-hidden="true" />
						<div className="media-tabs" role="tablist">
							{["transcript", "chapters", "summary"].map((name) => (
								<button
									type="button"
									key={name}
									role="tab"
									aria-selected={tab === name}
									onClick={() => setTab(name)}
								>
									{copy(
										name === "chapters"
											? "web.media.chapters"
											: name === "transcript"
												? "web.media.transcript"
												: card.media === "podcast"
													? "web.media.notes"
													: "web.media.summary",
									)}
								</button>
							))}
						</div>
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
						{card.chapters?.map((chapter, i) => (
							<button
								type="button"
								key={chapter.start}
								disabled={!available}
								aria-current={
									state.position >= chapter.start &&
									state.position < (card.chapters?.[i + 1]?.start ?? Infinity)
								}
								onClick={() => controls.current?.seek(chapter.start)}
							>
								<time className="num">{duration(chapter.start)}</time>
								<span>{chapter.title}</span>
							</button>
						))}
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
							{card.transcript?.map((line, i) => (
								<button
									type="button"
									key={line.start}
									disabled={!available}
									aria-current={i === active}
									onClick={() => controls.current?.seek(line.start)}
								>
									<time className="num">{duration(line.start)}</time>
									<span>{line.text}</span>
								</button>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
