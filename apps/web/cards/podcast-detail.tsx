import type { Card } from "../../../contracts/card.ts";
import { duration } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { assetURL } from "../data/assets.ts";
import { detailDate } from "../data/card-source.ts";
import { Store } from "../data/store.ts";
import { DetailText } from "./markdown.tsx";
import { publicationName, SourceMark } from "./source-mark.tsx";

/** Listening position is an externally authored record, never a local playback action. */
export function PodcastDetail({ card }: { card: Card }) {
	const position = Store.item(card.id).playbackPosition ?? 0;
	return (
		<div className="podcast-detail is-podcast">
			{card.image && (
				<img
					className="podcast-cover"
					src={assetURL(card.image)}
					alt=""
					referrerPolicy="no-referrer"
				/>
			)}
			<header className="detail-header">
				<div className="preview-published">{detailDate(card.publishedAt)}</div>
				<h1 id="modal-title">{card.title}</h1>
				<div className="preview-meta">
					<SourceMark card={card} />
					<span>{publicationName(card)}</span>
				</div>
				{!!Store.tags(card).length && (
					<div className="preview-tags">
						{Store.tags(card).map((tag) => (
							<span className="chip soft" key={tag}>
								#{tag}
							</span>
						))}
					</div>
				)}
			</header>
			<p className="podcast-listening num">
				{copy("web.media.listening")} {duration(position)} /{" "}
				{card.duration !== undefined ? duration(card.duration) : copy("web.media.unknownDuration")}
			</p>
			{card.body?.trim() && (
				<section>
					<h2>{copy("web.media.introduction")}</h2>
					<DetailText body={card.body} />
				</section>
			)}
			{!!card.chapters?.length && (
				<section>
					<h2>{copy("web.media.chapters")}</h2>
					<ol className="podcast-chapters">
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
					<h2>{copy("web.media.transcriptExcerpt")}</h2>
					<div className="podcast-transcript">
						{card.transcript.slice(0, 5).map((line) => (
							<p key={line.start}>{line.text}</p>
						))}
					</div>
				</section>
			)}
			<dl className="podcast-facts">
				{publicationName(card) && (
					<div>
						<dt>{copy("web.media.program")}</dt>
						<dd>{publicationName(card)}</dd>
					</div>
				)}
				{card.publishedAt && (
					<div>
						<dt>{copy("web.media.published")}</dt>
						<dd>{detailDate(card.publishedAt)}</dd>
					</div>
				)}
				<div>
					<dt>{copy("web.media.duration")}</dt>
					<dd className="num">
						{card.duration !== undefined
							? duration(card.duration)
							: copy("web.media.unknownDuration")}
					</dd>
				</div>
			</dl>
		</div>
	);
}
