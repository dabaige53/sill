import type { CSSProperties } from "react";
import type { Card } from "../../../contracts/card.ts";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import { detailDate } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { cardTime, DetailSummary, metaLine } from "./card-blocks.tsx";
import { DetailText } from "./markdown.tsx";
import { publicationName, SourceMark } from "./source-mark.tsx";

/**
 * Content-first introduction: small artwork beside source and listening metadata, then a full-width
 * title, summary and read-only sections. No player, tabs or full screen.
 * Listening position is an externally authored record, never a local playback action.
 */
export function PodcastDetail({ card }: { card: Card }) {
	const position = Store.item(card.id).playbackPosition ?? 0;
	const program = card.sources?.[0]?.name || "";
	const hosts = (card.authors || []).map((author) => author.name).filter(Boolean);
	const byline = publicationName(card);
	const tags = Store.tags(card);
	// The program name opens its page, as the byline under the title once did.
	const source =
		card.url && byline ? (
			<a className="podcast-source" href={card.url} target="_blank" rel="noreferrer">
				{byline}
			</a>
		) : (
			byline
		);
	const facts = [
		[copy("web.media.program"), program],
		[copy("web.media.host"), hosts.join("、")],
		[copy("web.media.published"), detailDate(card.publishedAt)],
		[
			copy("web.media.duration"),
			card.duration !== undefined
				? `${Math.max(1, Math.round(card.duration / 60))}${copy("web.templates.40de54344d22")}`
				: "",
		],
	].filter(([, value]) => value);
	return (
		<div
			className="podcast-detail"
			style={
				{
					"--podcast-cover": `${tokens.apple.podcastCoverSize}px`,
					"--podcast-cover-sm": `${tokens.apple.podcastCoverSmall}px`,
					"--podcast-column": `${tokens.apple.podcastColumn}px`,
					"--podcast-title": `${tokens.apple.podcastTitleSize}px`,
				} as CSSProperties
			}
		>
			<header className="podcast-head">
				<div className="podcast-identity">
					{card.images?.[0] ? (
						<img
							className="podcast-cover"
							src={assetURL(card.images[0])}
							alt=""
							referrerPolicy="no-referrer"
						/>
					) : (
						<div className="podcast-cover is-placeholder" aria-hidden="true">
							<span>{program}</span>
							<b>{card.title}</b>
						</div>
					)}
					<div className="podcast-heading">
						<div className="preview-meta podcast-meta">
							<SourceMark card={card} />
							<span>{metaLine([source, cardTime(card)])}</span>
						</div>
						<p className="podcast-listening num">
							<Icon name="headphones" size={16} />
							{copy("web.media.listening")} <b>{duration(position)}</b> /{" "}
							{card.duration !== undefined
								? duration(card.duration)
								: copy("web.media.unknownDuration")}
						</p>
					</div>
				</div>
				<h1 id="modal-title">{card.title}</h1>
				{!!tags.length && (
					<div className="preview-tags">
						{tags.map((tag) => (
							<span className="chip soft" key={tag}>
								#{tag}
							</span>
						))}
					</div>
				)}
			</header>
			<DetailSummary card={card} />
			<div className="podcast-body">
				{card.body?.trim() && (
					<section className="podcast-intro">
						<h2>{copy("web.media.introduction")}</h2>
						<DetailText body={card.body} />
					</section>
				)}
				{!!card.chapters?.length && (
					<section className="podcast-section-rows">
						<h2>{copy("web.media.chapters")}</h2>
						<ol className="podcast-rows podcast-chapters">
							{card.chapters.map((chapter) => (
								<li key={chapter.start}>
									<time className="num">{duration(chapter.start)}</time>
									<span>{chapter.title}</span>
								</li>
							))}
						</ol>
					</section>
				)}
				{!!card.transcript?.length && (
					<section>
						<h2>
							{copy("web.media.transcript")}{" "}
							<span className="podcast-excerpt">{copy("web.media.excerpt")}</span>
						</h2>
						<div className="podcast-transcript">
							{card.transcript.slice(0, 5).map((line) => (
								<p key={line.start}>{line.text}</p>
							))}
						</div>
					</section>
				)}
				{!!facts.length && (
					<section className="podcast-section-rows">
						<h2>{copy("web.media.information")}</h2>
						<dl className="podcast-rows podcast-facts">
							{facts.map(([label, value]) => (
								<div key={label}>
									<dt>{label}</dt>
									<dd className="num">{value}</dd>
								</div>
							))}
						</dl>
					</section>
				)}
			</div>
		</div>
	);
}
