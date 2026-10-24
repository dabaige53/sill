import { type AnimationPlaybackControls, animate, spring } from "motion";
import { icon } from "../../apps/web/atoms/icons.ts";
import tokens from "../tokens.json" with { type: "json" };

const stage = document.querySelector<HTMLElement>(".stage")!;
const morph = document.querySelector<HTMLElement>(".morph")!;
const full = document.querySelector<HTMLElement>(".full-view")!;
const mini = document.querySelector<HTMLElement>(".mini-view")!;
const left = document.querySelector<HTMLElement>(".left-tools")!;
const toolsSurface = document.querySelector<HTMLElement>(".tools-surface")!;
const right = document.querySelector<HTMLElement>(".right-tools")!;
const toggle = document.querySelector<HTMLButtonElement>("#resize")!;
let expanded = false;
const active = new Map<HTMLElement, AnimationPlaybackControls>();
function move(
	el: HTMLElement,
	target: Record<string, string | number>,
	direct: boolean,
	fading = false,
) {
	active.get(el)?.stop();
	if (direct) {
		Object.assign(el.style, target);
		return;
	}
	active.set(
		el,
		animate(
			el,
			target,
			fading
				? { duration: tokens.motion.detailFade / 1000, ease: "linear" }
				: { type: spring, ...tokens.motion.expandedSpring },
		),
	);
}
function render(direct: boolean) {
	const w = stage.clientWidth,
		h = stage.clientHeight;
	const cw = expanded ? w : mini.offsetWidth,
		ch = expanded ? h : mini.offsetHeight;
	const x = (w - cw) / 2,
		y = (h - ch) / 2;
	move(morph, { transform: `translate(${x}px,${y}px) scale(${cw / w},${ch / h})` }, direct);
	const toolsX = expanded ? x + 16 : x + (cw - left.offsetWidth) / 2;
	const toolsY = expanded ? y : y + ch - left.offsetHeight - 18;
	// Controls appear at their destination; only the card surface travels.
	move(left, { transform: `translate(${toolsX}px,${toolsY}px)` }, true);
	move(toolsSurface, { opacity: expanded ? 0 : 1 }, true);
	const outlineToggle = document.getElementById("outline-toggle");
	if (outlineToggle) outlineToggle.hidden = !expanded;
	move(right, { transform: `translate(${x + cw - right.offsetWidth - 16}px,${y + 8}px)` }, true);
	full.inert = !expanded;
	mini.inert = expanded;
	full.setAttribute("aria-hidden", String(!expanded));
	mini.setAttribute("aria-hidden", String(expanded));
	move(full, { opacity: expanded ? 1 : 0 }, direct, true);
	move(mini, { opacity: expanded ? 0 : 1 }, direct, true);
	toggle.innerHTML = icon(expanded ? "collapse" : "expand", 20);
	toggle.setAttribute("aria-label", expanded ? "缩小" : "放大");
	toggle.title = expanded ? "缩小" : "放大";
}
toggle.addEventListener("click", (event) => {
	expanded = !expanded;
	render(event.detail === 0);
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && expanded) {
		expanded = false;
		render(true);
		toggle.focus();
	}
});
new ResizeObserver(() => render(true)).observe(stage);
document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((button) => {
	button.addEventListener("click", () =>
		button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true")),
	);
});
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
	button.addEventListener("click", (event) => {
		for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
			const selected = tab === button;
			tab.classList.toggle("on", selected);
			tab.setAttribute("aria-selected", String(selected));
			const panel = document.getElementById(tab.getAttribute("aria-controls")!)!;
			active.get(panel)?.stop();
			panel.hidden = !selected;
			if (selected) {
				panel.style.opacity = "0";
				move(panel, { opacity: 1 }, event.detail === 0, true);
			}
		}
	});
});
render(true);

const articleScroll = document.querySelector<HTMLElement>("#article-scroll");
const outline = document.querySelector<HTMLElement>(".article-outline");
if (articleScroll && outline) {
	const links = [...outline.querySelectorAll<HTMLAnchorElement>("a")];
	const marker = outline.querySelector<HTMLElement>(".toc-indicator")!;
	const progress = document.querySelector<HTMLElement>(".rprog")!;
	const duration =
		Number.parseFloat(tokens.timing.tokens.find((token) => token.name === "base")!.value) / 1000;
	const curve = tokens.timing.tokens
		.find((token) => token.name === "ease")!
		.value.match(/[\d.]+/g)!
		.map(Number) as [number, number, number, number];
	let scrolling: AnimationPlaybackControls | undefined;
	let selected: HTMLAnchorElement | undefined;
	let intended: HTMLAnchorElement | undefined;
	let revision = 0;
	function select(link: HTMLAnchorElement, direct = false) {
		if (selected === link && !direct) return;
		selected = link;
		for (const item of links)
			item.setAttribute("aria-current", item === link ? "location" : "false");
		const position = link.offsetTop + (link.offsetHeight - marker.offsetHeight) / 2;
		active.get(marker)?.stop();
		if (direct) marker.style.transform = `translateY(${position}px)`;
		else
			active.set(
				marker,
				animate(marker, { transform: `translateY(${position}px)` }, { duration, ease: curve }),
			);
	}
	function updateReading(direct = false) {
		const max = articleScroll!.scrollHeight - articleScroll!.clientHeight;
		progress.style.transform = `scaleX(${max > 0 ? articleScroll!.scrollTop / max : 1})`;
		if (intended) {
			select(intended, direct);
			return;
		}
		let current = links[0];
		for (const link of links) {
			const section = document.querySelector<HTMLElement>(link.hash)!;
			if (section.getBoundingClientRect().top <= articleScroll!.getBoundingClientRect().top + 40)
				current = link;
		}
		if (max > 0 && articleScroll!.scrollTop >= max - 1) current = links[links.length - 1];
		select(current, direct);
	}
	function interrupt() {
		revision++;
		scrolling?.stop();
		scrolling = undefined;
		intended = undefined;
		updateReading(true);
	}
	for (const link of links)
		link.addEventListener("click", (event) => {
			event.preventDefault();
			scrolling?.stop();
			const ownRevision = ++revision;
			const section = document.querySelector<HTMLElement>(link.hash)!;
			const maximum = Math.max(0, articleScroll.scrollHeight - articleScroll.clientHeight);
			const target = Math.max(
				0,
				Math.min(
					maximum,
					articleScroll.scrollTop +
						section.getBoundingClientRect().top -
						articleScroll.getBoundingClientRect().top -
						16,
				),
			);
			intended = link;
			select(link, event.detail === 0);
			if (event.detail === 0) {
				articleScroll.scrollTop = target;
				intended = undefined;
				return;
			}
			scrolling = animate(articleScroll.scrollTop, target, {
				duration,
				ease: curve,
				onUpdate: (value) => {
					articleScroll.scrollTop = value;
				},
				onComplete: () => {
					if (revision === ownRevision) {
						scrolling = undefined;
						intended = undefined;
					}
				},
			});
		});
	articleScroll.addEventListener("wheel", interrupt, { passive: true });
	articleScroll.addEventListener("touchstart", interrupt, { passive: true });
	articleScroll.addEventListener("pointerdown", interrupt, { passive: true });
	articleScroll.addEventListener("keydown", (event) => {
		if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key))
			interrupt();
	});
	toggle.addEventListener("click", interrupt);
	document.getElementById("outline-toggle")!.addEventListener("click", (event) => {
		interrupt();
		outline.hidden = !outline.hidden;
		outline.parentElement!.classList.toggle("focus-reading", outline.hidden);
		const button = event.currentTarget as HTMLButtonElement;
		button.setAttribute("aria-expanded", String(!outline.hidden));
		button.setAttribute("aria-label", outline.hidden ? "显示目录" : "收起目录");
		button.title = outline.hidden ? "显示目录" : "收起目录，专注阅读";
		updateReading(true);
	});
	articleScroll.addEventListener("scroll", () => updateReading(), { passive: true });
	new ResizeObserver(() => {
		interrupt();
	}).observe(articleScroll);
	updateReading(true);
}
