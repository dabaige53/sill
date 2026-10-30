/** Plain keyword search over one workspace snapshot. Results carry no body. */

const plain = (markdown: string) =>
	markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
		.replace(/[*_`~|]/g, "")
		.replace(/\s+/g, " ")
		.trim();
const clip = (text: string, max: number) =>
	text.length > max ? text.slice(0, max - 1) + "…" : text;

/** The words around the first keyword found in the body. */
function snippet(text: string, terms: string[]) {
	const lower = text.toLocaleLowerCase();
	const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0));
	if (!Number.isFinite(at)) return undefined;
	const start = Math.max(0, at - 60);
	return clip((start ? "…" : "") + text.slice(start, start + 200), 300);
}

export function searchCards(snapshot: any, query: string, limit = 20) {
	const terms = [...new Set(query.toLocaleLowerCase().split(/\s+/).filter(Boolean))];
	const items = snapshot.state.items || {};
	const hits = [];
	for (const card of snapshot.state.cards) {
		if (card.deleted) continue;
		const body = plain(card.body || "");
		const head = [card.title, card.summary, ...(card.tags || [])].join(" ").toLocaleLowerCase();
		const rest = [
			body,
			card.url,
			items[card.id]?.note,
			...(card.sources || []).map((source: any) => source.name),
			...(card.authors || []).map((author: any) => author.name),
		]
			.join(" ")
			.toLocaleLowerCase();
		if (!terms.every((term) => head.includes(term) || rest.includes(term))) continue;
		hits.push({ card, body, inHead: terms.filter((term) => head.includes(term)).length });
	}
	// Title, summary and tag matches first, then the newest written card.
	hits.sort(
		(a, b) => b.inHead - a.inHead || Date.parse(b.card.created_at) - Date.parse(a.card.created_at),
	);
	return {
		total: hits.length,
		items: hits.slice(0, limit).map(({ card, body }) => {
			const hit: Record<string, unknown> = {
				id: card.id,
				type: card.type,
				title: card.title,
				summary: clip(card.summary || body, 300),
				archived: !!items[card.id]?.archived,
				revision: card.revision,
				created_at: card.created_at,
				updated_at: card.updated_at,
			};
			const found = snippet(body, terms);
			if (found && !hit.summary.toString().includes(found.replace(/^…|…$/g, "")))
				hit.snippet = found;
			for (const key of ["url", "sources", "tags", "publishedAt", "start", "end", "due"])
				if (card[key] !== undefined) hit[key] = card[key];
			return hit;
		}),
	};
}
