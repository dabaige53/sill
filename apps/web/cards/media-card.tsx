import { contentDay } from "../data/card-source.ts";
import { duration } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { type BlockProps, Cover, Head, Summary, sourceLine, Title } from "./card-blocks.tsx";
export function Media({ card: c, ctx }: BlockProps) {
	const progress = c.duration > 0 ? Math.min(1, (ctx.state.playbackPosition || 0) / c.duration) : 0;
	const remaining =
		c.duration === undefined
			? "—"
			: copy("web.media.remaining").replace(
					"{minutes}",
					String(Math.ceil(Math.max(0, c.duration - (ctx.state.playbackPosition || 0)) / 60)),
				);
	const played = (
		<progress
			className="media-card-progress"
			max={1}
			value={progress}
			aria-label={copy("web.media.position")}
		/>
	);
	if (c.media === "podcast") {
		return (
			<div className="card-body">
				<Head
					card={c}
					text={sourceLine(c, contentDay(c.publishedAt))}
					right={<span className="num">{remaining}</span>}
				/>
				<Title card={c} ctx={ctx} />
				<Summary card={c} short />
				<div className="mini-player">
					<span className="mini-play-mark" aria-hidden="true">
						<Icon name="play" size={12} />
					</span>
					{played}
					<span className="num">{c.duration === undefined ? "—" : duration(c.duration)}</span>
				</div>
			</div>
		);
	}
	return (
		<>
			{c.image && (
				<Cover card={c}>
					<span className="media-play-mark" aria-hidden="true">
						<Icon name="play" size={22} />
					</span>
					{played}
					{
						<span className="media-length num">
							{c.duration === undefined ? "—" : duration(c.duration)}
						</span>
					}
				</Cover>
			)}
			<div className="card-body">
				<Head
					card={c}
					text={sourceLine(c, contentDay(c.publishedAt))}
					right={<span className="num">{remaining}</span>}
				/>
				<Title card={c} ctx={ctx} />
			</div>
		</>
	);
}
