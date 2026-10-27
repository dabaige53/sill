import { type AnimationPlaybackControls, animate, motionValue, spring } from "motion";
import { animate as animateStyle } from "motion/mini";
import tokens from "../../../design-system/tokens.json" with { type: "json" };

export type Playback = { finished: Promise<void>; cancel: () => void; complete: () => void };
const active = new Map<Element, Set<Playback>>();
const ownedProperties = new WeakMap<Playback, Set<string>>();
const backdrops = new WeakMap<
	HTMLElement,
	{
		controls: AnimationPlaybackControls;
		opacity: number;
		scrub?: boolean;
		from?: number;
		duration?: number;
		progress?: ReturnType<typeof spring>;
	}
>();

/** The backdrop opacity drawn now, so a new fade or scrub starts where the last one is. */
function drawnBackdrop(el: HTMLElement) {
	const state = backdrops.get(el);
	if (!state) return 1;
	if (state.scrub || !state.duration || state.from === undefined) return state.opacity;
	const time = Number(state.controls.time);
	if (!Number.isFinite(time)) return state.opacity;
	const progress = Math.min(
		1,
		Math.max(
			0,
			state.progress ? state.progress.next(time * 1000).value / 100 : time / state.duration,
		),
	);
	return state.from + (state.opacity - state.from) * progress;
}

/** Scrub the backdrop itself, without invalidating the dialog's descendants. */
export function dim(el: HTMLElement, opacity: number | null, duration = 0, cardSpring = false) {
	const previous = backdrops.get(el);
	if (opacity === null) {
		previous?.controls.cancel();
		backdrops.delete(el);
		return;
	}
	if (duration) {
		const from = drawnBackdrop(el);
		previous?.controls.cancel();
		const controls = animateStyle(el, { opacity: [from, opacity] }, {
			pseudoElement: "::backdrop",
			...(cardSpring
				? { type: spring, ...tokens.motion.cardSpring }
				: { duration: duration / 1000, ease: "linear" }),
		} as any);
		backdrops.set(el, {
			controls,
			opacity,
			from,
			duration: duration / 1000,
			...(cardSpring
				? { progress: spring({ keyframes: [0, 100], ...tokens.motion.cardSpring }) }
				: {}),
		});
		return;
	}
	// A timed fade cannot be scrubbed; replace it with a paused one-second track.
	if (previous && !previous.scrub) {
		previous.controls.cancel();
		backdrops.delete(el);
	}
	const state = (previous?.scrub && previous) || {
		controls: animateStyle(el, { opacity: [1, 0] }, {
			pseudoElement: "::backdrop",
			duration: 1,
			autoplay: false,
			ease: "linear",
		} as any),
		opacity: 1,
		scrub: true,
	};
	state.controls.time = 1 - opacity;
	state.opacity = opacity;
	backdrops.set(el, state);
}

/** Motion owns playback; this adapter preserves the controllers' cancellation contract. */
export function play(
	el: HTMLElement,
	frames: Record<string, any>[],
	options: {
		duration: number;
		delay?: number;
		easing?: string;
		fill?: string;
		spring?: boolean | "card" | "expanded" | "toggle" | "search-icon";
		repeat?: number;
		pseudoElement?: string;
	},
): Playback {
	const properties = [...new Set(frames.flatMap(Object.keys))].filter((key) => key !== "offset");
	const propertyKey = (key: string) => `${options.pseudoElement || ""}:${key}`;
	for (const owner of [...(active.get(el) || [])]) {
		if (properties.some((key) => ownedProperties.get(owner)?.has(propertyKey(key)))) owner.cancel();
	}
	const previous = Object.fromEntries(properties.map((key) => [key, el.style[key]]));
	const keyframes = Object.fromEntries(
		properties.map((key) => [key, frames.map((frame) => frame[key] ?? null)]),
	);
	const curve = options.easing?.match(/cubic-bezier\(([^)]+)\)/);
	const ease = curve ? curve[1].split(",").map(Number) : options.easing || "linear";
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const finished = new Promise<void>((ok, no) => {
		resolve = ok;
		reject = no;
	});
	finished.catch(() => {});
	let settled = false;
	let completed = 0;
	let controls: AnimationPlaybackControls;
	const cleanup = () => {
		active.get(el)?.delete(handle);
		if (!active.get(el)?.size) active.delete(el);
		ownedProperties.delete(handle);
	};
	const restore = () => {
		if (options.pseudoElement) return;
		for (const key of properties) el.style[key] = previous[key] || "";
	};
	const finish = () => {
		if (settled) return;
		settled = true;
		controls?.cancel();
		if (options.fill === "forwards" && !options.pseudoElement) {
			for (const key of properties) el.style[key] = String(keyframes[key].at(-1));
		} else {
			restore();
			cleanup();
		}
		resolve();
	};
	const handle: Playback = {
		finished,
		cancel() {
			if (settled) {
				if (active.get(el)?.has(handle)) {
					restore();
					cleanup();
				}
				return;
			}
			settled = true;
			controls?.cancel();
			restore();
			cleanup();
			reject(new Error("motion_cancelled"));
		},
		complete: finish,
	};
	const set = active.get(el) || new Set<Playback>();
	set.add(handle);
	active.set(el, set);
	ownedProperties.set(handle, new Set(properties.map(propertyKey)));
	controls = animateStyle(el, keyframes, {
		...(options.spring
			? {
					type: spring,
					...(options.spring === "search-icon"
						? tokens.motion.searchIconSpring
						: options.spring === "toggle"
							? tokens.motion.toggleSpring
							: options.spring === "expanded"
								? tokens.motion.expandedSpring
								: options.spring === "card"
									? tokens.motion.cardSpring
									: tokens.motion.spring),
				}
			: { duration: options.duration / 1000, ease }),
		delay: (options.delay || 0) / 1000,
		repeat: options.repeat || 0,
		pseudoElement: options.pseudoElement,
		...(frames.some((frame) => frame.offset !== undefined)
			? { times: frames.map((frame, index) => frame.offset ?? index / (frames.length - 1)) }
			: {}),
		// Mini completes each property separately, after committing that property's style.
		onComplete: () => {
			if (++completed === properties.length) finish();
		},
	} as any);
	if (!properties.length) finish();
	return handle;
}

/** Motion values retain measured input velocity when a gesture releases or reverses. */
type Travel = {
	x: ReturnType<typeof motionValue<number>>;
	y: ReturnType<typeof motionValue<number>>;
	target: string;
	playback?: Playback;
	onUpdate?: (point: { x: number; y: number }) => void;
};
const travel = new WeakMap<HTMLElement, Travel>();
const moving = new Set<HTMLElement>();

function clearTravel(el: HTMLElement) {
	const state = travel.get(el);
	if (!state) return;
	state.playback?.cancel();
	state.x.destroy();
	state.y.destroy();
	travel.delete(el);
	moving.delete(el);
}

export function cancelMotion(el: Element, subtree = false) {
	for (const [target, animations] of active) {
		if (target === el || (subtree && el.contains(target)) || !target.isConnected)
			for (const animation of [...animations]) animation.cancel();
	}
	for (const target of moving) {
		if (target === el || (subtree && el.contains(target)) || !target.isConnected)
			clearTravel(target);
	}
	if (el instanceof HTMLElement) clearTravel(el);
}

export function move(
	el: HTMLElement,
	destination: string,
	direct: boolean,
	options: {
		spring?: typeof tokens.motion.spring | typeof tokens.motion.pullRefresh.settle;
		velocity?: { x?: number; y?: number };
		onUpdate?: Travel["onUpdate"];
	} = {},
): Playback {
	let state = travel.get(el);
	if (!state) {
		const initial = getComputedStyle(el).translate.split(" ").map(Number.parseFloat);
		state = { x: motionValue(initial[0] || 0), y: motionValue(initial[1] || 0), target: "" };
		const current = state;
		const render = () => {
			el.style.translate =
				!current.x.get() && !current.y.get()
					? ""
					: `${current.x.get() ? `${current.x.get()}px` : "0"} ${current.y.get() ? `${current.y.get()}px` : "0"}`;
			current.onUpdate?.({ x: current.x.get(), y: current.y.get() });
		};
		state.x.on("change", render);
		state.y.on("change", render);
		travel.set(el, state);
	}
	state.onUpdate = options.onUpdate;
	const [x = 0, y = 0] = destination
		? destination.split(" ").map((value) => Number.parseFloat(value) || 0)
		: [0, 0];
	if (direct || (state.x.get() === x && state.y.get() === y)) {
		state.playback?.cancel();
		state.x.set(x);
		state.y.set(y);
		el.style.translate = !x && !y ? "" : destination;
		state.onUpdate?.({ x, y });
		if (direct) moving.add(el);
		else moving.delete(el);
		return { finished: Promise.resolve(), cancel() {}, complete() {} };
	}
	if (state.target === destination && state.playback) return state.playback;
	state.playback?.cancel();
	state.target = destination;
	const current = state;
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const finished = new Promise<void>((ok, no) => {
		resolve = ok;
		reject = no;
	});
	finished.catch(() => {});
	let settled = false;
	const controls: AnimationPlaybackControls[] = [];
	const cleanup = () => {
		if (current.playback !== handle) return;
		current.playback = undefined;
		current.target = "";
		moving.delete(el);
	};
	const finish = () => {
		if (settled) return;
		settled = true;
		for (const control of controls) control.stop();
		current.x.set(x);
		current.y.set(y);
		cleanup();
		resolve();
	};
	const handle: Playback = {
		finished,
		cancel() {
			if (settled) return;
			settled = true;
			for (const control of controls) control.stop();
			cleanup();
			reject(new Error("motion_cancelled"));
		},
		complete: finish,
	};
	current.playback = handle;
	moving.add(el);
	controls.push(
		animate(current.x, x, {
			type: "spring",
			...(options.spring || tokens.motion.spring),
			...(options.velocity?.x === undefined ? {} : { velocity: options.velocity.x }),
		}),
		animate(current.y, y, {
			type: "spring",
			...(options.spring || tokens.motion.spring),
			...(options.velocity?.y === undefined ? {} : { velocity: options.velocity.y }),
		}),
	);
	Promise.all(controls.map((control) => control.finished)).then(finish, () => handle.cancel());
	return handle;
}
