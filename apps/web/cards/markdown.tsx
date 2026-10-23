import { markdownHtml } from "../atoms/markdown.ts";

/** Detail surfaces render the authored body; summary belongs to cards and search. */
export function DetailText({ body, outline = false }: { body?: string; outline?: boolean }) {
	return body?.trim() ? (
		<Markdown
			className="preview-full"
			text={body}
			headingPrefix={outline ? "reader-section" : undefined}
		/>
	) : null;
}

export function Markdown({
	text,
	className = "",
	headingPrefix,
}: {
	text: string;
	className?: string;
	headingPrefix?: string;
}) {
	return (
		<div
			className={`markdown ${className}`.trim()}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it escapes raw HTML and filters link protocols.
			dangerouslySetInnerHTML={{ __html: markdownHtml(text, headingPrefix) }}
		/>
	);
}
