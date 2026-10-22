import { markdownHtml } from "../atoms/markdown.ts";

/** Detail surfaces render the authored body; summary belongs to cards and search. */
export function DetailText({ body }: { body?: string }) {
	return body?.trim() ? <Markdown className="preview-full" text={body} /> : null;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
	return (
		<div
			className={`markdown ${className}`.trim()}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it escapes raw HTML and filters link protocols.
			dangerouslySetInnerHTML={{ __html: markdownHtml(text) }}
		/>
	);
}
