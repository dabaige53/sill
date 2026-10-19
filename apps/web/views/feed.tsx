import React, { type ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import { CardView, OpenStackView, ShelfView, StackView } from "../cards/components.tsx";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { WelcomeView } from "../interactions/panels-components.tsx";
import { FeedPolicy } from "../services/feed-policy.ts";
import type { AppController } from "./app.ts";

export function feedView(
	app: AppController,
	heldId = "",
	taskPreviewOrder: string[] = [],
): ReactNode {
	if (!Store.state.cards.length && !window.__QG_RUNTIME__) return <WelcomeView />;
	const previous = app.preserveFeed ? app.feedSnapshot : null;
	const cards = previous
		? previous.cards.map((card) => Store.card(card.id)).filter(Boolean)
		: app.filtered();
	const shelf = (
		<ShelfView key="shelf" read={app.shelved("read").length} stale={app.shelved("stale").length} />
	);
	if (!cards.length)
		return (
			<>
				<section className="empty-card feed-item">
					<h2>
						{app.filtering()
							? app.filter.query
								? `${copy("web.search.noResultsPrefix")}${app.filter.query}」`
								: copy("web.app.4a684ec67af5")
							: copy("web.app.a510cac879f0")}
					</h2>
					{app.filtering() && (
						<button type="button" className="text-link" data-action="clear-filter">
							{copy("web.app.657d9cbf45ec")}
						</button>
					)}
				</section>
				{!app.filtering() && shelf}
			</>
		);
	const stacks =
		previous?.stacks ||
		(Store.pref("stack") && !app.filtering()
			? FeedPolicy.stacks(cards, Store.state.items)
			: new Map<string, Card[]>());
	app.feedSnapshot = { cards, stacks };
	const inStack = new Map<string, string>();
	for (const [key, list] of stacks) for (const c of list) inStack.set(c.id, key);
	const views: ReactNode[] = [],
		done = new Set<string>();
	for (const card of cards) {
		const key = inStack.get(card.id);
		if (!key) {
			views.push(
				<CardView
					key={card.id}
					card={card}
					options={{
						now: app.feedNow,
						taskPreviewOrder: app.preserveFeed
							? [
									...app.grid.querySelectorAll<HTMLElement>(
										`[data-card="${CSS.escape(card.id)}"] .checklist [data-action="task"]`,
									),
								].map((n) => n.dataset.extra)
							: card.id === heldId
								? taskPreviewOrder
								: [],
					}}
				/>,
			);
			continue;
		}
		if (done.has(key)) continue;
		done.add(key);
		views.push(
			app.openStacks.has(key) ? (
				<OpenStackView key={key} stackKey={key} cards={stacks.get(key)!} />
			) : (
				<StackView key={key} stackKey={key} cards={stacks.get(key)!} />
			),
		);
	}
	app.hasMore = views.length > app.pageLimit;
	if (app.hasMore) views.length = app.pageLimit;
	else if (!app.filtering()) views.push(shelf);
	document.body.classList.toggle("feed-more", app.hasMore);
	return views;
}
