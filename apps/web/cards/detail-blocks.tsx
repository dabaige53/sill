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

export function WhyDetails({ card }: { card: Card }) {
	if (!card.why) return null;
	return (
		<section className="detail-section why-details">
			<h2>{copy("web.card.why")}</h2>
			<p>{card.why.reason}</p>
			{card.why.basis?.length ? (
				<ul>
					{card.why.basis.map((text) => (
						<li key={text}>{text}</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

export function FileList({
	files = [],
	label = copy("web.card.files"),
}: {
	files?: Card["files"];
	label?: string;
	attachment?: boolean;
}) {
	return files.length ? (
		<section className="detail-section">
			<h2>{label}</h2>
			<div className="detail-rows">
				{files.map((file) => {
					const content = (
						<>
							<span className="row-icon">
								<Icon
									name={/\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "image" : "file"}
									size={16}
								/>
							</span>
							<span>
								<b>{file.name}</b>
								<em>{fileDescription(file)}</em>
							</span>
							<small title={file.modifiedAt}>{detailDate(file.modifiedAt)}</small>
							{file.url && /^https?:\/\//i.test(file.url) && <Icon name="chevron" size={14} />}
						</>
					);
					return file.url && /^https?:\/\//i.test(file.url) ? (
						<a
							key={`${file.name}-${file.url || ""}`}
							className="detail-row"
							href={file.url}
							target="_blank"
							rel="noopener noreferrer"
						>
							{content}
						</a>
					) : (
						<div className="detail-row" key={`${file.name}-${file.url || ""}`}>
							{content}
						</div>
					);
				})}
			</div>
		</section>
	) : null;
}

export function TaskFacts({ card }: { card: Card }) {
	const rows = [
		card.due !== undefined ? ["clock", copy("web.card.due"), dateLabel(card.due)] : null,
		card.people?.length ? ["at", copy("web.card.people"), card.people.join("、")] : null,
		card.priority !== undefined ? ["flag", copy("web.card.priority"), String(card.priority)] : null,
	].filter(Boolean);
	return rows.length ? (
		<div className="detail-rows">
			{rows.map(([icon, label, value]) => (
				<div className={`detail-row ${icon === "clock" ? "task-due" : ""}`} key={label}>
					<span className="row-icon">
						<Icon name={icon} size={16} />
					</span>
					<span>{icon === "at" ? value : `${label} ${value}`}</span>
					{icon === "at" && (
						<small>
							{card.people.length}
							{copy("web.preview.peopleCountSuffix")}
						</small>
					)}
				</div>
			))}
		</div>
	) : null;
}
