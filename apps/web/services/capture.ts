import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";

/** Quick notes and links entered by the user. */
const Capture: Record<string, any> = {
	id(prefix?: any, text?: any) {
		let h = 2166136261;
		for (const ch of String(text)) {
			h ^= ch.codePointAt(0);
			h = Math.imul(h, 16777619);
		}
		return `${prefix}-${(h >>> 0).toString(36)}`;
	},
	url(value?: any) {
		try {
			const u = new URL(String(value).trim());
			return ["http:", "https:"].includes(u.protocol) ? u.href : "";
		} catch {
			return "";
		}
	},
	clip(text?: any, n?: any) {
		return String(text || "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, n);
	},
	/** A link or a line of text, from capture, paste or drop. */
	capture(text?: any) {
		const value = String(text || "").trim();
		if (!value) return null;
		const url = this.url(value.split(/\s+/)[0]);
		if (url) {
			const host = new URL(url).hostname.replace(/^www\./, "");
			const rest = value.slice(value.split(/\s+/)[0].length).trim();
			return {
				id: this.id("web", url + Date.now()),
				type: "article",
				title: this.clip(rest || host + new URL(url).pathname.replace(/\/$/, ""), 200),
				summary: "",
				sources: [{ name: host, kind: "web" }],
				url,
				tags: [],
				body: rest,
				time: Date.now(),
			};
		}
		const lines = value.split("\n"),
			title = this.clip(lines[0], 60);
		return {
			id: this.id("note", value + Date.now()),
			type: "note",
			title,
			summary: this.clip(value, 300),
			sources: [{ name: copy("web.cards.e727b8cc2df0"), kind: "capture" }],
			tags: [],
			body: value.slice(0, 500000),
			time: Date.now(),
		};
	},
	/** Skip an existing URL or identical local note; never claim to merge content. */
	dedupe(cards?: any) {
		const byUrl = new Map<any, any>(),
			byTitle = new Map<any, any>();
		for (const c of Store.state.cards) {
			if (c.url) byUrl.set(c.url, c);
			byTitle.set(c.title, c);
		}
		const fresh = [],
			merged = [];
		for (const c of cards) {
			const twin = c.url
				? byUrl.get(c.url)
				: [...byTitle.values()].find(
						(old?: any) => !old.url && old.title === c.title && (old.body || "") === (c.body || ""),
					);
			if (twin) {
				merged.push([twin, c]);
				continue;
			}
			fresh.push(c);
			if (c.url) byUrl.set(c.url, c);
			byTitle.set(c.title, c);
		}
		return { fresh, merged };
	},
};

export { Capture };
