import recipes from "../../../design-system/recipes.json" with { type: "json" };
import { cardSourceKind } from "../data/card-source.ts";
import { CardTypes } from "../data/cards.ts";

/** A recipe entry: a block, a block with options, a group of entries, or a composite surface. */
export type Entry =
	| string
	| ({ block: string } & Record<string, any>)
	| { group: string; blocks: Entry[] }
	| { composite: string };
export interface DetailRecipe {
	head?: Entry[];
	body?: Entry[];
	composite?: string;
	ruled?: boolean;
	reader?: boolean;
	end?: boolean;
}
interface Recipe {
	card: Entry[] | string;
	detail: DetailRecipe | string;
}

const types = recipes.types as Record<string, Recipe>;

/** The recipe key: the card type, or a variant for media subtypes and quote or capture notes. */
export function recipeKey(card: Record<string, any>): string {
	const type = Object.hasOwn(CardTypes, card.type) ? card.type : "default";
	if (type === "media") return card.media === "podcast" ? "media.podcast" : "media.video";
	if (type === "note" && card.form === "quote") return "note.quote";
	if (type === "note" && cardSourceKind(card) === "capture") return "note.capture";
	return Object.hasOwn(types, type) ? type : "default";
}

/** Entries may name another recipe to reuse its card face or detail. */
function resolve<K extends keyof Recipe>(key: string, part: K): Exclude<Recipe[K], string> {
	let value = types[key][part];
	for (let hops = 0; typeof value === "string" && hops < 4; hops++) value = types[value][part];
	if (typeof value === "string") throw new Error(`recipe_cycle:${key}`);
	return value as Exclude<Recipe[K], string>;
}

export function cardRecipe(card: Record<string, any>): Entry[] {
	return resolve(recipeKey(card), "card");
}
export function detailRecipe(card: Record<string, any>): DetailRecipe {
	return resolve(recipeKey(card), "detail");
}
/** The full-screen reader uses the type's detail when it supports reading, else the default. */
export function readerRecipe(card: Record<string, any>): DetailRecipe {
	const detail = detailRecipe(card);
	return detail.reader ? detail : resolve("default", "detail");
}

export function entryName(entry: Entry): string {
	return typeof entry === "string"
		? entry
		: "block" in entry
			? entry.block
			: "group" in entry
				? entry.group
				: entry.composite;
}
export function entryOptions(entry: Entry): Record<string, any> {
	return typeof entry === "string" ? {} : entry;
}
