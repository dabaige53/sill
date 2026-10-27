import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { markdownHeadings } from "../atoms/markdown.ts";
import { copy } from "../copy.ts";
import { bindScrollSpine } from "./scroll-spine.ts";

/** The outline navigates authored headings; it never manufactures sections from paragraphs. */
export function ReaderLayout({
	kind,
	body = "",
	children,
}: {
	kind: string;
	body?: string;
	children: ReactNode;
}) {
	const headings = useMemo(() => (kind === "article" ? markdownHeadings(body) : []), [kind, body]);
	const scroll = useRef<HTMLDivElement>(null);
	const nav = useRef<HTMLElement>(null);
	const workspace = kind === "article" || kind === "media";
	const baseDepth = Math.min(...headings.map((heading) => heading.depth));

	useEffect(() => {
		if (scroll.current && nav.current && headings.length)
			return bindScrollSpine(scroll.current, nav.current);
	}, [headings]);
	return (
		<div
			className={`reader-layout${workspace ? " is-workspace" : ""}${headings.length ? " has-outline" : ""}`}
		>
			<div
				ref={scroll}
				className={`reader-scroll${workspace ? " reader-workspace" : ""}${kind === "media" ? " is-media-reader" : ""}${kind === "article" ? " is-article-reader" : ""}${headings.length ? " has-outline" : ""}`}
				id="reader-scroll"
			>
				<div className="gesture-content">{children}</div>
			</div>
			{!!headings.length && (
				<nav
					ref={nav}
					className="reader-outline"
					aria-label={copy("web.reader.outline")}
					id="reader-outline"
				>
					<h2>{copy("web.reader.outline")}</h2>
					<div className="reader-outline-links">
						<span className="reader-outline-marker" aria-hidden="true" />
						<span className="reader-outline-notch" aria-hidden="true" />
						{headings.map((heading) => (
							<a
								key={heading.id}
								href={`#${heading.id}`}
								aria-current={headings[0]?.id === heading.id ? "location" : undefined}
								style={{
									paddingInlineStart: `calc(var(--space-12) + ${Math.min(2, heading.depth - baseDepth)} * var(--space-12))`,
								}}
							>
								<span className="reader-spine-band" aria-hidden="true">
									<span className="reader-spine-fill" />
								</span>
								{heading.title}
							</a>
						))}
					</div>
				</nav>
			)}
		</div>
	);
}
