import { type AnimationPlaybackControls, animate } from "motion";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { markdownHeadings } from "../atoms/markdown.ts";
import { Icon } from "../atoms/react-primitives.tsx";
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
	const [hidden, setHidden] = useState(false);
	const [current, setCurrent] = useState(headings[0]?.id);
	const scroll = useRef<HTMLDivElement>(null);
	const nav = useRef<HTMLElement>(null);
	const marker = useRef<HTMLSpanElement>(null);
	const scrolling = useRef<AnimationPlaybackControls | null>(null);
	const intended = useRef<string | null>(null);
	const markerInstant = useRef(true);
	const workspace = kind === "article" || kind === "media";
	const baseDepth = Math.min(...headings.map((heading) => heading.depth));

	useEffect(() => {
		const region = scroll.current;
		if (!region || !headings.length) return;
		const update = () => {
			if (intended.current) return;
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
		const interrupt = () => {
			scrolling.current?.stop();
			scrolling.current = null;
			intended.current = null;
			update();
		};
		const key = (event: KeyboardEvent) => {
			if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key))
				interrupt();
		};
		region.addEventListener("scroll", update, { passive: true });
		region.addEventListener("wheel", interrupt, { passive: true });
		region.addEventListener("touchstart", interrupt, { passive: true });
		region.addEventListener("pointerdown", interrupt);
		region.addEventListener("keydown", key);
		const resize = new ResizeObserver(interrupt);
		resize.observe(region);
		update();
		return () => {
			scrolling.current?.stop();
			intended.current = null;
			resize.disconnect();
			region.removeEventListener("scroll", update);
			region.removeEventListener("wheel", interrupt);
			region.removeEventListener("touchstart", interrupt);
			region.removeEventListener("pointerdown", interrupt);
			region.removeEventListener("keydown", key);
		};
	}, [headings]);
	useEffect(() => {
		const item = nav.current?.querySelector<HTMLElement>('[aria-current="location"]');
		if (!item || !marker.current || hidden) return;
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
	}, [current, hidden]);
	function jump(id: string, keyboard: boolean) {
		const region = scroll.current,
			section = region?.querySelector<HTMLElement>(`#${id}`);
		if (!region || !section) return;
		scrolling.current?.stop();
		intended.current = id;
		markerInstant.current = keyboard;
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
		if (keyboard) {
			region.scrollTop = target;
			intended.current = null;
			return;
		}
		scrolling.current = animate(region.scrollTop, target, {
			...timing,
			onUpdate: (value) => {
				region.scrollTop = value;
			},
			onComplete: () => {
				intended.current = null;
				scrolling.current = null;
			},
		});
	}
	return (
		<>
			<div
				ref={scroll}
				className={`reader-scroll${workspace ? " reader-workspace" : ""}${kind === "media" ? " is-media-reader" : ""}${kind === "article" ? " is-article-reader" : ""}${headings.length && !hidden ? " has-outline" : ""}`}
				id="reader-scroll"
			>
				{children}
			</div>
			{!!headings.length && (
				<>
					<nav
						ref={nav}
						className="reader-outline"
						aria-label={copy("web.reader.outline")}
						id="reader-outline"
						hidden={hidden}
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
										jump(heading.id, event.detail === 0);
									}}
								>
									{heading.title}
								</a>
							))}
						</div>
					</nav>
					<button
						type="button"
						className="icon-button reader-outline-toggle"
						aria-controls="reader-outline"
						aria-expanded={!hidden}
						aria-label={copy(hidden ? "web.reader.showOutline" : "web.reader.hideOutline")}
						onClick={() => setHidden(!hidden)}
					>
						<Icon name="list" size={20} />
					</button>
				</>
			)}
		</>
	);
}

/** Phones keep the preview page and expose its sections in a compact disclosure. */
export function PhoneArticleOutline({ body }: { body: string }) {
	const headings = useMemo(() => markdownHeadings(body), [body]);
	if (!headings.length) return null;
	return (
		<details className="phone-article-outline">
			<summary>{copy("web.reader.outline")}</summary>
			<nav aria-label={copy("web.reader.outline")}>
				{headings.map((heading) => (
					<a
						key={heading.id}
						href={`#${heading.id}`}
						onClick={(event) => {
							event.preventDefault();
							const region = event.currentTarget.closest(".sheet-scroll");
							const target = region?.querySelector<HTMLElement>(`#${heading.id}`);
							event.currentTarget.closest("details")!.open = false;
							target?.scrollIntoView({
								block: "start",
								behavior: event.detail === 0 ? "instant" : "smooth",
							});
						}}
					>
						{heading.title}
					</a>
				))}
			</nav>
		</details>
	);
}
