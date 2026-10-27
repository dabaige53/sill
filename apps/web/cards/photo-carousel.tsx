import { type AnimationPlaybackControls, animate, motionValue } from "motion";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../../../contracts/card.ts";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";

/** The project spring is a trial setting, not a parameter copied from Motion+. */
const snap = tokens.motion.photoSnapSpring;

/** Page snapping retains pointer velocity without re-rendering React on every frame. */
export function PhotoCarousel({
	card,
	index,
	onSelect,
}: {
	card: Card;
	index: number;
	onSelect?: (index: number) => void;
}) {
	const photos = card.photos?.length ? card.photos : [card.image];
	const viewport = useRef<HTMLDivElement>(null),
		track = useRef<HTMLDivElement>(null);
	const [position] = useState(() => motionValue(0));
	const animation = useRef<AnimationPlaybackControls | null>(null);
	const initial = useRef(index),
		current = useRef(index),
		mounted = useRef(false),
		releaseVelocity = useRef(0);
	current.current = index;
	const drag = useRef<{
		id: number;
		x: number;
		y: number;
		offset: number;
		active: boolean;
		base: number;
		lastOffset: number;
		lastTime: number;
		velocity: number;
	} | null>(null);
	const drawnPosition = useCallback(() => {
		const transform = track.current && getComputedStyle(track.current).transform;
		if (transform?.startsWith("matrix(")) return Number(transform.slice(7).split(",")[4]);
		if (transform?.startsWith("matrix3d(")) return Number(transform.slice(9).split(",")[12]);
		return position.get();
	}, [position]);
	const settle = useCallback(
		(instant = false, target = current.current, velocity = 0) => {
			const width = viewport.current?.clientWidth;
			if (!width || !track.current) return;
			const from = drawnPosition();
			animation.current?.stop();
			position.jump(from);
			const destination = -target * width;
			if (instant || document.documentElement.dataset.inputModality === "keyboard")
				position.jump(destination);
			else
				animation.current = animate(position, destination, { type: "spring", ...snap, velocity });
		},
		[position, drawnPosition],
	);
	useEffect(() => {
		const unsubscribe = position.on("change", (value) => {
			if (track.current) track.current.style.transform = `translateX(${value}px)`;
		});
		settle(true);
		const resize = new ResizeObserver(() => {
			drag.current = null;
			settle(true);
		});
		if (viewport.current) resize.observe(viewport.current);
		return () => {
			resize.disconnect();
			animation.current?.stop();
			unsubscribe();
		};
	}, [position, settle]);
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		const velocity = releaseVelocity.current;
		releaseVelocity.current = 0;
		settle(false, index, velocity);
	}, [index, settle]);
	const down = (event: PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || photos.length < 2 || !onSelect) return;
		document.documentElement.dataset.inputModality =
			event.pointerType === "touch" ? "touch" : "pointer";
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			offset: 0,
			active: false,
			base: 0,
			lastOffset: 0,
			lastTime: event.timeStamp,
			velocity: 0,
		};
	};
	const move = (event: PointerEvent<HTMLDivElement>) => {
		const state = drag.current,
			width = viewport.current?.clientWidth;
		if (!state || state.id !== event.pointerId || !width) return;
		const dx = event.clientX - state.x,
			dy = event.clientY - state.y;
		if (!state.active) {
			if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
				drag.current = null;
				return;
			}
			if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
			state.active = true;
			state.base = drawnPosition();
			animation.current?.stop();
			event.currentTarget.setPointerCapture(event.pointerId);
		}
		event.preventDefault();
		const elapsed = event.timeStamp - state.lastTime;
		if (elapsed > 0) state.velocity = ((dx - state.lastOffset) / elapsed) * 1000;
		state.offset = dx;
		state.lastOffset = dx;
		state.lastTime = event.timeStamp;
		const beyond = (index === 0 && dx > 0) || (index === photos.length - 1 && dx < 0);
		position.jump(state.base + dx * (beyond ? 0.2 : 1));
	};
	const release = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
		const state = drag.current;
		if (!state || state.id !== event.pointerId) return;
		drag.current = null;
		if (!state.active) return;
		const width = viewport.current?.clientWidth || 1;
		const velocity = cancelled || event.timeStamp - state.lastTime > 80 ? 0 : state.velocity;
		const intent = Math.abs(velocity) > 500 ? velocity : state.offset;
		const direction =
			!cancelled && (Math.abs(state.offset) > width * 0.25 || Math.abs(velocity) > 500)
				? intent < 0
					? 1
					: -1
				: 0;
		const next = Math.max(0, Math.min(photos.length - 1, index + direction));
		if (next !== index) {
			releaseVelocity.current = velocity;
			onSelect?.(next);
		} else settle(false, index, velocity);
	};
	return (
		<div
			ref={viewport}
			className="photo-carousel"
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={(event) => release(event)}
			onPointerCancel={(event) => release(event, true)}
			onLostPointerCapture={(event) => release(event, true)}
		>
			<div
				ref={track}
				className="photo-carousel-track"
				style={{ transform: `translateX(${-initial.current * 100}%)` }}
			>
				{photos.map((photo, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Authored photo sequences can contain repeated images.
					<div className="photo-carousel-page" key={`${i}:${photo}`} aria-hidden={i !== index}>
						<img
							src={assetURL(photo)}
							draggable={false}
							alt={`${card.title}${copy("web.photo.altIndexPrefix")}${i + 1}${copy("web.common.cardCountSuffix")}`}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
