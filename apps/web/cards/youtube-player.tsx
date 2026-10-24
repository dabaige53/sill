import { useEffect, useRef, useState } from "react";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import type { PlaybackHandle, PlaybackSnapshot } from "./audio-player.tsx";

type Player = {
	getCurrentTime(): number;
	getDuration(): number;
	getPlayerState(): number;
	seekTo(seconds: number, allow: boolean): void;
	playVideo(): void;
	pauseVideo(): void;
	destroy(): void;
};
type API = { Player: new (element: HTMLElement, options: object) => Player };
declare global {
	interface Window {
		YT?: API;
		onYouTubeIframeAPIReady?: () => void;
	}
}
let api: Promise<API> | undefined;
export function loadAPI() {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	api ??= new Promise<API>((resolve, reject) => {
		const previous = window.onYouTubeIframeAPIReady;
		const cleanup = () => {
			clearTimeout(timeout);
			if (window.onYouTubeIframeAPIReady === loaded) window.onYouTubeIframeAPIReady = previous;
			script.onerror = null;
		};
		const fail = () => {
			cleanup();
			script.remove();
			api = undefined;
			reject(new Error("player unavailable"));
		};
		const loaded = () => {
			cleanup();
			previous?.();
			if (window.YT) resolve(window.YT);
			else fail();
		};
		window.onYouTubeIframeAPIReady = loaded;
		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		script.onerror = fail;
		const timeout = setTimeout(fail, 15000);
		document.head.append(script);
	});
	return api;
}
export function youtubeID(value?: string) {
	try {
		const url = new URL(value || "");
		if (url.protocol !== "https:") return null;
		const id =
			url.hostname === "youtu.be"
				? url.pathname.slice(1)
				: ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(
							url.hostname,
						)
					? url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
					: null;
		return id && /^[\w-]{11}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}
export function YouTubePlayer({
	id,
	initialPosition,
	cover,
	knownDuration,
	onSave,
	onTime,
	controls,
}: {
	id: string;
	initialPosition: number;
	cover?: string;
	knownDuration?: number;
	onSave: (position: number, ended: boolean) => void;
	onTime: (state: PlaybackSnapshot) => void;
	controls: React.RefObject<PlaybackHandle | null>;
}) {
	const host = useRef<HTMLDivElement>(null),
		callbacks = useRef({ onSave, onTime });
	callbacks.current = { onSave, onTime };
	const [attempt, setAttempt] = useState(0);
	const resume = useRef(initialPosition);
	const source = useRef({ id, initialPosition });
	const [error, setError] = useState(false),
		[ready, setReady] = useState(false),
		wantsPlay = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly rebuilds a failed player; initialPosition starts a new playback session.
	useEffect(() => {
		if (source.current.id !== id || source.current.initialPosition !== initialPosition) {
			resume.current = initialPosition;
			source.current = { id, initialPosition };
			wantsPlay.current = false;
		}
		setError(false);
		setReady(false);
		let disposed = false,
			player: Player | undefined,
			timer: ReturnType<typeof setInterval> | undefined,
			previous = resume.current,
			advanced = false,
			started = false,
			ready = false,
			failed = false;
		const fail = () => {
			if (disposed || failed) return;
			failed = true;
			clearTimeout(deadline);
			if (timer) clearInterval(timer);
			player?.pauseVideo?.();
			controls.current = null;
			setError(true);
			setReady(false);
			callbacks.current.onTime({
				position: previous,
				duration: knownDuration || 0,
				playing: false,
			});
		};
		const deadline = setTimeout(fail, 20000);
		const sample = () => {
			if (disposed || failed || !player || !ready) return;
			const position = player.getCurrentTime() || 0;
			const playing = player.getPlayerState() === 1;
			if (!started && !playing && position === 0) return;
			if (playing) started = true;
			const delta = position - previous;
			if (delta < 0 || delta > 2) advanced = false;
			else if (playing && delta > 0.01) advanced = true;
			previous = position;
			resume.current = position;
			callbacks.current.onTime({ position, duration: player.getDuration() || 0, playing });
		};
		void loadAPI()
			.then((YT) => {
				if (disposed || failed) return;
				const mount = document.createElement("iframe");
				const query = new URLSearchParams({
					enablejsapi: "1",
					origin: window.location.origin,
					playsinline: "1",
					start: String(Math.floor(resume.current)),
				});
				mount.referrerPolicy = "strict-origin-when-cross-origin";
				mount.title = copy("card.type.media");
				mount.allow = "fullscreen; picture-in-picture; encrypted-media";
				mount.allowFullscreen = true;
				mount.src = `https://www.youtube-nocookie.com/embed/${id}?${query}`;
				host.current!.append(mount);
				player = new YT.Player(mount, {
					events: {
						onReady: () => {
							if (disposed) return;
							clearTimeout(deadline);
							ready = true;
							setReady(true);
							if (wantsPlay.current) player?.playVideo();
							controls.current = {
								seek(seconds) {
									started = true;
									advanced = false;
									previous = seconds;
									player?.seekTo(seconds, true);
								},
								toggle() {
									if (player?.getPlayerState() === 1) player.pauseVideo();
									else player?.playVideo();
								},
							};
							timer = setInterval(sample, 500);
						},
						onStateChange: (event: { data: number }) => {
							if (disposed) return;
							if ([2, 3, 5].includes(event.data)) advanced = false;
							sample();
							if (event.data === 0 || event.data === 2)
								callbacks.current.onSave(previous, event.data === 0 && advanced);
						},
						onError: fail,
					},
				});
			})
			.catch(fail);
		return () => {
			disposed = true;
			clearTimeout(deadline);
			if (timer) clearInterval(timer);
			if (ready && player) {
				const position = started && !failed ? player.getCurrentTime() : previous;
				resume.current = position;
				player.pauseVideo();
				callbacks.current.onSave(position, false);
			}
			player?.destroy();
			host.current?.replaceChildren();
			controls.current = null;
			setReady(false);
		};
	}, [id, controls, initialPosition, attempt, knownDuration]);
	return (
		<>
			<div className="youtube-frame">
				<div className="youtube-player" ref={host} />
				{/* The cover stands in until the official player is ready, so a slow or blocked embed never shows an empty box. */}
				{!ready && (
					<div
						className="youtube-poster"
						style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
					>
						<button
							type="button"
							className="youtube-poster-play"
							aria-label={copy("web.media.play")}
							disabled={error}
							onClick={() => {
								wantsPlay.current = true;
							}}
						>
							<Icon name="play" />
						</button>
						<div className="youtube-poster-bar">
							<span className="num">
								{knownDuration === undefined
									? copy("web.media.unknownDuration")
									: `${duration(initialPosition)} / ${duration(knownDuration)}`}
							</span>
							<span className="youtube-poster-tag">{copy("web.media.youtubePlayer")}</span>
						</div>
					</div>
				)}
			</div>
			{error && (
				<div className="media-failure">
					<p role="alert">{copy("web.media.playbackUnavailable")}</p>
					<button
						type="button"
						className="btn"
						onClick={() => {
							wantsPlay.current = false;
							setAttempt((value) => value + 1);
						}}
					>
						{copy("web.retry")}
					</button>
				</div>
			)}
		</>
	);
}
