import { markdownHtml } from "../atoms/markdown.ts";

/** Detail text: the Markdown body, or the card face summary as plain text when there is no body. */
export function DetailText({ body, summary }: { body?: string; summary?: string }) {
	if (body?.trim()) return <Markdown className="preview-full" text={body} />;
	return summary?.trim() ? (
		<div className="markdown preview-full">
			<p>{summary}</p>
		</div>
	) : null;
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
