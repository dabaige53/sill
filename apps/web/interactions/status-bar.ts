/**
 * Safari tints its status bar from theme-color. It follows what sits under it: black while the
 * drawer scales the page, else the fill of the top open page (search is white), else the canvas.
 */
export function paintStatusBar() {
	let color = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
	if (document.body.classList.contains("is-drawer-scaled")) color = "#000";
	else {
		const page = [
			...document.querySelectorAll<HTMLElement>("dialog[open]:is(.page, .search, .reader)"),
		].at(-1);
		const fill = page && getComputedStyle(page).backgroundColor;
		if (fill && fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") color = fill;
	}
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
		if (meta.content !== color) meta.content = color;
}

/**
 * WebKit can miss a :has() update when a dialog opens, closes or changes id: the desk then showed
 * over the search page for a frame, and its top bar could stay over search. Body classes mark the
 * open page instead; styles read these, not :has() on the dialogs.
 */
export function markOpenPage() {
	const body = document.body;
	body.classList.toggle(
		"has-open-page",
		!!document.querySelector(":is(#modal, .phone-layer, #search-background)[open].page"),
	);
	body.classList.toggle("has-open-search", !!document.querySelector("dialog.search[open]"));
}

/** Pages open and close through a dialog's `open`, id and class; only dialogs are watched.
 * The page marks change in the same frame. One page change toggles `open` several times, and iOS
 * repaints the status bar on every theme-color write, so those writes settle into one per frame. */
export function watchStatusBar() {
	let frame = 0;
	new MutationObserver((records) => {
		if (!records.some((record) => record.target.nodeName === "DIALOG")) return;
		markOpenPage();
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			paintStatusBar();
		});
	}).observe(document.body, {
		subtree: true,
		attributeFilter: ["open", "id", "class"],
	});
	markOpenPage();
	paintStatusBar();
}
