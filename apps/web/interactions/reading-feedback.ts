type ReadingHost = { refreshCard(id: string, preserve?: boolean): void };
const pending = new WeakMap<ReadingHost, string>();

/** refreshCard redraws the whole feed, so one deferred refresh includes every changed card. */
export function deferReadingRefresh(app: ReadingHost, id: string) {
	pending.set(app, id);
}

/**
 * After a phone close the read colour waits until the page has settled and the phone is idle, so
 * the feed redraw does not share the frame that restores the page. A detail opened meanwhile keeps
 * it pending for its own close.
 */
export function flushReadingRefreshLater(app: ReadingHost, settled: () => boolean) {
	if (!pending.has(app)) return;
	const run = () => {
		if (settled()) flushReadingRefresh(app);
	};
	if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 300 });
	else window.setTimeout(run, 120);
}

export function flushReadingRefresh(app: ReadingHost) {
	const id = pending.get(app);
	if (!id) return;
	pending.delete(app);
	app.refreshCard(id, false);
}
