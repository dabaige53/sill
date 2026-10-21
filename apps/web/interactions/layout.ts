import { MotionEngine } from "./motion.ts";

export function columnGeometry(
	width: number,
	{ min = 280, ideal = 340, max = 380, gap = 24, fill = false } = {},
) {
	const fits = Math.max(1, Math.floor((width + gap) / (min + gap)));
	const columns = Math.max(
		1,
		Math.min(fits, Math.max(Math.min(2, fits), Math.floor((width + gap) / (ideal + gap)))),
	);
	const columnWidth =
		columns === 1
			? width
			: fill
				? (width - (columns - 1) * gap) / columns
				: Math.min(max, (width - (columns - 1) * gap) / columns);
	return {
		columns,
		columnWidth,
		inset: (width - (columns * columnWidth + (columns - 1) * gap)) / 2,
	};
}

class FeedLayout {
	declare container: any;
	declare frame: any;
	declare animateNext: any;
	declare onResize: any;
	declare observedWidth: any;
	declare observer: any;

	constructor(container?: any) {
		this.container = container;
		this.frame = 0;
		this.animateNext = false;
		this.onResize = () => this.schedule(true);
		window.addEventListener("resize", this.onResize, { passive: true });
		// Embedded workspaces can resize without a window resize event.
		this.observedWidth = container.clientWidth;
		this.observer = new ResizeObserver((entries?: any) => {
			const width = entries[0].contentRect.width;
			if (Math.abs(width - this.observedWidth) < 1) return;
			this.observedWidth = width;
			this.schedule(true);
		});
		this.observer.observe(container);
	}
	schedule(animate: any = false) {
		this.animateNext = this.animateNext || animate;
		if (this.frame) return;
		this.frame = requestAnimationFrame(() => {
			const next = this.animateNext;
			this.frame = 0;
			this.animateNext = false;
			this.layout(next);
		});
	}
	layout(animate: any = false) {
		const el = this.container,
			width = el.clientWidth;
		const items = [...el.querySelectorAll(":scope > .feed-item")];
		if (!items.length) {
			el.style.height = "";
			return;
		}
		if (!width) return;
		// Density changes readability and grouping, not just how many minimum-width cards fit.
		const style = getComputedStyle(el);
		const value = (name: string, fallback: number) =>
			Number.parseFloat(style.getPropertyValue(name)) || fallback;
		// @design feed-columns
		const min = value("--col-min", 280),
			ideal = value("--col-ideal", 340),
			max = value("--col-max", 380);
		const gap = value(width < min * 2 + 24 ? "--gap-sm" : width < 1000 ? "--gap-md" : "--gap", 24);
		const {
			columns: cols,
			columnWidth: col,
			inset,
		} = columnGeometry(width, {
			min,
			ideal,
			max,
			gap,
			fill: el.id === "feed-grid" && window.innerWidth > 650,
		});
		if (el.id === "feed-grid") {
			const header = document.getElementById("home-top");
			if (header) {
				header.style.setProperty("--feed-left", `${el.getBoundingClientRect().left + inset}px`);
			}
		}
		const old = animate
			? new Map<any, any>(items.map((n?: any) => [n, n.getBoundingClientRect()]))
			: null;
		// Measure the visible positions first, then remove old transforms before final layout.
		items.forEach((n: HTMLElement) => {
			MotionEngine.layoutAnimations.get(n)?.cancel();
			MotionEngine.layoutAnimations.delete(n);
		});
		el.dataset.columns = cols;
		items.forEach((n?: any) => {
			n.style.width = col + "px";
		});
		// Measure once after setting every width, then write positions together.
		// Interleaving offsetHeight and top/left forces a layout for each card.
		const sizes = items.map((n?: any) => n.offsetHeight),
			heights = Array(cols).fill(0);
		items.forEach((n?: any, index?: any) => {
			let c = 0;
			for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 1) c = i;
			n.style.left = inset + c * (col + gap) + "px";
			n.style.top = heights[c] + "px";
			heights[c] += sizes[index] + gap + (n.classList.contains("stack-card") ? 10 : 0);
		});
		el.style.height = Math.max(...heights) - gap + "px";
		if (old) {
			const next = items.map((n?: any) => n.getBoundingClientRect());
			items.forEach((n?: any, i?: any) => {
				MotionEngine.flip(n, old.get(n), next[i]);
			});
		}
	}
}

export { FeedLayout };
