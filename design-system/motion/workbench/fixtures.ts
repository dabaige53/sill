import type { Card } from "../../../apps/web/../../contracts/card.ts";
import { SeedCards } from "../../../apps/web/data/cards.ts";
import { Store } from "../../../apps/web/data/store.ts";
import { t } from "./catalog.ts";

const now = Date.UTC(2026, 9, 25, 4);
export function exampleCards(): Card[] {
	const base = SeedCards.find((card) => card.type === "article");
	const cards = ["fixtureArticle", "fixtureSecond", "fixtureThird"].map((key, index) => ({
		...structuredClone(base),
		id: `motion-card-${index + 1}`,
		title: t(key),
		image: undefined,
		url: undefined,
		time: now - index * 3600000,
		priority: index * 4,
		summary: t("fixtureSummary"),
		body: [
			t("fixtureParagraph"),
			...Array.from(
				{ length: 8 },
				(_, i) =>
					`## ${t("fixtureSection")} ${i + 1}\n\n${t("fixtureParagraph")}\n\n${t("fixtureParagraph")}`,
			),
		].join("\n\n"),
		related: index === 0 ? ["motion-card-2"] : ["motion-card-1"],
	}));
	const task = structuredClone(SeedCards.find((card) => card.type === "task"));
	task.id = "motion-task";
	task.tasks = [{ id: "motion-task-1", text: t("fixtureTask"), done: false }];
	task.title = t("fixtureThird");
	const podcast = structuredClone(
		SeedCards.find((card) => card.type === "media" && card.media === "podcast"),
	);
	// No media source is requested. The real player retains its disabled controls.
	podcast.id = "motion-podcast";
	podcast.audioUrl = undefined;
	podcast.url = undefined;
	podcast.playback = undefined;
	podcast.transcript = Array.from({ length: 14 }, (_, index) => ({
		start: index * 30,
		text: t("fixtureParagraph"),
	}));
	const related = {
		...structuredClone(cards[0]),
		id: "motion-related",
		type: "digest",
		related: ["motion-card-2"],
	};
	const reading = {
		...structuredClone(cards[0]),
		id: "motion-reading",
		type: "mail",
		title: t("fixtureReading"),
		sender: t("fixtureSender"),
		attachments: [],
	};
	return [...cards, task, podcast, related, reading];
}

export function initializeExampleStore() {
	Store.state = Store.fresh();
	Store.state.cards = exampleCards();
	// Never load, migrate or persist a product workspace from this entry point.
	Store.save = () => {};
	return Store.state.cards;
}
