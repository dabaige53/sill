import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { markdownBlocks } from "../atoms/markdown.ts";
import { shortDay } from "../atoms/primitives.ts";
import { Icon, ProgressRing } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import {
	cardCover,
	cardDateLabel,
	cardDateSource,
	cardReadingTime,
	cardSource,
	cardSummaryText,
} from "../data/card-source.ts";
import { AssetTones, CardTypes } from "../data/cards.ts";
import { MotionEngine } from "../interactions/motion.ts";

import { publicationName, SourceMark } from "./source-mark.tsx";

export type Card = Record<string, any>;
export interface CardViewOptions {
	state?: Record<string, any>;
	passive?: boolean;
	compact?: boolean;
	now?: number;
	taskPreviewOrder?: string[];
}
export interface Context {
	state: Record<string, any>;
	tasks: Card[];
	taskPreviewOrder: string[];
	passive: boolean;
	now: number;
}
export interface BlockProps {
	card: Card;
	ctx: Context;
}
export const SourceIcon = SourceMark;
/** The card's date. The time it entered Sill carries no label; a dotted underline sets it apart. */
export function cardTime(c: Card): ReactNode {
	const label = cardDateLabel(c);
	if (!label) return null;
	const { date, added } = cardDateSource(c);
	return (
		<time
			className={added ? "card-time is-added" : "card-time"}
			dateTime={date?.datetime}
			title={date?.text}
		>
			{label}
		</time>
	);
}
/** Source-line parts joined by the shared separator; empty parts drop out. */
export function metaLine(parts: ReactNode[]): ReactNode {
	return parts
		.filter((part) => part !== null && part !== undefined && part !== false && part !== "")
		.map((part, i) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: The parts are a fixed, ordered line.
			<Fragment key={i}>
				{i ? " · " : null}
				{part}
			</Fragment>
		));
}
export function sourceLine(c: Card, date: Date | null = null) {
	return metaLine([
		(["article", "media", "note", "suggestion"].includes(c.type)
			? publicationName(c as any)
			: cardSource(c)) || (CardTypes[c.type] || CardTypes.note).label,
		cardTime(c) || (date ? shortDay(date.getTime()) : ""),
		cardReadingTime(c),
	]);
}
export function Head({ card, text, right }: { card: Card; text: ReactNode; right?: ReactNode }) {
	return (
		<div className="card-head">
			<SourceIcon card={card} />
			<span className="card-src">{text}</span>
			{right && <span className="card-head-right">{right}</span>}
		</div>
	);
}
export function Progress({ card: c, ctx }: BlockProps) {
	const s = ctx.state;
	const progress =
		c.type === "media"
			? c.duration > 0
				? Math.min(1, (s.playbackPosition || 0) / c.duration)
				: 0
			: s.progress;
	return (CardTypes[c.type] || CardTypes.note).readable && !s.read && progress > 0 ? (
		<span className="card-progress num">
			<ProgressRing progress={progress} size={14} />
			{Math.round(progress * 100)}%
		</span>
	) : null;
}
export function Title({ card: c, ctx, className = "" }: BlockProps & { className?: string }) {
	return (
		<h2 className={`card-title ${className}`}>
			{ctx.passive ? (
				<span className="card-title-button" data-shared="title">
					{c.title}
				</span>
			) : (
				<button
					type="button"
					data-action="card-open"
					data-id={c.id}
					className="card-title-button"
					data-shared="title"
				>
					{c.title}
				</button>
			)}
		</h2>
	);
}
// @design card-summary
export function Summary({ card: c }: { card: Card }) {
	const summary = c.summary || markdownBlocks(c.body || "")[0] || "";
	return summary ? <p className="card-summary">{cardSummaryText(summary)}</p> : null;
}

const summaryTiming = tokens.motion.summaryLength;
const quietMotion = () =>
	document.documentElement.dataset.inputModality === "keyboard" ||
	matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The detail summary: short by default. When the card has a long summary, the Sill mark at the
 * top left switches between the two, with a brief writing pause; the chevron folds the block.
 */
// @design detail-summary
export function DetailSummary({ card }: { card: Card }) {
	const points: string[] = (card.longSummary || []).filter((point: string) => point?.trim());
	const [long, setLong] = useState(false);
	const [loading, setLoading] = useState<boolean | null>(null);
	const [open, setOpen] = useState(true);
	const timer = useRef(0);
	const root = useRef<HTMLElement>(null);
	const switched = useRef(false);
	const shown = useRef(open);
	useEffect(() => () => clearTimeout(timer.current), []);
	// While the other length is written, the bar in the mark writes and the placeholders breathe.
	useEffect(() => {
		const section = root.current;
		if (!section || loading === null) return;
		const bar = section.querySelector(".sill-ai-bar") as HTMLElement | null;
		const writing = MotionEngine.animate(
			bar ?? undefined,
			[{ transform: "scaleX(1)" }, { transform: "scaleX(0.3)" }, { transform: "scaleX(1)" }],
			{ duration: 650, easing: "cubic-bezier(0.45, 0, 0.55, 1)", repeat: Infinity },
		);
		const bars = [...section.querySelectorAll<HTMLElement>(".summary-skeleton > span")];
		for (const placeholder of bars) MotionEngine.breathe(placeholder);
		return () => {
			writing?.cancel();
			for (const placeholder of bars) MotionEngine.loading(placeholder, false);
		};
	}, [loading]);
	// The written length settles in once; opening the detail shows the summary as it is.
	useEffect(() => {
		if (!switched.current || loading !== null) return;
		switched.current = false;
		const text = root.current?.querySelector<HTMLElement>(".summary-points, .detail-summary > p");
		MotionEngine.animate(
			text ?? undefined,
			[
				{ opacity: 0, transform: "translateY(4px)" },
				{ opacity: 1, transform: "none" },
			],
			{ duration: summaryTiming.reveal, easing: summaryTiming.revealEase },
		);
	}, [loading]);
	useEffect(() => {
		if (shown.current === open) return;
		shown.current = open;
		if (quietMotion()) return;
		const icon = root.current?.querySelector<HTMLElement>(".summary-fold > .icon");
		MotionEngine.animate(
			icon ?? undefined,
			[
				{ transform: `rotate(${open ? 90 : -90}deg)` },
				{ transform: `rotate(${open ? -90 : 90}deg)` },
			],
			{ duration: 260, easing: summaryTiming.revealEase },
		);
	}, [open]);
	if (!card.summary?.trim()) return null;
	const target = loading ?? long;
	const toggle = () => {
		clearTimeout(timer.current);
		const next = !target;
		setOpen(true);
		if (next === long || quietMotion()) {
			setLoading(null);
			setLong(next);
			return;
		}
		setLoading(next);
		switched.current = true;
		timer.current = window.setTimeout(() => {
			setLong(next);
			setLoading(null);
		}, summaryTiming.loading);
	};
	const lengthLabel = copy(target ? "web.card.summaryShowShort" : "web.card.summaryShowLong");
	const skeleton = loading ? points.map((point) => point.length) : [100, 58];
	return (
		<section
			ref={root}
			className={`detail-summary${target ? " is-long" : ""}${loading === null ? "" : " is-loading"}`}
			aria-label={copy("web.card.summary")}
			aria-busy={loading !== null}
		>
			<div className="detail-summary-head">
				{!!points.length && (
					<button
						type="button"
						className="summary-length"
						aria-pressed={target}
						aria-label={lengthLabel}
						title={lengthLabel}
						onClick={toggle}
					>
						<Icon name="sill-ai" size={20} />
					</button>
				)}
				<span className="detail-summary-label">{copy("web.card.summary")}</span>
				<button
					type="button"
					className="summary-fold"
					aria-expanded={open}
					aria-label={copy(open ? "web.card.summaryFold" : "web.card.summaryUnfold")}
					onClick={() => setOpen(!open)}
				>
					<Icon name="chevron" size={16} />
				</button>
			</div>
			{open &&
				(loading !== null ? (
					<div className="summary-skeleton" aria-hidden="true">
						{skeleton.map((size, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: Placeholder bars are fixed and stateless.
								key={i}
								className={loading ? "is-point" : undefined}
								style={{ width: `${loading ? Math.min(96, 30 + size) : size}%` }}
							/>
						))}
					</div>
				) : long ? (
					<ul key="long" className="summary-points">
						{points.map((point, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Points may repeat; these list items have no component state.
							<li key={i}>{point}</li>
						))}
					</ul>
				) : (
					<p key="short">{card.summary}</p>
				))}
		</section>
	);
}
export function Cover({ card: c, children }: { card: Card; children?: ReactNode }) {
	const image = cardCover(c);
	return (
		<div className="card-cover" style={{ background: AssetTones[image] || "var(--surface)" }}>
			{image && (
				<img
					className="card-image"
					data-shared="image"
					src={assetURL(image)}
					alt=""
					draggable={false}
					loading="lazy"
					decoding="async"
				/>
			)}
			{children}
		</div>
	);
}
