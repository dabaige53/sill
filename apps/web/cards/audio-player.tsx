import { useEffect, useRef, useState } from "react";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";

export interface PlaybackSnapshot {
	position: number;
	duration: number;
	playing: boolean;
}
export interface PlaybackHandle {
	seek: (seconds: number) => void;
	toggle: () => void;
}
interface Props {
	url?: string;
	knownDuration?: number;
	initialPosition: number;
	onSave: (position: number, ended: boolean) => void;
	onTime: (state: PlaybackSnapshot) => void;
	controls: React.RefObject<PlaybackHandle | null>;
}

/** Uses only actual media events. Closing the detail pauses and saves the last position. */
export function AudioPlayer({
	url,
	knownDuration = 0,
	initialPosition,
	onSave,
	onTime,
	controls,
}: Props) {
	const audio = useRef<HTMLAudioElement>(null);
	const callbacks = useRef({ onSave, onTime });
	callbacks.current = { onSave, onTime };
	const [state, setState] = useState<PlaybackSnapshot>({
		position: initialPosition,
		duration: knownDuration,
		playing: false,
	});
	const [error, setError] = useState(false);
	const [rate, setRate] = useState(1);
	useEffect(() => {
		if (!url) {
			controls.current = null;
			return;
		}
		const media = audio.current!;
		media.src = url;
		let previous = initialPosition;
		let pendingSeek = initialPosition;
		let advanced = false;
		let ready = false;
		const update = () => {
			const position = Number.isFinite(media.currentTime) ? media.currentTime : 0;
			if (!media.seeking && !media.paused && position > previous + 0.01) advanced = true;
			previous = position;
			const next = {
				position,
				duration: Number.isFinite(media.duration) ? media.duration : 0,
				playing: !media.paused,
			};
			setState(next);
			callbacks.current.onTime(next);
		};
		const loaded = () => {
			ready = true;
			media.currentTime = Math.min(pendingSeek, Math.max(0, media.duration));
			update();
		};
		const seeking = () => {
			advanced = false;
			previous = media.currentTime;
		};
		const paused = () => {
			update();
			if (ready) callbacks.current.onSave(media.currentTime, false);
		};
		const ended = () => {
			update();
			callbacks.current.onSave(media.currentTime, advanced);
		};
		const failed = () => {
			setError(true);
			update();
		};
		const seek = (position: number) => {
			if (!ready || !Number.isFinite(media.duration)) {
				pendingSeek = Math.max(0, position);
				media.load();
				return;
			}
			advanced = false;
			media.currentTime = Math.max(0, Math.min(position, media.duration));
			update();
		};
		const toggle = () => {
			if (media.paused) {
				void media.play().catch(failed);
			} else media.pause();
		};
		controls.current = { seek, toggle };
		const events = {
			loadedmetadata: loaded,
			timeupdate: update,
			play: update,
			pause: paused,
			seeking,
			ended,
			error: failed,
		};
		for (const [name, listener] of Object.entries(events)) media.addEventListener(name, listener);
		return () => {
			for (const [name, listener] of Object.entries(events))
				media.removeEventListener(name, listener);
			media.pause();
			if (ready) callbacks.current.onSave(media.currentTime, false);
			controls.current = null;
		};
	}, [url, controls, initialPosition]);
	return (
		<div className="audio-player">
			{/* biome-ignore lint/a11y/useMediaCaption: Supplied timed transcript is rendered beside the custom audio controls. */}
			<audio ref={audio} src={url} preload="none" />
			<input
				type="range"
				min={0}
				max={state.duration || 0}
				step="0.1"
				value={Math.min(state.position, state.duration || 0)}
				disabled={!url || !state.duration}
				aria-label={copy("web.media.position")}
				onChange={(event) => controls.current?.seek(Number(event.target.value))}
			/>
			<div className="player-times num">
				<span>{duration(state.position)}</span>
				<span>
					{state.duration ? `−${duration(Math.max(0, state.duration - state.position))}` : ""}
				</span>
			</div>
			<div className="playback-controls">
				<button
					type="button"
					disabled={!url}
					aria-label={copy("web.media.rate")}
					onClick={() => {
						const next = rate >= 2 ? 0.75 : rate === 0.75 ? 1 : rate + 0.25;
						setRate(next);
						if (audio.current) audio.current.playbackRate = next;
					}}
				>
					{Number.isInteger(rate) ? rate.toFixed(1) : rate}×
				</button>
				<button
					type="button"
					disabled={!url}
					aria-label={copy("web.preview.podcast.rewind15")}
					onClick={() => controls.current?.seek(state.position - 15)}
				>
					<Icon name="rewind15" />
				</button>
				<button
					type="button"
					disabled={!url}
					className="playback-primary"
					aria-label={copy(state.playing ? "web.media.pause" : "web.media.play")}
					onClick={() => controls.current?.toggle()}
				>
					<Icon name={state.playing ? "pause" : "play"} size={24} />
				</button>
				<button
					type="button"
					disabled={!url}
					aria-label={copy("web.preview.podcast.forward30")}
					onClick={() => controls.current?.seek(state.position + 30)}
				>
					<Icon name="forward30" />
				</button>
			</div>
			{(error || !url) && (
				<p className="empty-description" role="alert">
					{copy("web.media.playbackUnavailable")}
				</p>
			)}
		</div>
	);
}
