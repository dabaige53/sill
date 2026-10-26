import { BookmarkIcon, LayersIcon } from "lucide-react";
import { catalog, describe, type Platform, t } from "./catalog.ts";
import { cn } from "./lib/utils.ts";
import { type Reviews, reviewKey, reviewStatus } from "./reviews.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "./ui/empty.tsx";
import { Field, FieldGroup, FieldLabel } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "./ui/native-select.tsx";

export type Filters = {
	query: string;
	feature: string;
	interaction: string;
	status: string;
	favorite: boolean;
};
export const defaultFilters: Filters = {
	query: "",
	feature: "all",
	interaction: "all",
	status: "all",
	favorite: false,
};
export function WorkbenchCatalog({
	selected,
	platform,
	reviews,
	filters,
	onFilter,
	onFavorite,
}: {
	selected: string;
	platform: Platform;
	reviews: Reviews;
	filters: Filters;
	onFilter: (value: Filters) => void;
	onFavorite: (id: string) => void;
}) {
	const visible = catalog.filter(
		(entry) =>
			(filters.feature === "all" || entry.feature === filters.feature) &&
			(filters.interaction === "all" || entry.interaction === filters.interaction) &&
			(filters.status === "all" ||
				(filters.status === "missingPreview"
					? entry.platforms[platform] !== "preview"
					: reviewStatus(reviews[reviewKey(entry.id, platform)]) === filters.status)) &&
			(!filters.favorite || reviews[entry.id]?.favorite) &&
			[
				entry.id,
				describe(entry, "title"),
				describe(entry, "location"),
				entry.implementation,
				entry.component,
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(filters.query.trim().toLocaleLowerCase()),
	);
	return (
		<nav className="workbench-catalog" aria-label={t("listPanel")}>
			<header className="catalog-header">
				<LayersIcon />
				<h2>{t("allAnimations")}</h2>
				<span>{visible.length}</span>
			</header>
			<div className="catalog-filters">
				<FieldGroup className="gap-3">
					<Field className="motion-search">
						<FieldLabel className="sr-only" htmlFor="motion-search">
							{t("search")}
						</FieldLabel>
						<Input
							id="motion-search"
							type="search"
							value={filters.query}
							placeholder={t("search")}
							onChange={(e) => onFilter({ ...filters, query: e.target.value })}
						/>
					</Field>
					<div className="grid grid-cols-2 gap-2">
						{(["feature", "interaction"] as const).map((key) => (
							<Field key={key}>
								<FieldLabel className="sr-only" htmlFor={`motion-${key}`}>
									{t(key)}
								</FieldLabel>
								<NativeSelect
									className="w-full"
									id={`motion-${key}`}
									value={filters[key]}
									onChange={(e) => onFilter({ ...filters, [key]: e.target.value })}
								>
									<NativeSelectOption value="all">{t(key)}</NativeSelectOption>
									{[...new Set(catalog.map((entry) => entry[key]))].map((value) => (
										<NativeSelectOption key={value} value={value}>
											{t(`${key}.${value}`)}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</Field>
						))}
					</div>
					<Field>
						<FieldLabel className="sr-only" htmlFor="motion-status">
							{t("status")}
						</FieldLabel>
						<NativeSelect
							className="w-full"
							id="motion-status"
							value={filters.status}
							onChange={(e) => onFilter({ ...filters, status: e.target.value })}
						>
							{["all", "unchecked", "checked", "issue"].map((value) => (
								<NativeSelectOption key={value} value={value}>
									{t(value === "all" ? "scopeAll" : value)}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</Field>
					<Field orientation="horizontal" className="motion-favorite">
						<Checkbox
							id="motion-favorites"
							checked={filters.favorite}
							onCheckedChange={(value) => onFilter({ ...filters, favorite: value === true })}
						/>
						<FieldLabel htmlFor="motion-favorites">{t("favoritesOnly")}</FieldLabel>
					</Field>
				</FieldGroup>
			</div>
			<div className="catalog-scroll">
				{visible.map((entry) => (
					<div
						key={entry.id}
						className={cn("catalog-item motion-example", selected === entry.id && "is-selected")}
					>
						<Button
							asChild
							variant={selected === entry.id ? "secondary" : "ghost"}
							className="catalog-link"
						>
							<a
								href={`#${entry.id}`}
								title={entry.id}
								aria-current={selected === entry.id ? "page" : undefined}
							>
								<span>{describe(entry, "title")}</span>
							</a>
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={t(reviews[entry.id]?.favorite ? "unfavorite" : "favorite")}
							aria-pressed={!!reviews[entry.id]?.favorite}
							onClick={() => onFavorite(entry.id)}
						>
							<BookmarkIcon
								data-icon="inline-start"
								fill={reviews[entry.id]?.favorite ? "currentColor" : "none"}
							/>
						</Button>
						{reviewStatus(reviews[reviewKey(entry.id, platform)]) !== "unchecked" && (
							<span className="catalog-status">
								{t(reviewStatus(reviews[reviewKey(entry.id, platform)]))}
							</span>
						)}
					</div>
				))}
				{!visible.length && (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{t("catalogEmpty")}</EmptyTitle>
						</EmptyHeader>
						<Button variant="outline" size="sm" onClick={() => onFilter(defaultFilters)}>
							{t("clearFilters")}
						</Button>
					</Empty>
				)}
			</div>
		</nav>
	);
}
