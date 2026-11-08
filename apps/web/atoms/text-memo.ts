/**
 * A value derived from long text, such as a Markdown body, computed once per distinct string.
 * Feed renders, search and saves ask for the same bodies many times; parsing them again each
 * time made every keystroke and card update scale with the size of the workspace.
 * The budget counts key characters so a whole workspace of bodies fits; least recently used
 * entries leave first, so edited or removed bodies do not accumulate.
 */
export function textMemo<T>(derive: (text: string) => T, budget = 8_000_000) {
	const values = new Map<string, T>();
	let size = 0;
	return (text: string): T => {
		if (values.has(text)) {
			const value = values.get(text) as T;
			// A Map keeps insertion order: a hit moves to the newest end.
			values.delete(text);
			values.set(text, value);
			return value;
		}
		const value = derive(text);
		values.set(text, value);
		size += text.length;
		for (const key of values.keys()) {
			if (size <= budget || key === text) break;
			values.delete(key);
			size -= key.length;
		}
		return value;
	};
}
