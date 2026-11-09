import { useEffect, useMemo, useRef, useState } from "react";
import { markdownHtml } from "../atoms/markdown.ts";
import { MarkdownImageViewer } from "./markdown-image-viewer.tsx";

function updateImage(target: EventTarget, failed = false) {
	if (!(target instanceof HTMLImageElement)) return;
	const wrapper = target.closest<HTMLElement>(".markdown-image");
	if (wrapper) wrapper.dataset.imageState = failed ? "error" : "loaded";
}

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
	const root = useRef<HTMLDivElement>(null);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	useEffect(() => {
		setImage(null);
		if (!html) return;
		// Cached images can finish before React attaches its load handler.
		for (const img of root.current?.querySelectorAll<HTMLImageElement>(".markdown-image img") ||
			[]) {
			if (img.closest("a")) {
				img.removeAttribute("tabindex");
				img.removeAttribute("role");
				img.removeAttribute("aria-label");
			}
			if (img.complete) updateImage(img, !img.naturalWidth);
		}
	}, [html]);
	return (
		<>
			<div
				ref={root}
				className={`markdown ${className}`.trim()}
				onLoadCapture={(event) => updateImage(event.target)}
				onErrorCapture={(event) => updateImage(event.target, true)}
				onClickCapture={(event) => {
					const target = event.target as HTMLElement;
					const img = target.closest<HTMLImageElement>(".markdown-image img");
					if (!img || img.closest("a") || !img.naturalWidth) return;
					event.preventDefault();
					event.stopPropagation();
					setImage(img);
				}}
				onKeyDownCapture={(event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					const target = event.target as HTMLElement;
					if (target.matches(".markdown-image img") && !target.closest("a")) {
						event.preventDefault();
						event.stopPropagation();
						if ((target as HTMLImageElement).naturalWidth) setImage(target as HTMLImageElement);
					}
				}}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it escapes raw HTML and filters link protocols.
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			{image && <MarkdownImageViewer image={image} onClose={() => setImage(null)} />}
		</>
	);
}
