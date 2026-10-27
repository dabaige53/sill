import { type AnimationPlaybackControls, animate, spring } from "motion";
import { icon } from "../../apps/web/atoms/icons.ts";
import { bindScrollSpine } from "../../apps/web/interactions/scroll-spine.ts";
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
	if (outlineToggle) outlineToggle.hidden = true;
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
	bindScrollSpine(articleScroll, outline);
	const progress = document.querySelector<HTMLElement>(".rprog")!;
	articleScroll.addEventListener(
		"scroll",
		() => {
			const maximum = articleScroll.scrollHeight - articleScroll.clientHeight;
			progress.style.transform = `scaleX(${maximum > 0 ? articleScroll.scrollTop / maximum : 1})`;
		},
		{ passive: true },
	);
}
