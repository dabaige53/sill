import { useMemo } from "react";
import { markdownHtml } from "../atoms/markdown.ts";

/** Detail surfaces render the authored body; summary belongs to cards and search. */
export function DetailText({ body, outline = false }: { body?: string; outline?: boolean }) {
	return body?.trim() ? (
		<Markdown
			className={outline ? "preview-full typeset" : "preview-full"}
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
	// Media details re-render on every playback tick; parse the body only when it changes.
	const html = useMemo(() => markdownHtml(text, headingPrefix), [text, headingPrefix]);
	return (
		<div
			className={`markdown ${className}`.trim()}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it escapes raw HTML and filters link protocols.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
