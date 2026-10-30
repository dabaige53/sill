/** Keep Safari chrome stable during navigation; page surfaces paint their own safe areas. */
export function paintStatusBar() {
	if (document.documentElement.dataset.standalone === "true") return;
	// The backing exposed by the drawer is not the system chrome color.
	const color = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
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
	body.classList.toggle(
		"has-search-editing",
		!!document.querySelector("dialog.search.search-editing[open]") &&
			!document.querySelector(":is(#modal, .phone-layer)[open].page:not(.search)"),
	);
}

/** Navigation updates visibility marks, never the system chrome color. */
export function watchStatusBar() {
	new MutationObserver((records) => {
		if (records.some((record) => record.target.nodeName === "DIALOG")) markOpenPage();
	}).observe(document.body, {
		subtree: true,
		attributeFilter: ["open", "id", "class"],
	});
	markOpenPage();
	paintStatusBar();
}
