import React from "react";
import type { Card } from "../../../contracts/card.ts";
import { SelectionBar } from "../atoms/selection.tsx";
import { CardView } from "../cards/components.tsx";
import { copy } from "../copy.ts";
import { Assets } from "../data/assets.ts";
import { cardSource } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import { type PanelRenderers, type SearchApp } from "./panel-contract.ts";
import { button, icon, keyed } from "./panel-primitives.tsx";

const searchTypes = [
	["article", "web.search.type.article", "architecture"],
	["mail", "web.search.type.mail", "coast"],
	["note", "web.note", "botanical"],
	["task", "web.task", "mountain"],
	["event", "web.event", "coast"],
	["media", "web.media", "mountain"],
] as const;
const searchStatuses = [
	["unread", "web.unread"],
	["saved", "web.bookmark"],
	["later", "web.later"],
] as const;

export const panelSearch = {
	editor(
		this: PanelRenderers,
		app?: Pick<AppController, "editTags"> & { cloudSavedAccount?: boolean },
		id?: string,
	) {
		const c = Store.card(id),
			s = Store.item(id),
			current = [...app.editTags];
		const suggest = [
			...new Set<string>([
				...(c.tags || []),
				copy("web.cards.bc62d1b6b936"),
				copy("web.cards.ce9b12499c47"),
				copy("web.cards.0e65f5e407c4"),
				copy("web.cards.56c255e19858"),
				"AI",
				copy("web.cards.15d208d1b4c9"),
			]),
		]
			.filter((t) => !app.editTags.has(t))
			.slice(0, 6);
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.editor.closeTagsAndNote"))}
					<div className={"panel-content"}>
						<div className={"panel-sub"} id={"modal-title"}>
							{c.title}
						</div>
						{"\n   "}
						<div className={"tag-editor"} id={"editor-tags"}>
							{keyed(
								current.map((t) => (
									<>
										<span className={"tag-pill"}>
											{t}
											<button
												type={"button"}
												data-action={"editor-tag"}
												data-extra={t}
												aria-label={"" + copy("web.editor.removeTagPrefix") + "" + t + ""}
											>
												{icon("x", 12)}
											</button>
										</span>
									</>
								)),
							)}
							<input
								id={"tag-new"}
								aria-label={copy("web.editor.newTagLabel")}
								placeholder={copy("web.editor.addTagPlaceholder")}
								maxLength={30}
							/>
						</div>
						{"\n   "}
						{keyed(
							suggest.length ? (
								<>
									<div className={"chip-suggest"}>
										{keyed(
											suggest.map((t) => (
												<>
													<button
														type={"button"}
														className={"chip soft"}
														data-action={"editor-tag"}
														data-extra={t}
													>
														{t}
													</button>
												</>
											)),
										)}
									</div>
								</>
							) : (
								""
							),
						)}
						{"\n   "}
						<label className={"sr-only"} htmlFor={"note-editor"}>
							{copy("web.editor.noteLabel")}
						</label>
						<textarea
							className={"editor-note"}
							id={"note-editor"}
							maxLength={4000}
							placeholder={copy("web.editor.notePlaceholder")}
							defaultValue={s.note}
						/>
						{"\n   "}
						<div className={"panel-footer"}>
							<span className={"muted"}>
								{app?.cloudSavedAccount ? (
									copy("web.cloud.savedAccount")
								) : (
									<>
										{icon("lock", 13)}
										{copy("web.editor.deviceStorageHint")}
									</>
								)}
							</span>
							<button
								type="button"
								className={"solid-button"}
								data-action={"save-note"}
								data-id={id}
							>
								{copy("web.save")}
							</button>
						</div>
					</div>
				</div>
			</>
		);
	},
	search(this: PanelRenderers, app?: SearchApp) {
		const f = app.searchFilter;
		const types = [
			["all", copy("web.all")],
			...searchTypes.map(([key, label]) => [key, copy(label)]),
		];
		const text = app.searchText(f.query);
		const category =
			f.pinned && f.type !== "all" ? searchTypes.find(([key]) => key === f.type) : null;
		const status = searchStatuses.find(([key]) => key === f.status);
		// @design search-tokens
		// Category is ink; # conditions are accent. Backspace removes them from the end.
		const tokens = [
			category && { key: "type", label: copy(category[1]), hash: false },
			status && { key: "status", label: `#${copy(status[1])}`, hash: true },
			f.tag && { key: "tag", label: `#${f.tag}`, hash: true },
		].filter(Boolean) as { key: string; label: string; hash: boolean }[];
		return (
			<>
				<div className="search-page-heading">
					<h1 id="modal-title">{copy("web.search.title")}</h1>
					<button
						type="button"
						className="icon-button search-account"
						data-action="nav"
						data-extra="settings"
						aria-label={copy("web.nav.settings")}
					>
						{icon("person", 20)}
					</button>
				</div>
				<div className="search-header">
					<div className="search-pill">
						{icon("search", 22)}
						{tokens.length > 0 && (
							<span className="search-tokens">
								{tokens.map((t) => (
									<button
										key={t.key}
										type="button"
										className={`search-token${t.hash ? " is-hash" : ""}`}
										data-action="search-untoken"
										data-extra={t.key}
										aria-label={`${copy("web.search.removeCondition")} ${t.label}`}
									>
										{t.label}
									</button>
								))}
							</span>
						)}
						<input
							type="search"
							id="filter-search"
							aria-label={copy("web.search.inputLabel")}
							placeholder={tokens.length ? "" : copy("web.search.inputPlaceholder")}
							defaultValue={f.query}
							data-input="search"
							autoComplete="off"
						/>
						<span
							className="search-count num sr-only"
							id="filter-result"
							role="status"
							aria-live="polite"
							aria-atomic="true"
						>
							{Object.values(app.searchAll(f.query)).flat().length}
							{copy("web.common.cardCountSuffix")}
						</span>
						<button
							type="button"
							className="icon-button search-clear"
							data-action="clear-query"
							aria-label={copy("web.search.clear")}
							hidden={!f.query}
						>
							{icon("x", 16)}
						</button>
						<button
							type="button"
							className="icon-button search-dictate"
							disabled
							aria-label={copy("web.ai.speak")}
						>
							{icon("mic", 22)}
						</button>
					</div>
					{button("x", copy("web.search.reset"), "search-reset")}
					<div className="search-hash-slot" id="search-hash-slot">
						{this.searchHashList(app)}
					</div>
				</div>
				{!category && (
					<div className="search-chips" hidden={!text}>
						<fieldset
							className="search-scope search-filter-items"
							aria-label={copy("web.search.filters.type")}
						>
							{types.map(([key, label]) => (
								<button
									key={key}
									type="button"
									className={`chip ${f.type === key ? "active" : ""}`}
									data-action="filter-type"
									data-extra={key}
									aria-pressed={f.type === key}
								>
									{label}
								</button>
							))}
						</fieldset>
					</div>
				)}
				<div className="search-results" id="search-results">
					{this.searchResults(app)}
				</div>
				<SelectionBar id="search-selection-bar" />
			</>
		);
	},
	/** Typing # lists the existing statuses, then the existing tags; picking one makes an accent token. */
	searchHashList(this: PanelRenderers, app?: SearchApp) {
		const f = app.searchFilter;
		const frag = app.searchHash(f.query);
		if (frag === null) return null;
		const needle = frag.toLocaleLowerCase();
		const statuses = searchStatuses.filter(
			([key, label]) => key !== f.status && copy(label).toLocaleLowerCase().includes(needle),
		);
		const tags = [...new Set<string>(Store.state.cards.flatMap((c: Card) => Store.tags(c)))].filter(
			(tag) => tag !== f.tag && tag.toLocaleLowerCase().includes(needle),
		);
		if (!statuses.length && !tags.length) return null;
		const option = (extra: string, label: string) => (
			<button
				key={extra}
				type="button"
				role="option"
				aria-selected="false"
				className="search-hash-option"
				data-action="search-hash"
				data-extra={extra}
			>
				{label}
			</button>
		);
		return (
			<div className="search-hash" role="listbox" aria-label={copy("web.search.hashList")}>
				{statuses.length > 0 && (
					<>
						<div className="search-hash-label">{copy("web.search.hashStatus")}</div>
						{statuses.map(([key, label]) => option(`status:${key}`, copy(label)))}
					</>
				)}
				{tags.length > 0 && (
					<>
						<div className="search-hash-label">{copy("web.search.hashTag")}</div>
						{tags.map((tag) => option(`tag:${tag}`, `#${tag}`))}
					</>
				)}
			</div>
		);
	},
	searchResults(this: PanelRenderers, app?: SearchApp) {
		const f = app.searchFilter,
			q = app.searchText(f.query);
		if (!q && f.type === "all" && f.status === "all" && !f.tag)
			return (
				<section className="search-browse" aria-label={copy("web.search.browseCategories")}>
					{searchTypes.map(([key, label, artwork]) => (
						<button
							key={key}
							type="button"
							className="search-category"
							data-action="search-category"
							data-extra={key}
						>
							<img src={Assets[artwork]} alt="" />
							<span>{copy(label)}</span>
						</button>
					))}
				</section>
			);
		const hits = app.searchAll(q);
		if (!hits.desk.length && !hits.shelved.length)
			return (
				<>
					<p className={"search-empty"}>
						{q ? `${copy("web.search.noResultsPrefix")}${q}」` : copy("web.app.4a684ec67af5")}
					</p>
				</>
			);
		const desk = hits.desk.slice(0, app.searchLimit || 40),
			shelved = hits.shelved.slice(0, Math.max(0, (app.searchLimit || 40) - desk.length));
		const cards = (list: Card[]) => (
			<>
				<div className={"search-card-grid"}>
					{keyed(list.map((c) => <CardView key={c.id} card={c} options={{ now: app.feedNow }} />))}
				</div>
			</>
		);
		return (
			<>
				{desk.length ? cards(desk) : ""}
				{shelved.length ? (
					<>
						<div className={"group-label"}>{copy("web.search.shelvedGroup")}</div>
						{cards(shelved)}
					</>
				) : (
					""
				)}
			</>
		);
	},
	archive(this: PanelRenderers, app?: Pick<AppController, "shelved">, which?: string) {
		const now = Date.now(),
			list = app.shelved(which).sort((a, b) => (b.time || 0) - (a.time || 0));
		const groups = new Map<string, Card[]>();
		for (const c of list) {
			const at = which === "read" ? Store.item(c.id).readAt || c.time : c.time,
				age = now - at,
				label =
					age < 7 * 86400000
						? copy("web.archive.thisWeek")
						: age < 14 * 86400000
							? copy("web.primitives.0cf8b14f4651")
							: copy("web.archive.earlier");
			(groups.get(label) || groups.set(label, []).get(label)).push(c);
		}
		const date = (ts?: number) => {
			const d = new Date(ts);
			return (
				<>
					{d.getMonth() + 1}
					{copy("web.primitives.1625179badc0")}
					{d.getDate()}
					{copy("web.primitives.85217f7aff77")}
				</>
			);
		};
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<div className={"panel-content"}>
						<div className={"panel-head"}>
							<h1 id={"modal-title"}>
								{which === "read"
									? copy("web.templates.7b7e6e8bd4ba")
									: copy("web.templates.709b79e460c8")}
							</h1>
							{which === "stale" && list.length ? (
								<>
									<button type={"button"} className={"text-link"} data-action={"archive-all"}>
										{copy("web.archive.archiveAll")}
									</button>
								</>
							) : (
								<>
									<span className={"muted num"}>{list.length}</span>
								</>
							)}
						</div>
						{"\n   "}
						<div
							className={"sheet-scroll"}
							style={{ maxHeight: "60vh", margin: "0 -28px", padding: "0 28px" }}
						>
							{keyed(
								list.length ? (
									[...groups].map(([label, cards]) => (
										<>
											<div className={"group-label"}>{label}</div>
											<div className={"row-list"}>
												{keyed(
													cards.map((c?: Card) => (
														<>
															<div className={"list-row hoverable"}>
																<span className={"row-icon"}>
																	{icon((CardTypes[c.type] || CardTypes.note).icon, 16)}
																</span>
																<button
																	type={"button"}
																	className={"row-main"}
																	data-action={"card-open"}
																	data-id={c.id}
																	style={{ textAlign: "left" }}
																>
																	<b>{c.title}</b>
																	<small>{cardSource(c) || ""}</small>
																</button>
																<span className={"row-side"}>
																	<span className={"row-date num"}>
																		{date(
																			which === "read" ? Store.item(c.id).readAt || c.time : c.time,
																		)}
																	</span>
																	<button
																		type={"button"}
																		className={"text-link row-put"}
																		data-action={"restore-card"}
																		data-id={c.id}
																	>
																		{copy("web.archive.restoreToDesk")}
																	</button>
																</span>
															</div>
														</>
													)),
												)}
											</div>
										</>
									))
								) : (
									<>
										<p className={"search-empty"}>{copy("web.archive.empty")}</p>
									</>
								),
							)}
						</div>
					</div>
				</div>
			</>
		);
	},
};
