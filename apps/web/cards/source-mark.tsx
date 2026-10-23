import marks from "../../../design-system/assets/source-marks/marks.json" with { type: "json" };
import { icon } from "../atoms/icons.ts";
import { Icon } from "../atoms/react-primitives.tsx";
import { CardTypes, SourceKinds } from "../data/cards.ts";

type Source = { name: string; kind: string };
type SourceCard = {
	type?: string;
	sources?: Source[];
	publisher?: { name: string };
	authors?: { name: string }[];
};

export function sourceBrand(source: Source): keyof typeof marks | undefined {
	const name = source.name.trim().toLowerCase();
	return (Object.keys(marks) as (keyof typeof marks)[]).find((key) => {
		const mark = marks[key];
		return (
			(mark.kinds as string[]).includes(source.kind.toLowerCase()) ||
			mark.names.some((alias) => {
				const label = alias.toLowerCase();
				return name === label || name.startsWith(`${label} · `);
			})
		);
	});
}

/** Acquisition source stays in the mark; publication identity stays in the text. */
export function publicationName(card: SourceCard): string {
	const names = [card.publisher?.name, ...(card.authors || []).map((author) => author.name)]
		.map((name) => name?.trim())
		.filter((name): name is string => !!name);
	return (
		[...new Set(names)].join(" · ") || (card.sources || []).map((source) => source.name).join(" · ")
	);
}

// @design source-marks
export function SourceMark({ card, size = 16 }: { card: SourceCard; size?: number }) {
	const sources = card.sources?.slice(0, 3) || [];
	const typeIcon = (CardTypes[card.type] || CardTypes.note).icon;
	const byType = ["task", "event", "reminder", "digest", "photo", "file"].includes(card.type);
	if (!sources.length || (card.type === "note" && sources[0].kind === "capture"))
		return <Icon name={typeIcon} size={size} />;
	return (
		<span className="source-marks" aria-hidden="true">
			{sources.map((source) => {
				const brand = sourceBrand(source);
				if (byType && !brand)
					return <Icon key={`${source.kind}-${source.name}`} name={typeIcon} size={size} />;
				return (
					<span className="source-mark" key={`${source.kind}-${source.name}`}>
						{brand ? (
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width={size}
								height={size}
								fill="currentColor"
							>
								<path d={marks[brand].path} />
							</svg>
						) : (
							<Icon name={SourceKinds[source.kind]?.icon || "link"} size={size} />
						)}
					</span>
				);
			})}
		</span>
	);
}

export function sourceMarkHtml(card: SourceCard, size = 16): string {
	const sources = card.sources?.slice(0, 3) || [];
	const typeIcon = (CardTypes[card.type] || CardTypes.note).icon;
	if (!sources.length || (card.type === "note" && sources[0].kind === "capture"))
		return icon(typeIcon, size);
	const byType = ["task", "event", "reminder", "digest", "photo", "file"].includes(card.type);
	return `<span class="source-marks" aria-hidden="true">${sources
		.map((source) => {
			const brand = sourceBrand(source);
			if (byType && !brand) return icon(typeIcon, size);
			const glyph = brand
				? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="${marks[brand].path}"/></svg>`
				: icon(SourceKinds[source.kind]?.icon || "link", size);
			return `<span class="source-mark">${glyph}</span>`;
		})
		.join("")}</span>`;
}
