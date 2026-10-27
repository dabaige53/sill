import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { stretchEdges } from "./stretch-edges.ts";

// @design article-reading
// Interaction reference: https://lab.xevrion.dev/lab/scroll-spine
export function bindScrollSpine(region: HTMLElement, nav: HTMLElement) {
	const config = tokens.motion.scrollSpine;
	const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[href]")];
	const track = nav.querySelector<HTMLElement>(".reader-outline-links")!;
	const marker = nav.querySelector<HTMLElement>(".reader-outline-marker")!;
	const notch = nav.querySelector<HTMLElement>(".reader-outline-notch")!;
	const fills = links.map((link) => link.querySelector<HTMLElement>(".reader-spine-fill")!);
	const sections = links.map((link) => region.querySelector<HTMLElement>(link.hash));
	const edges = stretchEdges((top, bottom) => {
		marker.style.clipPath = `inset(${top}px 0 calc(100% - ${Math.max(top, bottom)}px) 0 round var(--control-radius))`;
	}, config);
	let offsets: number[] = [];
	let bands: { top: number; height: number }[] = [];
	let end = 0;
	let current = -1;
	let frame = 0;
	const update = (instant = false) => {
		if (!bands.length) return;
		const maximum = Math.max(0, region.scrollHeight - region.clientHeight);
		const atEnd = maximum > 0 && region.scrollTop >= maximum - config.endSlack;
		const line = region.scrollTop + region.clientHeight * config.readLine;
		let selected = 0;
		while (selected < offsets.length - 1 && offsets[selected + 1] <= line) selected++;
		if (atEnd) selected = offsets.length - 1;
		const within = atEnd
			? 1
			: Math.max(
					0,
					Math.min(
						1,
						(line - offsets[selected]) /
							Math.max(1, (offsets[selected + 1] ?? end) - offsets[selected]),
					),
				);
		fills.forEach((fill, index) => {
			fill.style.transform = `scaleY(${index < selected ? 1 : index === selected ? within : 0})`;
		});
		const band = bands[selected];
		notch.style.transform = `translateY(${band.top + within * band.height}px)`;
		if (current !== selected || instant) {
			current = selected;
			links.forEach((link, index) => {
				if (index === selected) link.setAttribute("aria-current", "location");
				else link.removeAttribute("aria-current");
			});
			edges.move(
				band.top,
				band.top + band.height,
				instant || document.documentElement.dataset.inputModality === "keyboard",
			);
			const y = track.offsetTop + band.top;
			if (y < nav.scrollTop) nav.scrollTop = y;
			else if (y + band.height > nav.scrollTop + nav.clientHeight)
				nav.scrollTop = y + band.height - nav.clientHeight;
		}
	};
	const measure = () => {
		const top = region.getBoundingClientRect().top;
		offsets = sections.map((section) =>
			section ? section.getBoundingClientRect().top - top + region.scrollTop : 0,
		);
		end = region.scrollHeight;
		// Reset before measuring wrapped labels; each remains at least a full hit target.
		links.forEach((link) => {
			link.style.height = "auto";
		});
		const minimums = links.map((link) => link.offsetHeight);
		const lengths = offsets.map((offset, i) => Math.max(1, (offsets[i + 1] ?? end) - offset));
		const total = lengths.reduce((sum, length) => sum + length, 0);
		const free = Math.max(
			0,
			Math.min(config.height, nav.clientHeight - track.offsetTop) -
				config.gap * (links.length - 1) -
				minimums.reduce((sum, value) => sum + value, 0),
		);
		let y = 0;
		bands = lengths.map((length, i) => {
			const band = { top: y, height: minimums[i] + (free * length) / total };
			links[i].style.height = `${band.height}px`;
			y += band.height + config.gap;
			return band;
		});
		update(true);
	};
	const schedule = () => {
		if (!frame)
			frame = requestAnimationFrame(() => {
				frame = 0;
				update();
			});
	};
	const jump = (event: MouseEvent) => {
		const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
		const index = link ? links.indexOf(link) : -1;
		if (index < 0) return;
		event.preventDefault();
		region.scrollTop = Math.max(0, offsets[index] - config.jumpOffset);
		update(event.detail === 0);
	};
	const resize = new ResizeObserver(measure);
	resize.observe(region);
	resize.observe(nav);
	if (region.firstElementChild) resize.observe(region.firstElementChild);
	region.addEventListener("scroll", schedule, { passive: true });
	region.addEventListener("load", measure, true);
	nav.addEventListener("click", jump);
	measure();
	return () => {
		cancelAnimationFrame(frame);
		resize.disconnect();
		edges.destroy();
		region.removeEventListener("scroll", schedule);
		region.removeEventListener("load", measure, true);
		nav.removeEventListener("click", jump);
	};
}
