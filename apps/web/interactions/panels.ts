import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card } from "../../../contracts/card.ts";
import type { CardAction } from "../../../contracts/card-actions.ts";
import type { CardItem } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import { TrustedFragment } from "./panel-primitives.tsx";
import { formatBytes, PanelViews, relativeTime, WelcomeView } from "./panels-components.tsx";

type ToolbarAction = [CardAction, string];
type PreviewApp = Partial<Pick<AppController, "agentAction">>;
type SearchApp = Pick<AppController, "searchFilter" | "searchAll" | "searchLimit" | "feedNow">;
/** Legacy callers may retain an unrecognized display form; the renderer keeps its fallback. */
type PreviewCard = { [K in keyof Card]: K extends "form" ? string : Card[K] };

type Fragments = (string | false)[];
interface PanelRenderers {
	close(label?: string): string;
	meta(card?: Card): string;
	tags(card?: Card): string;
	details(card?: Pick<Card, "type" | "meta"> & Record<string, unknown>): string;
	bookmark(card?: Card, state?: CardItem): string;
	later(card?: Card, state?: CardItem): string;
	bar(...parts: Fragments): string;
	sep: string;
	tools(card?: Card, state?: CardItem, own?: ToolbarAction[]): string;
	own(card?: Card): ToolbarAction[];
	head(...tools: Fragments): string;
	foot(...actions: Fragments): string;
	reminderTools(card?: Card): string;
	externalLabel(card?: Card): string;
	readButton(card?: Card, state?: Pick<CardItem, "progress" | "read">): string;
	preview(app?: PreviewApp, card?: PreviewCard): string;
	reader(app?: PreviewApp, card?: Card, loading?: boolean): string;
	lightbox(card?: Card, index?: number, app?: PreviewApp): string;
	editor(app?: Pick<AppController, "editTags">, id?: string): string;
	search(app?: SearchApp): string;
	searchResults(app?: SearchApp): string;
	archive(app?: Pick<AppController, "shelved">, which?: string): string;
	settingsGroups: string[][];
	settings(app?: unknown, group?: string): string;
	confirm(title?: string, detail?: string, actions?: string): string;
	ai(app?: Pick<AppController, "aiSelectionIds"> & Partial<Pick<AppController, "aiDraft">>): string;
	capture(app?: unknown): string;
}

/** Static compatibility API for tests, boards and integrations that still consume HTML. */
const Panels = Object.fromEntries(
	Object.entries(PanelViews).map(([name, view]) => {
		if (typeof view !== "function")
			return [name, name === "sep" ? renderToStaticMarkup(view) : view];
		if (name === "externalLabel")
			return [name, (...args: unknown[]) => view.apply(PanelViews, args)];
		if (name === "own")
			return [
				name,
				(...args: unknown[]) =>
					PanelViews.own
						.apply(PanelViews, args)
						.map(([action, node]) => [action, renderToStaticMarkup(node)]),
			];
		return [
			name,
			(...args: unknown[]) => {
				const htmlNode = (value: unknown) =>
					typeof value === "string" ? createElement(TrustedFragment, { html: value }) : value;
				if (["head", "foot", "bar"].includes(name)) args = args.map(htmlNode);
				if (name === "confirm") args[2] = htmlNode(args[2]);
				if (name === "tools" && Array.isArray(args[2]))
					args[2] = args[2].map(([key, html]) => [key, htmlNode(html)]);
				return renderToStaticMarkup(view.apply(PanelViews, args) as ReactNode);
			},
		];
	}),
) as unknown as PanelRenderers;
function welcomeHTML({
	actions = null,
	detail = "",
}: {
	actions?: string | null;
	detail?: string;
} = {}) {
	return renderToStaticMarkup(
		createElement(WelcomeView, {
			actions: actions === null ? null : createElement(TrustedFragment, { html: actions }),
			detail: detail ? createElement(TrustedFragment, { html: detail }) : null,
		}),
	);
}

export { formatBytes, Panels, PanelViews, relativeTime, WelcomeView, welcomeHTML };
