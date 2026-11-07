import MarkdownIt from "markdown-it";

// One renderer for all detail text (ADR 0063): no raw HTML, no image loading, only http(s) and mailto links.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
md.validateLink = (url) => /^(https?:|mailto:)/i.test(url.trim());
md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(tokens[index].content);
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
	tokens[index].attrSet("target", "_blank");
	tokens[index].attrSet("rel", "noopener noreferrer");
	return self.renderToken(tokens, index, options);
};
// Tables scroll sideways inside their own frame so narrow screens keep readable columns.
md.renderer.rules.table_open = (tokens, index, options, _env, self) =>
	`<div class="markdown-table">${self.renderToken(tokens, index, options)}`;
md.renderer.rules.table_close = (tokens, index, options, _env, self) =>
	`${self.renderToken(tokens, index, options)}</div>`;

export function markdownHtml(text: string, headingPrefix?: string): string {
	const tokens = md.parse(text, {});
	let index = 0;
	if (headingPrefix)
		for (const token of tokens) {
			if (token.type === "heading_open") token.attrSet("id", `${headingPrefix}-${index++}`);
		}
	return md.renderer.render(tokens, md.options, {});
}

/** Outline entries use the same parsed headings and IDs as the rendered body. */
export function markdownHeadings(text: string, prefix = "reader-section") {
	const tokens = md.parse(text, {});
	return tokens
		.flatMap((token, index) =>
			token.type === "heading_open"
				? [
						{
							depth: Number(token.tag.slice(1)),
							title: (tokens[index + 1]?.children || [])
								.map((child) =>
									["text", "code_inline", "image"].includes(child.type)
										? child.content
										: ["softbreak", "hardbreak"].includes(child.type)
											? " "
											: "",
								)
								.join(""),
						},
					]
				: [],
		)
		.map((heading, index) => ({ ...heading, id: `${prefix}-${index}` }));
}

/** Card links in authored text stay in the current workspace. External links keep their destination. */
export function internalCardRoute(href: string, base: string): string | null {
	try {
		const url = new URL(href, base);
		const local =
			["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
			["4318", "5173"].includes(url.port);
		if (
			!/^https?:$/.test(url.protocol) ||
			url.pathname !== "/" ||
			(url.origin !== new URL(base).origin &&
				!local &&
				url.origin !== "https://sill-web-preview.scs1213-temp-email.workers.dev")
		)
			return null;
		return /^#(?:card|read)\/[\w-]+$/.test(url.hash) ? url.hash : null;
	} catch {
		return null;
	}
}

// Feed faces, reading time and search read the same bodies on every render and keystroke.
// Parsing is the costly part, so plain text is kept per body for the most recent bodies.
const plainCache = new Map<string, { blocks: string[]; text?: string }>();
const plainCacheSize = 500;

function plain(text: string) {
	let entry = plainCache.get(text);
	if (entry) plainCache.delete(text);
	else {
		entry = { blocks: parseBlocks(text) };
		if (plainCache.size >= plainCacheSize) plainCache.delete(plainCache.keys().next().value);
	}
	plainCache.set(text, entry);
	return entry;
}

/** Plain text blocks of a Markdown string, for search, excerpts and the card face fallback. */
export function markdownBlocks(text: string): string[] {
	return plain(text).blocks.slice();
}

function parseBlocks(text: string): string[] {
	return md
		.parse(text, {})
		.filter((token) => ["inline", "fence", "code_block"].includes(token.type))
		.map((token) =>
			token.type !== "inline"
				? token.content.trimEnd()
				: (token.children || [])
						.map((child) =>
							["softbreak", "hardbreak"].includes(child.type)
								? " "
								: ["text", "code_inline", "image"].includes(child.type)
									? child.content
									: "",
						)
						.join(""),
		)
		.filter((block) => block.trim());
}

export function markdownText(text: string): string {
	const entry = plain(text);
	entry.text ??= entry.blocks.join("\n");
	return entry.text;
}
