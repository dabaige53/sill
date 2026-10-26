import { type AnimationPlaybackControls, animate } from "motion";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { markdownHeadings } from "../atoms/markdown.ts";
import { copy } from "../copy.ts";

const timing = {
	duration:
		Number.parseFloat(tokens.timing.tokens.find((token) => token.name === "base")!.value) / 1000,
	ease: tokens.timing.tokens
		.find((token) => token.name === "ease")!
		.value.match(/[\d.]+/g)!
		.map(Number) as [number, number, number, number],
};

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
	const [current, setCurrent] = useState(headings[0]?.id);
	const scroll = useRef<HTMLDivElement>(null);
	const nav = useRef<HTMLElement>(null);
	const marker = useRef<HTMLSpanElement>(null);
	const markerInstant = useRef(true);
	const workspace = kind === "article" || kind === "media";
	const baseDepth = Math.min(...headings.map((heading) => heading.depth));

	useEffect(() => {
		const region = scroll.current;
		if (!region || !headings.length) return;
		const update = () => {
			const top = region.getBoundingClientRect().top + 40;
			let selected = headings[0].id;
			for (const heading of headings) {
				const node = region.querySelector<HTMLElement>(`#${heading.id}`);
				if (node && node.getBoundingClientRect().top <= top) selected = heading.id;
			}
			const maximum = region.scrollHeight - region.clientHeight;
			if (maximum > 0 && region.scrollTop >= maximum - 1) selected = headings.at(-1)!.id;
			setCurrent(selected);
		};
		region.addEventListener("scroll", update, { passive: true });
		const resize = new ResizeObserver(update);
		resize.observe(region);
		update();
		return () => {
			resize.disconnect();
			region.removeEventListener("scroll", update);
		};
	}, [headings]);
	useEffect(() => {
		const item = [...(nav.current?.querySelectorAll<HTMLElement>("a[href]") ?? [])].find(
			(link) => link.getAttribute("href") === `#${current}`,
		);
		if (!item || !marker.current) return;
		const element = marker.current;
		const region = nav.current!;
		let motion: AnimationPlaybackControls | undefined;
		const place = (instant: boolean) => {
			motion?.stop();
			const transform = `translateY(${item.offsetTop + (item.offsetHeight - element.offsetHeight) / 2}px)`;
			if (instant) element.style.transform = transform;
			else motion = animate(element, { transform }, timing);
		};
		place(markerInstant.current);
		markerInstant.current = false;
		const viewport = region.getBoundingClientRect(),
			rect = item.getBoundingClientRect();
		if (rect.top < viewport.top) region.scrollTop -= viewport.top - rect.top;
		else if (rect.bottom > viewport.bottom) region.scrollTop += rect.bottom - viewport.bottom;
		let initialResize = true;
		const resize = new ResizeObserver(() => {
			if (!initialResize) place(true);
			initialResize = false;
		});
		resize.observe(region);
		return () => {
			motion?.stop();
			resize.disconnect();
		};
	}, [current]);
	function jump(id: string) {
		const region = scroll.current,
			section = region?.querySelector<HTMLElement>(`#${id}`);
		if (!region || !section) return;
		markerInstant.current = true;
		setCurrent(id);
		const target = Math.max(
			0,
			Math.min(
				region.scrollHeight - region.clientHeight,
				region.scrollTop +
					section.getBoundingClientRect().top -
					region.getBoundingClientRect().top -
					16,
			),
		);
		region.scrollTop = target;
	}
	return (
		<>
			<div
				ref={scroll}
				className={`reader-scroll${workspace ? " reader-workspace" : ""}${kind === "media" ? " is-media-reader" : ""}${kind === "article" ? " is-article-reader" : ""}${headings.length ? " has-outline" : ""}`}
				id="reader-scroll"
			>
				{children}
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
						<span ref={marker} className="reader-outline-marker" aria-hidden="true" />
						{headings.map((heading) => (
							<a
								key={heading.id}
								href={`#${heading.id}`}
								aria-current={current === heading.id ? "location" : undefined}
								style={{
									paddingInlineStart: `calc(var(--space-12) + ${Math.min(2, heading.depth - baseDepth)} * var(--space-12))`,
								}}
								onClick={(event) => {
									event.preventDefault();
									jump(heading.id);
								}}
							>
								{heading.title}
							</a>
						))}
					</div>
				</nav>
			)}
		</>
	);
}
