/** Compact reads for agents: keyword search hits and the workspace without long text. */

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

/** The database returns the body's opening (`lead`) and the text around the first match (`excerpt`). */
export function searchResult(page: { total: number; items: any[] }) {
	return {
		total: page.total,
		items: page.items.map(({ lead, excerpt, summary, ...hit }) => {
			const result: Record<string, unknown> = {
				...hit,
				summary: clip(summary || plain(lead || ""), 300),
			};
			const snippet = excerpt ? clip(plain(excerpt), 300) : "";
			if (snippet && !String(result.summary).includes(snippet)) result.snippet = snippet;
			return result;
		}),
	};
}

/** A workspace snapshot without long text; compact cards cannot pass as write baselines. */
export function compactWorkspace(snapshot: any) {
	return {
		...snapshot,
		compact: true,
		state: {
			...snapshot.state,
			cards: snapshot.state.cards.map(({ body, chapters, transcript, ...card }: any) => ({
				...card,
				bodyChars: [...(body || "")].length,
			})),
		},
	};
}
