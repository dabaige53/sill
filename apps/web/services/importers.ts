import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";

/** File import. Everything is parsed on this device; nothing is uploaded.
 * OPML → subscriptions; CSV (Readwise, Pocket) and HTML bookmarks → articles; Markdown → notes; .ics → events.
 */
const Importers: Record<string, any> = {
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
	kindOf(name?: any, text?: any) {
		const lower = name.toLowerCase();
		if (lower.endsWith(".opml") || /<opml[\s>]/i.test(text)) return "opml";
		if (lower.endsWith(".ics") || /BEGIN:VCALENDAR/.test(text)) return "ics";
		if (lower.endsWith(".csv")) return "csv";
		if (
			lower.endsWith(".html") ||
			lower.endsWith(".htm") ||
			/<!DOCTYPE NETSCAPE-Bookmark/i.test(text)
		)
			return "html";
		if (/\.(md|markdown|txt)$/.test(lower)) return "markdown";
		return "";
	},
	labels: {
		opml: copy("web.importers.26ef7656f45c"),
		csv: copy("web.importers.26688145efd6"),
		html: copy("web.importers.d85aebef03b7"),
		markdown: copy("web.importers.cccc42be5956"),
		ics: copy("web.importers.4cb55a86b4a1"),
	},
	/** Returns {kind, title, entries:[{key,label,detail,card?,feed?,time}]} */
	parse(name?: any, text?: any) {
		const kind = this.kindOf(name, text);
		const parsed =
			kind === "opml"
				? this.opml(text)
				: kind === "csv"
					? this.csv(text)
					: kind === "html"
						? this.bookmarks(text)
						: kind === "ics"
							? this.ics(text)
							: kind === "markdown"
								? this.markdown(name, text)
								: [];
		return { kind, name, entries: parsed.slice(0, 2000) };
	},
	opml(text?: any) {
		const doc = new DOMParser().parseFromString(text, "text/xml");
		return [...doc.querySelectorAll("outline[xmlUrl],outline[xmlurl]")]
			.map((n?: any) => {
				const title = this.clip(
						n.getAttribute("title") || n.getAttribute("text") || n.getAttribute("xmlUrl"),
						100,
					),
					url = this.url(n.getAttribute("xmlUrl") || n.getAttribute("xmlurl"));
				return url
					? { key: url, label: title, detail: new URL(url).hostname, feed: { title, url } }
					: null;
			})
			.filter(Boolean);
	},
	csvRows(text?: any) {
		const rows = [];
		let row = [],
			cell = "",
			quoted = false;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (quoted) {
				if (ch === '"' && text[i + 1] === '"') {
					cell += '"';
					i++;
				} else if (ch === '"') quoted = false;
				else cell += ch;
			} else if (ch === '"') quoted = true;
			else if (ch === ",") {
				row.push(cell);
				cell = "";
			} else if (ch === "\n" || ch === "\r") {
				if (ch === "\r" && text[i + 1] === "\n") i++;
				row.push(cell);
				rows.push(row);
				row = [];
				cell = "";
			} else cell += ch;
		}
		if (cell || row.length) {
			row.push(cell);
			rows.push(row);
		}
		return rows.filter((r?: any) => r.some((c?: any) => c.trim()));
	},
	csv(text?: any) {
		const [head, ...rows] = this.csvRows(text);
		if (!head) return [];
		const col = (...names: any[]) =>
			head.findIndex((h?: any) => names.includes(h.trim().toLowerCase()));
		const t = col("title", "book title"),
			u = col("url", "source url", "book url"),
			h = col("highlight", "text", "excerpt"),
			a = col("author", "book author"),
			d = col("time_added", "date", "highlighted at", "created");
		const kind = h >= 0 ? "readwise" : "web";
		return rows
			.map((r?: any) => {
				const url = this.url(r[u] || ""),
					title = this.clip(r[t] || r[h] || url, 200);
				if (!title) return null;
				const raw = d >= 0 ? r[d] : "",
					time = /^\d{9,10}$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) || Date.now();
				const highlight = h >= 0 ? this.clip(r[h], 2000) : "";
				return {
					key: url || title,
					label: title,
					detail: [a >= 0 ? r[a] : "", url ? new URL(url).hostname : ""]
						.filter(Boolean)
						.join(" · "),
					time,
					card: {
						id: this.id("imp", url || title + highlight),
						type: "article",
						title,
						summary: this.clip(highlight, 300),
						sources: [
							{
								name:
									kind === "readwise"
										? "Readwise"
										: url
											? new URL(url).hostname
											: copy("web.panels.576d81bb0631"),
								kind: kind,
							},
						],
						meta: highlight ? copy("web.importers.05f954565f29") : "",
						...(url ? { url } : {}),
						tags: [],
						body: highlight ? [highlight] : [],
						time,
					},
				};
			})
			.filter(Boolean);
	},
	bookmarks(text?: any) {
		const doc = new DOMParser().parseFromString(text, "text/html");
		return [...doc.querySelectorAll("a[href]")]
			.map((n?: any) => {
				const url = this.url(n.getAttribute("href"));
				if (!url) return null;
				const title = this.clip(n.textContent || url, 200),
					added = Number(n.getAttribute("add_date")) * 1000 || Date.now();
				return {
					key: url,
					label: title,
					detail: new URL(url).hostname,
					time: added,
					card: {
						id: this.id("imp", url),
						type: "article",
						title,
						summary: "",
						sources: [{ name: new URL(url).hostname, kind: "web" }],
						meta: copy("web.importers.94b8975ca710"),
						url,
						tags: [],
						body: [],
						time: added,
					},
				};
			})
			.filter(Boolean);
	},
	markdown(name?: any, text?: any) {
		const lines = text.replace(/\r/g, "").split("\n");
		const heading = lines.find((l?: any) => /^#\s+/.test(l));
		const title =
			this.clip(
				heading ? heading.replace(/^#\s+/, "") : name.replace(/\.(md|markdown|txt)$/i, ""),
				200,
			) || copy("web.unnamedNote");
		const body = text
			.replace(/\r/g, "")
			.split(/\n{2,}/)
			.map((p?: any) => p.replace(/^#+\s+/gm, "").trim())
			.filter((p?: any) => p && p !== title)
			.slice(0, 100)
			.map((p?: any) => p.slice(0, 50000));
		return [
			{
				key: name + title,
				label: title,
				detail: `${body.length}${copy("web.importers.03b7163f76aa")}`,
				time: Date.now(),
				card: {
					id: this.id("md", name + title),
					type: "note",
					title,
					summary: this.clip(body[0] || "", 300),
					sources: [{ name: "Markdown", kind: "markdown" }],
					meta: name.slice(0, 100),
					tags: [],
					body,
					time: Date.now(),
				},
			},
		];
	},
	ics(text?: any) {
		const unfolded = text.replace(/\r?\n[ \t]/g, "");
		const date = (v?: any) => {
			const m = String(v || "").match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
			if (!m) return NaN;
			const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
			return z
				? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
				: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
		};
		return unfolded
			.split("BEGIN:VEVENT")
			.slice(1)
			.map((block?: any) => {
				const get = (key?: any) => {
					const m = block.match(new RegExp("^" + key + "(?:;[^:\\n]*)?:(.*)$", "m"));
					return m ? m[1].trim() : "";
				};
				const start = date(get("DTSTART")),
					end = date(get("DTEND")) || start + 3600000,
					title = this.clip(get("SUMMARY").replace(/\\,/g, ",").replace(/\\n/g, " "), 200);
				if (!title || !Number.isFinite(start) || !(end > start)) return null;
				const url = this.url(get("URL")),
					location = this.clip(get("LOCATION").replace(/\\,/g, ","), 300);
				return {
					key: get("UID") || title + start,
					label: title,
					detail: new Date(start).toLocaleString("zh-CN", {
						month: "numeric",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					}),
					time: start,
					card: {
						id: this.id("ics", (get("UID") || "") + title + start),
						type: "event",
						title,
						summary: this.clip(get("DESCRIPTION").replace(/\\n/g, " "), 300),
						sources: [{ name: copy("web.cards.a00f295cfbb0"), kind: "calendar" }],
						start,
						end,
						...(location ? { location } : {}),
						...(url ? { url } : {}),
						tags: [],
						body: [],
						time: start,
					},
				};
			})
			.filter(Boolean);
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
				meta: copy("web.importers.1e579068c564"),
				url,
				tags: [],
				body: rest ? [rest] : [],
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
			meta: copy("web.cards.de6785d99e02"),
			tags: [],
			body: value
				.split(/\n{2,}/)
				.map((p?: any) => p.slice(0, 50000))
				.slice(0, 100),
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
						(old?: any) =>
							!old.url &&
							old.title === c.title &&
							JSON.stringify(old.body || []) === JSON.stringify(c.body || []),
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

export { Importers };
