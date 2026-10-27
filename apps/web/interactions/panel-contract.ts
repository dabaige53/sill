import type { ReactNode } from "react";
import type { Card } from "../../../contracts/card.ts";
import type { CardAction } from "../../../contracts/card-actions.ts";
import type { CardItem } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import type { AIPageState } from "./panel-ai.tsx";

export type ToolbarAction = [CardAction, ReactNode];
export type PreviewApp = {
	action?: AppController["action"];
	agentAction?: (card: Card) => string;
	agentActionView?: (card: Card) => ReactNode;
};
export type SearchApp = Pick<
	AppController,
	| "searchFilter"
	| "searchAll"
	| "searchSuggestions"
	| "searchText"
	| "searchHash"
	| "searchLimit"
	| "feedNow"
>;
/** Legacy callers may retain an unrecognized display form; the renderer keeps its fallback. */
export type PreviewCard = { [K in keyof Card]: K extends "form" ? string : Card[K] };

export type Fragments = ReactNode[];
export interface PanelRenderers {
	close(label?: string): ReactNode;
	meta(card?: Card): ReactNode;
	tags(card?: Card): ReactNode;
	publication(card?: Record<string, unknown>): ReactNode;
	bookmark(card?: Card, state?: CardItem): ReactNode;
	later(card?: Card, state?: CardItem): ReactNode;
	bar(...parts: Fragments): ReactNode;
	sep: ReactNode;
	tools(card?: Card, state?: CardItem, own?: ToolbarAction[]): ReactNode;
	own(card?: Card): ToolbarAction[];
	head(...tools: Fragments): ReactNode;
	foot(...actions: Fragments): ReactNode;
	reminderTools(card?: Card): ReactNode;
	externalLabel(card?: Card): string;
	readButton(card?: Card, state?: Pick<CardItem, "progress" | "read">): ReactNode;
	preview(app?: PreviewApp, card?: PreviewCard): ReactNode;
	reader(app?: PreviewApp, card?: Card, loading?: boolean): ReactNode;
	lightbox(card?: Card, index?: number, app?: PreviewApp): ReactNode;
	editor(
		app?: Pick<AppController, "editTags"> & { cloudSavedAccount?: boolean },
		id?: string,
	): ReactNode;
	search(app?: SearchApp): ReactNode;
	searchResults(app?: SearchApp): ReactNode;
	searchHashList(app?: SearchApp): ReactNode;
	searchSuggest(app?: SearchApp): ReactNode;
	archive(app?: Pick<AppController, "shelved">, which?: string): ReactNode;
	settingsGroups: string[][];
	settings(
		app?: Partial<AppController> & { cloudSettingsContent?: ReactNode },
		group?: string,
	): ReactNode;
	confirm(title?: string, detail?: string, actions?: ReactNode): ReactNode;
	ai(app?: AIPageState): ReactNode;
}
