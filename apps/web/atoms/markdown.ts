import MarkdownIt from "markdown-it";
import { copy } from "../copy.ts";

// Raw HTML stays escaped. Authored images load only from HTTPS destinations.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
md.validateLink = (url) => /^(https?:|mailto:)/i.test(url.trim());
const renderImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, index, options, env, self) => {
	const token = tokens[index];
	let url: URL;
	try {
		url = new URL(token.attrGet("src") || "");
		if (url.protocol !== "https:" || url.username || url.password) throw new Error();
	} catch {
		return md.utils.escapeHtml(token.content);
	}
	token.attrSet("loading", "lazy");
	token.attrSet("decoding", "async");
	token.attrSet("referrerpolicy", "no-referrer");
	token.attrSet("tabindex", "0");
	token.attrSet("role", "button");
	token.attrSet(
		"aria-label",
		copy("web.markdown.openImage") + (token.content ? `: ${token.content}` : ""),
	);
	return `<span class="markdown-image" data-image-state="loading">${renderImage(tokens, index, options, env, self)}<span class="markdown-image-loading">${md.utils.escapeHtml(copy("web.markdown.loadingImage"))}</span><span class="markdown-image-error" role="status">${md.utils.escapeHtml(copy("web.markdown.failedImage"))}</span></span>`;
};
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
	tokens[index].attrSet("target", "_blank");
	tokens[index].attrSet("rel", "noopener noreferrer");
	return self.renderToken(tokens, index, options);
};

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
