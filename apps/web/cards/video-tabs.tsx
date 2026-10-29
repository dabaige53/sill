import { type AnimationPlaybackControls, animate, motionValue } from "motion";
import { useLayoutEffect, useRef } from "react";
import foundation from "../../../design-system/tokens/foundation.json" with { type: "json" };
import { copy } from "../copy.ts";

// Adapted from ui-lab sliding-tabs, Copyright (c) 2026 Yash Bavadiya, MIT.
// Full license: docs/adr/0082-web-ui-lab-motion.md.
export const videoTabNames = ["transcript", "chapters", "summary"] as const;
export type VideoTab = (typeof videoTabNames)[number];
const timing = foundation.motion.videoTabs;

export function VideoTabs({
	id,
	value,
	onChange,
}: {
	id: string;
	value: VideoTab;
	onChange: (tab: VideoTab) => void;
}) {
	const list = useRef<HTMLDivElement>(null);
	const line = useRef<HTMLSpanElement>(null);
	const edges = useRef({
		left: motionValue(0),
		right: motionValue(0),
		ready: false,
		targetLeft: 0,
		targetRight: 0,
		runs: [] as AnimationPlaybackControls[],
	});
	const hover = useRef<HTMLSpanElement>(null);
	const hovering = useRef(false);
	const hoverRun = useRef<AnimationPlaybackControls | null>(null);
	const fit = useRef<(immediate: boolean) => void>(() => {});
	const index = videoTabNames.indexOf(value);

	useLayoutEffect(() => {
		const root = list.current;
		const indicator = line.current;
		if (!root || !indicator) return;
		const state = edges.current;
		const paint = () => {
			indicator.style.clipPath = `inset(0 calc(100% - ${state.right.get()}px) 0 ${state.left.get()}px round 1px)`;
		};
		const offLeft = state.left.on("change", paint);
		const offRight = state.right.on("change", paint);
		fit.current = (immediate: boolean) => {
			const selected = root.querySelector<HTMLElement>('[aria-selected="true"]');
			if (!selected) return;
			const left = selected.offsetLeft;
			const right = left + selected.offsetWidth;
			if (immediate && state.ready && left === state.targetLeft && right === state.targetRight)
				return;
			state.targetLeft = left;
			state.targetRight = right;
			state.runs.forEach((run) => {
				run.stop();
			});
			if (
				immediate ||
				!state.ready ||
				document.documentElement.dataset.inputModality === "keyboard"
			) {
				state.left.jump(left);
				state.right.jump(right);
				paint();
			} else {
				const rightward = right > state.right.get();
				state.runs = [
					animate(state.left, left, { type: "spring", ...(rightward ? timing.tail : timing.lead) }),
					animate(state.right, right, {
						type: "spring",
						...(rightward ? timing.lead : timing.tail),
					}),
				];
			}
			state.ready = true;
			root.dataset.ready = "true";
		};
		let firstObservation = true;
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(() => {
						if (firstObservation) firstObservation = false;
						else fit.current(true);
					});
		observer?.observe(root);
		return () => {
			observer?.disconnect();
			offLeft();
			offRight();
			state.runs.forEach((run) => {
				run.stop();
			});
		};
	}, []);

	useLayoutEffect(() => {
		if (!list.current?.querySelector(`[data-tab="${value}"]`)) return;
		fit.current(false);
	}, [value]);

	return (
		<div
			ref={list}
			className="media-tabs"
			role="tablist"
			aria-label={copy("web.media.youtubePlayer")}
			onPointerLeave={() => {
				hovering.current = false;
				if (hover.current) animate(hover.current, { opacity: 0 }, { duration: 0.1 });
			}}
			onKeyDown={(event) => {
				const target = (
					{
						ArrowRight: index + 1,
						ArrowLeft: index - 1,
						Home: 0,
						End: videoTabNames.length - 1,
					} as Record<string, number>
				)[event.key];
				if (target === undefined) return;
				event.preventDefault();
				const next = videoTabNames[(target + videoTabNames.length) % videoTabNames.length];
				onChange(next);
				list.current
					?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
					[(target + videoTabNames.length) % videoTabNames.length]?.focus();
			}}
		>
			{videoTabNames.map((name) => (
				<button
					key={name}
					type="button"
					role="tab"
					data-tab={name}
					id={`${id}-${name}`}
					aria-selected={value === name}
					aria-controls={`${id}-panel-${name}`}
					tabIndex={value === name ? 0 : -1}
					onClick={() => onChange(name)}
					onPointerEnter={(event) => {
						const pill = hover.current;
						if (event.pointerType === "touch" || !pill) return;
						const button = event.currentTarget;
						pill.style.width = `${button.offsetWidth}px`;
						const target = `translateX(${button.offsetLeft}px)`;
						hoverRun.current?.stop();
						if (!hovering.current) {
							pill.style.transform = target;
							animate(pill, { opacity: 1 }, { duration: 0.15 });
						} else
							hoverRun.current = animate(
								pill,
								{ transform: target },
								{ type: "spring", ...timing.hover },
							);
						hovering.current = true;
					}}
				>
					<span className="video-tab-label">
						{copy(
							name === "chapters"
								? "web.media.chapters"
								: name === "transcript"
									? "web.media.transcript"
									: "web.media.summary",
						)}
					</span>
				</button>
			))}
			<span ref={hover} className="video-tab-hover" aria-hidden="true" />
			<span ref={line} className="video-tab-indicator" aria-hidden="true" />
		</div>
	);
}
