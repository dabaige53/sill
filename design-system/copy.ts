import messages from "./copy/zh-Hans.json" with { type: "json" };

export type CopyKey = keyof typeof messages;

export function copy(key: CopyKey): string {
	return messages[key];
}

export function errorMessage(code: unknown): string {
	const key = `error.${code}`;
	return Object.hasOwn(messages, key) ? messages[key as CopyKey] : messages["error.unavailable"];
}
