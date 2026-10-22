import type { CardItem } from "../data/store.ts";
/** Home filter. `type`/`status` carry the tab; `kind` is the type chip and `mark` the # status. */
export type Filter = {
	type: string;
	status: string;
	tag: string;
	query: string;
	kind: string;
	mark: string;
};
export type TargetEvent<E extends Event> = E & {
	target: HTMLElement & { value?: string; disabled?: boolean };
};
/** Selectors in the injected app containers target HTML, with native tag overloads retained. */
export interface ViewQueries {
	querySelector<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K];
	querySelector<K extends keyof SVGElementTagNameMap>(selector: K): SVGElementTagNameMap[K];
	querySelector<E extends Element = HTMLElement>(selector: string): E;
	querySelectorAll<K extends keyof HTMLElementTagNameMap>(
		selector: K,
	): NodeListOf<HTMLElementTagNameMap[K]>;
	querySelectorAll<K extends keyof SVGElementTagNameMap>(
		selector: K,
	): NodeListOf<SVGElementTagNameMap[K]>;
	querySelectorAll<E extends Element = HTMLElement>(selector: string): NodeListOf<E>;
}
export type ViewElement = ViewQueries & HTMLElement;
export type ViewDialog = ViewQueries & HTMLDialogElement;
export type Deck = ViewElement & {
	_finish?: () => void;
	_wheel?: { dx: number; t?: number };
	_hold?: number;
	_wheelDirection?: number;
	_cancelGesture?: () => void;
};
export type DeckGesture = {
	deck: Deck;
	id: number;
	x: number;
	y: number;
	at: number;
	live: boolean;
	dx: number;
};
export type CardFlag = keyof {
	[K in keyof CardItem as CardItem[K] extends boolean ? K : never]: CardItem[K];
};

/** On a phone these places are pages under the capsule, not sheets. */
export const PAGE_KINDS = ["search", "ai", "settings"];
