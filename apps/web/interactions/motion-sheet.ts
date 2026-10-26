import type { Playback } from "./motion-playback.ts";

type SheetMotion = {
	keyboard: boolean;
	move(surface: HTMLElement): Playback;
	cancelPanel(dialog: HTMLElement): void;
	cancel(surface: HTMLElement): void;
	animate(
		surface: HTMLElement,
		frames: Record<string, string>[],
		options: { spring: "expanded" },
	): Playback | null;
	panelAnimations: WeakMap<
		HTMLElement,
		(Playback | Pick<Playback, "cancel" | "complete"> | null)[]
	>;
};

// @design preview-scroll-expansion
/** A fixed text layout inside a moving, clipped frame; neither text nor controls scale. */
export function resizeSheet(this: SheetMotion, surface: HTMLElement, full: boolean) {
	surface.querySelector(".sheet-handle")?.setAttribute("aria-expanded", String(full));
	if (surface.classList.contains("is-full") === full) return this.move(surface);
	const dialog = surface.closest("dialog") as HTMLDialogElement;
	const scroll = surface.querySelector(".sheet-scroll") as HTMLElement;
	const body = scroll.querySelector<HTMLElement>(".preview-body");
	const controls = [...surface.querySelectorAll<HTMLElement>(".sheet-head, .sheet-handle")];
	if (body) controls.push(body);
	const contentTop = (node: HTMLElement) =>
		node.getBoundingClientRect().top +
		(node === body ? parseFloat(getComputedStyle(node).paddingTop) || 0 : 0);
	const source = surface.getBoundingClientRect();
	const drawn = getComputedStyle(surface);
	const inset = drawn.clipPath
		?.match(/^inset\(([^r)]+)/)?.[1]
		.trim()
		.split(/\s+/);
	const sourceHeight = source.height - (parseFloat(inset?.[2] || inset?.[0] || "0") || 0);
	const sourceRadius = drawn.clipPath?.match(/round\s+(.+)\)/)?.[1] || drawn.borderRadius || "0px";
	const controlTops = controls.map((node) => contentTop(node) - source.top);
	this.cancelPanel(dialog);
	this.cancel(surface);
	surface.style.translate = "";
	surface.classList.toggle("is-full", full);
	const target = surface.getBoundingClientRect();
	const targetRadius = getComputedStyle(surface).borderRadius || "0px";
	const scrollHeight = scroll.offsetHeight;
	const parentTop = (surface.offsetParent || dialog).getBoundingClientRect().top;
	const offsets = controls.map((node, i) => controlTops[i] - (contentTop(node) - target.top));
	// Bridge the safe-area padding visually; writing scrollTop here would stop native inertia.
	if (this.keyboard || !sourceHeight || !target.height) return;
	const original = {
		top: surface.style.top,
		bottom: surface.style.bottom,
		height: surface.style.height,
		maxHeight: surface.style.maxHeight,
		borderRadius: surface.style.borderRadius,
	};
	const scrollStyle = { flex: scroll.style.flex, height: scroll.style.height };
	// Reserve the larger frame in both directions, so collapse never cuts off its first frame.
	const height = Math.max(sourceHeight, target.height);
	Object.assign(surface.style, {
		top: `${target.top - parentTop}px`,
		bottom: "auto",
		height: `${height}px`,
		maxHeight: "none",
		borderRadius: "0px",
	});
	Object.assign(scroll.style, { flex: "none", height: `${scrollHeight}px` });
	dialog.dataset.sheetResizing = "";
	const clip = (visible: number, radius: string) =>
		`inset(0px 0px ${Math.max(0, height - visible)}px 0px round ${radius})`;
	const animation = this.animate(
		surface,
		[
			{
				transform: `translateY(${source.top - target.top}px)`,
				clipPath: clip(sourceHeight, sourceRadius),
			},
			{ transform: "translateY(0px)", clipPath: clip(target.height, targetRadius) },
		],
		{ spring: "expanded" },
	);
	const animations: (Playback | null)[] = [
		animation,
		...controls.map((node, i) =>
			offsets[i]
				? this.animate(
						node,
						[{ transform: `translateY(${offsets[i]}px)` }, { transform: "translateY(0px)" }],
						{ spring: "expanded" },
					)
				: null,
		),
	];
	let active = true;
	const cleanup = () => {
		if (!active) return;
		active = false;
		Object.assign(surface.style, original);
		Object.assign(scroll.style, scrollStyle);
		delete dialog.dataset.sheetResizing;
	};
	this.panelAnimations.set(dialog, [...animations, { cancel: cleanup, complete: cleanup }]);
	Promise.all(animations.map((item) => item?.finished)).then(cleanup, cleanup);
}
