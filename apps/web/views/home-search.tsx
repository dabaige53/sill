import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { hashOptions, searchStatuses, searchTypes } from "../interactions/panel-search.tsx";
import type { Filter } from "./app-types.ts";

/** One # option, flattened in list order for arrow keys and Enter. */
export type HomeHashOption = { extra: string; label: string; group: "status" | "tag" | "history" };

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
					<span className="home-condition-icon" aria-hidden="true">
						<Icon name={mark.key === "tag" ? "tag" : "filter"} size={12} />
					</span>
					<span>{mark.label}</span>
				</button>
			))}
		</>
	);
}

/** Typing # lists statuses, then existing tags; it floats under the field and pushes nothing. */
export function HomeHashList({
	options,
	active,
	onHighlight,
}: {
	options: HomeHashOption[];
	active: number;
	onHighlight?: (index: number) => void;
}) {
	if (!options.length) return null;
	const group = (name: HomeHashOption["group"], label: string) => {
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
							id={`home-option-${index}`}
							role="option"
							onPointerMove={(event) => {
								if (event.pointerType !== "touch" && index !== active) onHighlight?.(index);
							}}
							aria-selected={index === active}
							className={`search-hash-option${index === active ? " is-active" : ""}`}
							data-action="home-hash"
							data-extra={option.extra}
						>
							<span className="home-option-icon" aria-hidden="true">
								<Icon
									name={
										option.group === "history" ? "clock" : option.group === "tag" ? "tag" : "filter"
									}
									size={16}
								/>
							</span>
							<span className="home-option-label">{option.label}</span>
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
			<span className="home-hash-highlight" aria-hidden="true" />
			{group("history", copy("web.search.history"))}
			{group("status", copy("web.search.hashStatus"))}
			{group(
				"tag",
				copy(
					options.some((option) => option.group === "status")
						? "web.search.hashTag"
						: "web.search.recommendedTags",
				),
			)}
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
