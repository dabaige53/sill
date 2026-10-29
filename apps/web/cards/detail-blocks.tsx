import type { Card } from "../../../contracts/card.ts";
import { dateLabel } from "../atoms/primitives.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { detailDate, fileDescription } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";

export function RelatedCards({ card }: { card: Card }) {
	const related = (card.related || []).map((id) => Store.card(id)).filter(Boolean);
	if (!related.length) return null;
	return (
		<section className="detail-section">
			<h2>{copy(card.type === "digest" ? "web.card.digestRelated" : "web.card.related")}</h2>
			<div className="detail-related">
				{related.map((item) => (
					<button
						key={item.id}
						type="button"
						className="detail-row"
						data-action="card-open"
						data-id={item.id}
					>
						<span className="row-icon">
							<Icon name={(CardTypes[item.type] || CardTypes.note).icon} size={16} />
						</span>
						<span>{item.title}</span>
						<small>{(CardTypes[item.type] || CardTypes.note).label}</small>
						<Icon name="chevron" size={14} />
					</button>
				))}
			</div>
		</section>
	);
}

/** Files as attachment blocks: type icon, name, then size and date at the end of one line. Cards show
 *  them inert inside the card's own button; the detail links each file that has a web address. */
export function FileRows({
	files = [],
	limit = Infinity,
	links = false,
}: {
	files?: Card["files"];
	limit?: number;
	links?: boolean;
}) {
	return (
		<div className="file-rows">
			{files.slice(0, limit).map((file, i) => {
				const url = links && file.url && /^https?:\/\//i.test(file.url) ? file.url : undefined;
				const content = (
					<>
						<Icon name={/\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "image" : "file"} size={18} />
						<b>{file.name}</b>
						<em>
							{[fileDescription(file), detailDate(file.modifiedAt)].filter(Boolean).join(" · ")}
						</em>
						{url && <Icon name="chevron" size={14} />}
					</>
				);
				return url ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: File names may repeat; these rows have no component state.
					<a key={i} className="file-row" href={url} target="_blank" rel="noopener noreferrer">
						{content}
					</a>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: File names may repeat; these rows have no component state.
					<span className="file-row" key={i}>
						{content}
					</span>
				);
			})}
		</div>
	);
}

export function FileList({ files = [] }: { files?: Card["files"] }) {
	return files.length ? (
		<section className="detail-section">
			<h2>{copy("web.card.files")}</h2>
			<FileRows files={files} links />
		</section>
	) : null;
}

export function TaskFacts({ card }: { card: Card }) {
	const rows = [
		card.due !== undefined ? ["clock", copy("web.card.due"), dateLabel(card.due)] : null,
		card.priority !== undefined ? ["flag", copy("web.card.priority"), String(card.priority)] : null,
	].filter(Boolean);
	return rows.length ? (
		<div className="detail-rows">
			{rows.map(([icon, label, value]) => (
				<div className={`detail-row ${icon === "clock" ? "task-due" : ""}`} key={label}>
					<span className="row-icon">
						<Icon name={icon} size={16} />
					</span>
					<span>{`${label} ${value}`}</span>
				</div>
			))}
		</div>
	) : null;
}
