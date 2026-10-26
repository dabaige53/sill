import type { Platform } from "./catalog.ts";

export const criteria = [
	"criteriaSource",
	"criteriaScope",
	"criteriaInteraction",
	"criteriaState",
	"criteriaMotion",
] as const;
export type Review = { favorite?: boolean; notes?: string; issue?: boolean; checks?: string[] };
export type Reviews = Record<string, Review>;
export const reviewStorageKey = "sill-motion-review-v1";
export const reviewKey = (id: string, platform: Platform) => `${id}:${platform}`;
export function reviewStatus(review: Review = {}) {
	return review.issue
		? "issue"
		: criteria.every((key) => review.checks?.includes(key))
			? "checked"
			: "unchecked";
}
export function readReviews(storage: Pick<Storage, "getItem">): Reviews {
	try {
		return JSON.parse(storage.getItem(reviewStorageKey) || "{}");
	} catch {
		return {};
	}
}
export function saveReviews(storage: Pick<Storage, "setItem">, reviews: Reviews) {
	try {
		storage.setItem(reviewStorageKey, JSON.stringify(reviews));
		return true;
	} catch {
		return false;
	}
}
