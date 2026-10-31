import foundation from "../../../design-system/tokens/foundation.json" with { type: "json" };

// @design article-reading
// The list follows shadcn's docs TOC; Sill's scroll container owns jumps and selection.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/components/docs-toc.tsx
export function bindScrollSpine(region: HTMLElement, nav: HTMLElement) {
	const config = foundation.motion.scrollSpine;
	const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[href]")];
	const track = nav.querySelector<HTMLElement>(".reader-outline-links")!;
	const sections = links.map((link) => region.querySelector<HTMLElement>(link.hash));
	let offsets: number[] = [];
	let bands: { top: number; height: number }[] = [];
	let current = -1;
	let frame = 0;
	let clicked: { index: number; scrollTop: number } | null = null;
	const update = (instant = false) => {
		if (!bands.length) return;
		const maximum = Math.max(0, region.scrollHeight - region.clientHeight);
		const atEnd = maximum > 0 && region.scrollTop >= maximum - config.endSlack;
		const line = region.scrollTop + region.clientHeight * config.readLine;
		let selected = 0;
		while (selected < offsets.length - 1 && offsets[selected + 1] <= line) selected++;
		if (atEnd) selected = offsets.length - 1;
		if (clicked && Math.abs(region.scrollTop - clicked.scrollTop) < 1) selected = clicked.index;
		else clicked = null;
		const band = bands[selected];
		if (current !== selected || instant) {
			current = selected;
			links.forEach((link, index) => {
				if (index === selected) link.setAttribute("aria-current", "location");
				else link.removeAttribute("aria-current");
			});
			const rowTop = track.offsetTop + band.top;
			if (rowTop < nav.scrollTop) nav.scrollTop = rowTop;
			else if (rowTop + band.height > nav.scrollTop + nav.clientHeight)
				nav.scrollTop = rowTop + band.height - nav.clientHeight;
		}
	};
	const measure = () => {
		const rect = region.getBoundingClientRect();
		// Panel transitions scale screen coordinates, but scrollTop uses layout pixels.
		const scale = rect.height / region.offsetHeight || 1;
		offsets = sections.map((section) =>
			section ? (section.getBoundingClientRect().top - rect.top) / scale + region.scrollTop : 0,
		);
		bands = links.map((link) => ({ top: link.offsetTop, height: link.offsetHeight }));
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
		measure();
		region.scrollTop = Math.max(0, offsets[index] - config.jumpOffset);
		clicked = { index, scrollTop: region.scrollTop };
		update(event.detail === 0);
	};
	const resize = new ResizeObserver(measure);
	resize.observe(region);
	resize.observe(nav);
	resize.observe(track);
	if (region.firstElementChild) resize.observe(region.firstElementChild);
	region.addEventListener("scroll", schedule, { passive: true });
	region.addEventListener("load", measure, true);
	nav.addEventListener("click", jump);
	measure();
	return () => {
		cancelAnimationFrame(frame);
		resize.disconnect();
		region.removeEventListener("scroll", schedule);
		region.removeEventListener("load", measure, true);
		nav.removeEventListener("click", jump);
	};
}
