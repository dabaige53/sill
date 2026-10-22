import { useEffect, useRef, useState } from "react";
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
function loadAPI() {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	api ??= new Promise<API>((resolve, reject) => {
		const previous = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previous?.();
			if (window.YT) resolve(window.YT);
		};
		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		script.onerror = () => {
			api = undefined;
			reject(new Error("player unavailable"));
		};
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
	onSave,
	onTime,
	controls,
}: {
	id: string;
	initialPosition: number;
	onSave: (position: number, ended: boolean) => void;
	onTime: (state: PlaybackSnapshot) => void;
	controls: React.RefObject<PlaybackHandle | null>;
}) {
	const host = useRef<HTMLDivElement>(null),
		callbacks = useRef({ onSave, onTime });
	callbacks.current = { onSave, onTime };
	const [error, setError] = useState(false);
	useEffect(() => {
		let disposed = false,
			player: Player | undefined,
			timer: ReturnType<typeof setInterval> | undefined,
			previous = initialPosition,
			advanced = false,
			started = false,
			ready = false;
		const sample = () => {
			if (disposed || !player || !ready) return;
			const position = player.getCurrentTime() || 0;
			const playing = player.getPlayerState() === 1;
			if (!started && !playing && position === 0) return;
			if (playing) started = true;
			const delta = position - previous;
			if (delta < 0 || delta > 2) advanced = false;
			else if (playing && delta > 0.01) advanced = true;
			previous = position;
			callbacks.current.onTime({ position, duration: player.getDuration() || 0, playing });
		};
		void loadAPI()
			.then((YT) => {
				if (disposed) return;
				const mount = document.createElement("iframe");
				const query = new URLSearchParams({
					enablejsapi: "1",
					origin: window.location.origin,
					playsinline: "1",
					start: String(Math.floor(initialPosition)),
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
							ready = true;
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
						onError: () => setError(true),
					},
				});
			})
			.catch(() => {
				if (!disposed) setError(true);
			});
		return () => {
			disposed = true;
			if (timer) clearInterval(timer);
			if (ready && player) {
				const position = started ? player.getCurrentTime() : previous;
				player.pauseVideo();
				callbacks.current.onSave(position, false);
			}
			player?.destroy();
			controls.current = null;
		};
	}, [id, controls, initialPosition]);
	return (
		<>
			<div className="youtube-player" ref={host} />
			{error && <p role="alert">{copy("web.media.playbackUnavailable")}</p>}
		</>
	);
}
