import type { Card } from "../../../contracts/card.ts";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { cardSource } from "../data/card-source.ts";
import {
	cardKind,
	hashOptions,
	SearchMatch,
	searchStatuses,
	searchTypes,
} from "../interactions/panel-search.tsx";
import type { Filter } from "./app-types.ts";

/** One suggestion, flattened in list order for arrow keys and Enter. */
export type HomeHashOption = {
	extra: string;
	label: string;
	group: "card" | "status" | "tag";
	kind?: { icon: string; label: string };
};

/** # options for the desktop top-bar search: the tab's own status is already a token. */
export function homeHashOptions(frag: string, tabStatus: string): HomeHashOption[] {
	const { statuses, tags } = hashOptions(frag, [tabStatus], "");
	return [
		...statuses.map(([key, label]) => ({
			extra: `status:${key}`,
			label: copy(label),
			group: "status" as const,
		})),
		...tags.map((tag) => ({ extra: `tag:${tag}`, label: `#${tag}`, group: "tag" as const })),
	];
}

/** Without #, the field suggests cards: the ones it would find, title first, its kind after. */
export function homeCardOptions(cards: Card[]): HomeHashOption[] {
	return cards.slice(0, tokens.motion.searchChoice.suggestions).map((card) => ({
		extra: `card:${card.id}`,
		label: card.title || cardSource(card) || "",
		group: "card" as const,
		kind: cardKind(card),
	}));
}

/** The # condition in effect is the one marked as chosen in the list. */
export function selectedHomeChoice(filter: Filter) {
	return filter.tag ? `tag:${filter.tag}` : filter.mark !== "all" ? `status:${filter.mark}` : "";
}

/** # conditions after the tab token: accent, removed by a click or by Delete from the end. */
export function HomeSearchMarks({ filter }: { filter: Filter }) {
	const status = searchStatuses.find(([key]) => key === filter.mark && key !== filter.status);
	const marks = [
		status && { key: "mark", label: `#${copy(status[1])}` },
		filter.tag && { key: "tag", label: `#${filter.tag}` },
	].filter(Boolean) as { key: string; label: string }[];
	return (
		<>
			{marks.map((mark) => (
				<button
					key={mark.key}
					type="button"
					className="home-search-token is-hash"
					data-action="home-untoken"
					data-extra={mark.key}
					aria-label={`${copy("web.search.removeCondition")} ${mark.label}`}
				>
					{mark.label}
				</button>
			))}
		</>
	);
}

/**
 * The suggestion list floats under the field and pushes nothing (Combobox): cards while typing,
 * statuses and tags after #. Rows carry text only; a chosen # condition shows a check.
 */
export function HomeHashList({
	options,
	active,
	selected = "",
	needle = "",
	onHighlight,
}: {
	options: HomeHashOption[];
	active: number;
	selected?: string;
	needle?: string;
	onHighlight?: (index: number) => void;
}) {
	const row = (option: HomeHashOption) => {
		const index = options.indexOf(option);
		const condition = option.group !== "card";
		return (
			<button
				key={option.extra}
				type="button"
				id={`home-option-${index}`}
				role="option"
				onPointerMove={(event) => {
					if (event.pointerType !== "touch" && index !== active) onHighlight?.(index);
				}}
				aria-selected={option.extra === selected}
				tabIndex={-1}
				className={`search-hash-option${index === active ? " is-active" : ""}`}
				data-action="home-hash"
				data-extra={option.extra}
			>
				<span className="home-option-label">
					<SearchMatch text={option.label} needle={needle} />
				</span>
				{option.kind ? (
					<span className="home-option-meta">
						<Icon name={option.kind.icon} size={14} />
						<span>{option.kind.label}</span>
					</span>
				) : null}
				{condition ? (
					<span className="home-option-check" aria-hidden="true" hidden={option.extra !== selected}>
						<Icon name="check" size={16} />
					</span>
				) : null}
			</button>
		);
	};
	const group = (name: HomeHashOption["group"], label: string) => {
		const items = options.filter((option) => option.group === name);
		if (!items.length) return null;
		return (
			<>
				<div className="search-hash-label">{label}</div>
				{items.map(row)}
			</>
		);
	};
	return (
		<div
			className="search-hash home-hash"
			id="home-hash"
			role="listbox"
			aria-label={copy("web.search.hashList")}
		>
			<span className="home-hash-highlight" aria-hidden="true" />
			<span className="sr-only" role="status" aria-live="polite">
				{options.length
					? `${options.length}${copy("web.search.suggestionCountSuffix")}`
					: copy("web.search.noSuggestions")}
			</span>
			{!options.length && (
				<div className="home-search-empty">
					{needle
						? `${copy("web.search.noResultsPrefix")}${needle}」`
						: copy("web.search.noSuggestions")}
				</div>
			)}
			{options.filter((option) => option.group === "card").map(row)}
			{group("status", copy("web.search.hashStatus"))}
			{group("tag", copy("web.search.hashTag"))}
		</div>
	);
}

/** Type chips under the top bar while there is text; types without results stay out. */
export function HomeKinds({ kinds, active }: { kinds: Set<string>; active: string }) {
	const types = [
		["all", copy("web.all")],
		...searchTypes
			.filter(([key]) => kinds.has(key) || key === active)
			.map(([key, label]) => [key, copy(label)]),
	];
	return (
		<fieldset className="search-filter-items" aria-label={copy("web.search.filters.type")}>
			{types.map(([key, label]) => (
				<button
					key={key}
					type="button"
					className={`chip ${active === key ? "active" : ""}`}
					data-action="home-kind"
					data-extra={key}
					aria-pressed={active === key}
				>
					{label}
				</button>
			))}
		</fieldset>
	);
}
