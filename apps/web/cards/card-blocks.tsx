import { Fragment, type ReactNode } from "react";
import { markdownBlocks } from "../atoms/markdown.ts";
import { shortDay } from "../atoms/primitives.ts";
import { ProgressRing } from "../atoms/react-primitives.tsx";
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

export function DetailSummary({ card }: { card: Card }) {
	return card.summary?.trim() ? (
		<section className="detail-summary" aria-label={copy("web.card.summary")}>
			<span className="detail-summary-label">{copy("web.card.summary")}</span>
			<p>{card.summary}</p>
		</section>
	) : null;
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
