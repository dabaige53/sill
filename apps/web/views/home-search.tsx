import { copy } from "../copy.ts";
import { hashOptions, searchStatuses, searchTypes } from "../interactions/panel-search.tsx";
import type { Filter } from "./app-types.ts";

/** One # option, flattened in list order for arrow keys and Enter. */
export type HomeHashOption = { extra: string; label: string; group: "status" | "tag" };

/** # options for the desktop top-bar search: the tab's own status is already a token. */
export function homeHashOptions(frag: string, filter: Filter, tabStatus: string): HomeHashOption[] {
	const { statuses, tags } = hashOptions(frag, [filter.mark, tabStatus], filter.tag);
	return [
		...statuses.map(([key, label]) => ({
			extra: `status:${key}`,
			label: copy(label),
			group: "status" as const,
		})),
		...tags.map((tag) => ({ extra: `tag:${tag}`, label: `#${tag}`, group: "tag" as const })),
	];
}

/** # conditions after the tab token: accent, removed by a click or by Delete from the end. */
export function HomeSearchMarks({ filter }: { filter: Filter }) {
	const status = searchStatuses.find(([key]) => key === filter.mark);
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

/** Typing # lists statuses, then existing tags; it floats under the field and pushes nothing. */
export function HomeHashList({ options, active }: { options: HomeHashOption[]; active: number }) {
	if (!options.length) return null;
	const group = (name: "status" | "tag", label: string) => {
		const items = options.filter((option) => option.group === name);
		if (!items.length) return null;
		return (
			<>
				<div className="search-hash-label">{label}</div>
				{items.map((option) => {
					const index = options.indexOf(option);
					return (
						<button
							key={option.extra}
							type="button"
							role="option"
							aria-selected={index === active}
							className={`search-hash-option${index === active ? " is-active" : ""}`}
							data-action="home-hash"
							data-extra={option.extra}
						>
							{option.label}
						</button>
					);
				})}
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
