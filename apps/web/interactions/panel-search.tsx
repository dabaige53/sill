import React, { type ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { SelectionBar } from "../atoms/selection.tsx";
import { CardView } from "../cards/components.tsx";
import { type CopyKey, copy } from "../copy.ts";
import { cardSource } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";
import { Store } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import { type PanelRenderers, type SearchApp } from "./panel-contract.ts";
import { button, icon, keyed } from "./panel-primitives.tsx";

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
		const f = app.searchFilter,
			tags = [...new Set<string>(Store.state.cards.flatMap((c?: Card) => Store.tags(c)))].slice(
				0,
				8,
			);
		const types = [
			["all", copy("web.all"), ""],
			["article", copy("web.search.type.article"), "book"],
			["mail", copy("web.search.type.mail"), "mail"],
			["note", copy("web.note"), "note"],
			["task", copy("web.task"), "check-circle"],
			["event", copy("web.event"), "calendar"],
			["media", copy("web.media"), "video"],
		];
		const status = [
			["unread", copy("web.unread")],
			["saved", copy("web.bookmark")],
			["later", copy("web.later")],
		];
		const row = (label: CopyKey, buttons: ReactNode) =>
			React.Children.count(buttons) ? (
				<>
					<div className={"search-filter-row"}>
						<span className={"search-filter-label"} aria-hidden={"true"}>
							{copy(label)}
						</span>
						{/* biome-ignore lint/a11y/useSemanticElements: Keep the existing filter layout; aria-label names this non-form button group. */}
						<div className={"search-filter-items"} role={"group"} aria-label={copy(label)}>
							{buttons}
						</div>
					</div>
				</>
			) : (
				""
			);
		return (
			<>
				<h1 id={"modal-title"} className={"sr-only"}>
					{copy("web.search.title")}
				</h1>
				<div className={"search-header"}>
					<div className={"search-pill"}>
						{icon("search", 18)}
						<input
							type={"search"}
							id={"filter-search"}
							aria-label={copy("web.search.inputLabel")}
							placeholder={copy("web.search.inputPlaceholder")}
							defaultValue={f.query}
							data-input={"search"}
							autoComplete={"off"}
						/>
						<span
							className={"search-count num sr-only"}
							id={"filter-result"}
							role={"status"}
							aria-live={"polite"}
							aria-atomic={"true"}
						>
							{Object.values(app.searchAll(f.query)).flat().length}
							{copy("web.common.cardCountSuffix")}
						</span>
						{f.query ? button("x", copy("web.search.clear"), "clear-query") : ""}
					</div>
					{button("x", copy("web.close"), "close")}
				</div>
				{"\n   "}
				{/* biome-ignore lint/a11y/useSemanticElements: This existing group contains filter button groups, not form fields. */}
				<div className={"search-chips"} role={"group"} aria-label={copy("web.search.filtersLabel")}>
					{keyed(
						row(
							"web.search.filters.type",
							types.map(([k, v, ic]) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.type === k ? "active" : "") + ""}
										data-action={"filter-type"}
										data-extra={k}
										aria-pressed={f.type === k}
									>
										{v}
									</button>
								</>
							)),
						),
					)}
					{keyed(
						row(
							"web.search.filters.status",
							status.map(([k, v]) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.status === k ? "active" : "") + ""}
										data-action={"filter-status"}
										data-extra={k}
										aria-pressed={f.status === k}
									>
										{v}
									</button>
								</>
							)),
						),
					)}
					{keyed(
						row(
							"web.search.filters.tag",
							tags.map((t) => (
								<>
									<button
										type={"button"}
										className={"chip " + (f.tag === t ? "active" : "") + ""}
										data-action={"filter-tag"}
										data-extra={t}
										aria-pressed={f.tag === t}
									>
										{"#"}
										{t}
									</button>
								</>
							)),
						),
					)}
				</div>
				{"\n   "}
				<div className={"search-results"} id={"search-results"}>
					{this.searchResults(app)}
				</div>
				<SelectionBar id="search-selection-bar" />
			</>
		);
	},
	searchResults(this: PanelRenderers, app?: SearchApp) {
		const f = app.searchFilter,
			q = f.query.trim();
		if (!q && f.type === "all" && f.status === "all" && !f.tag) return null;
		const hits = app.searchAll(q);
		if (!hits.desk.length && !hits.shelved.length)
			return (
				<>
					<p className={"search-empty"}>
						{copy("web.search.noResultsPrefix")}
						{q}
						{"」"}
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
