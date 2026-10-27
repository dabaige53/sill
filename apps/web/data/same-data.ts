/** Saved data compares by content: services may return the same fields in another order. */
export function sameData(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	// Undefined fields are absent once serialized, so they do not count as a change.
	const keys = (value: object) =>
		Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined);
	const left = keys(a),
		right = keys(b);
	return (
		left.length === right.length &&
		left.every(
			(key) =>
				Object.hasOwn(b, key) &&
				sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
		)
	);
}
