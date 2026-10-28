/*! Interaction adapted from https://github.com/xevrion/ui-lab.
MIT License

Copyright (c) 2026 Yash Bavadiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { type PointerEvent, useEffect, useRef } from "react";
import type { Card } from "../../../contracts/card.ts";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";

const timing = tokens.motion.photoCarousel;
type Drag = {
	id: number;
	x: number;
	start: number;
	samples: { x: number; time: number }[];
};

/** Native snapping owns touch and trackpad motion; mouse dragging follows ui-lab's release sampling. */
export function PhotoCarousel({
	card,
	index,
	onSelect,
}: {
	card: Card;
	index: number;
	onSelect?: (index: number) => void;
}) {
	const photos = card.images || [];
	const viewport = useRef<HTMLElement>(null);
	const current = useRef(index),
		reported = useRef(index),
		mounted = useRef(false);
	const count = useRef(photos.length),
		select = useRef(onSelect);
	current.current = index;
	count.current = photos.length;
	select.current = onSelect;
	const drag = useRef<Drag | null>(null);
	const suppressClick = useRef(false);
	const command = useRef<number | null>(null);
	const settle = useRef<((report?: boolean) => void) | null>(null);
	const nearest = (left: number) =>
		Math.max(
			0,
			Math.min(count.current - 1, Math.round(left / (viewport.current?.clientWidth || 1))),
		);
	const sync = () => {
		const el = viewport.current;
		if (!el || drag.current) return;
		if (command.current !== null) {
			if (Math.abs(el.scrollLeft - command.current * el.clientWidth) > 1) return;
			command.current = null;
		}
		const next = nearest(el.scrollLeft);
		if (next !== current.current) {
			reported.current = next;
			select.current?.(next);
		}
	};
	useEffect(() => {
		const el = viewport.current;
		if (!el) return;
		let width = el.clientWidth;
		el.scrollLeft = current.current * width;
		const resize = new ResizeObserver(() => {
			if (el.clientWidth === width) return;
			width = el.clientWidth;
			drag.current = null;
			settle.current?.();
			command.current = null;
			el.scrollTo({ left: current.current * width, behavior: "instant" });
		});
		resize.observe(el);
		return () => {
			resize.disconnect();
			settle.current?.(false);
		};
	}, []);
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		if (reported.current === index) return;
		reported.current = index;
		const el = viewport.current;
		if (!el) return;
		settle.current?.();
		command.current = index;
		el.scrollTo({
			left: index * el.clientWidth,
			behavior:
				document.documentElement.dataset.inputModality === "keyboard" ? "instant" : "smooth",
		});
	}, [index]);
	const down = (event: PointerEvent<HTMLElement>) => {
		settle.current?.(false);
		command.current = null;
		if (event.pointerType !== "mouse" || event.button !== 0 || photos.length < 2 || !onSelect)
			return;
		const el = event.currentTarget;
		el.style.scrollSnapType = "none";
		el.scrollTo({ left: el.scrollLeft, behavior: "instant" });
		el.setPointerCapture(event.pointerId);
		el.dataset.dragging = "";
		suppressClick.current = false;
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			start: el.scrollLeft,
			samples: [{ x: event.clientX, time: event.timeStamp }],
		};
	};
	const move = (event: PointerEvent<HTMLElement>) => {
		const state = drag.current;
		if (!state || state.id !== event.pointerId) return;
		const dx = event.clientX - state.x;
		if (Math.abs(dx) > timing.dragSlop) suppressClick.current = true;
		event.currentTarget.scrollLeft = state.start - dx;
		state.samples.push({ x: event.clientX, time: event.timeStamp });
		while (
			state.samples.length > 2 &&
			event.timeStamp - state.samples[0].time > timing.velocityWindow
		)
			state.samples.shift();
	};
	const release = (event: PointerEvent<HTMLElement>, cancelled = false) => {
		const state = drag.current;
		if (!state || state.id !== event.pointerId) return;
		drag.current = null;
		const el = event.currentTarget;
		delete el.dataset.dragging;
		if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
		const first = state.samples[0],
			last = state.samples[state.samples.length - 1];
		const velocity =
			!cancelled && event.timeStamp - last.time < timing.velocityWindow && last.time > first.time
				? -(last.x - first.x) / (last.time - first.time)
				: 0;
		const from = nearest(state.start);
		let next = cancelled ? from : nearest(el.scrollLeft + velocity * timing.coast);
		if (!cancelled && next === from && Math.abs(velocity) > timing.flickVelocity)
			next = Math.max(0, Math.min(photos.length - 1, from + Math.sign(velocity)));
		command.current = next;
		const restore = (report = true) => {
			window.clearTimeout(fallback);
			el.removeEventListener("scrollend", finish);
			el.style.scrollSnapType = "";
			settle.current = null;
			command.current = null;
			if (report) sync();
		};
		const finish = () => restore();
		const fallback = window.setTimeout(finish, timing.settleFallback);
		el.addEventListener("scrollend", finish);
		settle.current = restore;
		el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
	};
	return (
		<section
			ref={viewport}
			className="photo-carousel"
			aria-roledescription={copy("web.photo.carousel")}
			aria-label={card.title}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: The native horizontal scroller needs keyboard focus for navigation.
			tabIndex={0}
			onScroll={sync}
			onWheel={() => {
				settle.current?.(false);
				command.current = null;
			}}
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={(event) => release(event)}
			onPointerCancel={(event) => release(event, true)}
			onLostPointerCapture={(event) => release(event, true)}
			onClickCapture={(event) => {
				if (!suppressClick.current) return;
				suppressClick.current = false;
				event.preventDefault();
				event.stopPropagation();
			}}
			onDragStart={(event) => event.preventDefault()}
		>
			<div className="photo-carousel-track">
				{photos.map((photo, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Authored sequences can repeat images.
					<div className="photo-carousel-page" key={`${i}:${photo}`} aria-hidden={i !== index}>
						<img
							src={assetURL(photo)}
							draggable={false}
							alt={`${card.title}${copy("web.photo.altIndexPrefix")}${i + 1}${copy("web.common.cardCountSuffix")}`}
						/>
					</div>
				))}
			</div>
		</section>
	);
}
