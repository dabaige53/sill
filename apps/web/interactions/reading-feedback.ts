type ReadingHost = { refreshCard(id: string, preserve?: boolean): void };
const pending = new WeakMap<ReadingHost, string>();

/** refreshCard redraws the whole feed, so one deferred refresh includes every changed card. */
export function deferReadingRefresh(app: ReadingHost, id: string) {
	pending.set(app, id);
}

export function flushReadingRefresh(app: ReadingHost) {
	const id = pending.get(app);
	if (!id) return;
	pending.delete(app);
	app.refreshCard(id, false);
}
