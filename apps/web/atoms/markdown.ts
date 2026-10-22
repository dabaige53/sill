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

/** Plain text blocks of a Markdown string, for search, excerpts and the card face fallback. */
export function markdownBlocks(text: string): string[] {
	return md
		.parse(text, {})
		.filter((token) => token.type === "inline")
		.map((token) =>
			(token.children || [])
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
