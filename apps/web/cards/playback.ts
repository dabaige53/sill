export interface PlaybackSnapshot {
	position: number;
	duration: number;
	playing: boolean;
}
export interface PlaybackHandle {
	seek: (seconds: number) => void;
	toggle: () => void;
}
