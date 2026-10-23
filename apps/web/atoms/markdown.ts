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

export function markdownHtml(text: string): string {
	return md.render(text);
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

/** Plain text blocks of a Markdown string, for search, excerpts and the card face fallback. */
export function markdownBlocks(text: string): string[] {
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
	return markdownBlocks(text).join("\n");
}
