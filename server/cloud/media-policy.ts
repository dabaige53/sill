/** Hosts group static resource origins together. Keep scripts restricted inside the document. */
export const mediaScriptPolicy =
	"script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; object-src 'none'; base-uri 'none'";
export const mediaFrameDomains = ["https://www.youtube-nocookie.com"];

export function mediaResourceDomains(cards: any[] = []) {
	const domains = new Set([
		"https://www.youtube.com",
		"https://s.ytimg.com",
		"https://developer.mozilla.org",
	]);
	for (const card of cards) {
		for (const value of [
			card.image,
			...(Array.isArray(card.photos) ? card.photos : []),
			card.audioUrl,
		]) {
			if (typeof value !== "string") continue;
			try {
				const url = new URL(value);
				if (url.protocol === "https:" && !url.username && !url.password) domains.add(url.origin);
			} catch {}
		}
	}
	return [...domains].sort();
}

export function restrictMediaScripts(html: string) {
	return html.replace(
		/<head(?:\s[^>]*)?>/i,
		(head) => `${head}<meta http-equiv="Content-Security-Policy" content="${mediaScriptPolicy}">`,
	);
}
