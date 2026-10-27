import assert from "node:assert/strict";
import test from "node:test";

// The layout module shares the browser motion engine; provide its read-only media query.
Object.defineProperty(globalThis, "matchMedia", {
	value: () => ({ matches: false }),
	configurable: true,
});
const { columnGeometry } = await import("../../apps/web/interactions/layout.ts");

test("a medium desktop preserves readable columns instead of packing the minimum", () => {
	const layout = columnGeometry(1240);
	assert.equal(layout.columns, 3);
	assert.equal(layout.columnWidth, 380);
	assert.equal(layout.inset, 26);
});

test("compact desks grow beyond four columns and a phone keeps its available width", () => {
	const compact = columnGeometry(1640, { min: 240, ideal: 280, max: 320 });
	assert.equal(compact.columns, 5);
	assert.ok(compact.columnWidth >= 300);
	assert.deepEqual(columnGeometry(288, { gap: 16 }), {
		columns: 1,
		columnWidth: 288,
		inset: 0,
	});
});

test("density breakpoints never overlap or put columns outside the container", () => {
	for (const profile of [
		{ min: 240, ideal: 280, max: 320 },
		{ min: 280, ideal: 340, max: 380 },
		{ min: 340, ideal: 400, max: 440 },
	]) {
		for (const width of [288, 358, 558, 576, 580, 600, 744, 944, 1240, 1640, 2000]) {
			const { columns, columnWidth, inset } = columnGeometry(width, profile);
			assert.ok(columns >= 1);
			assert.ok(inset >= -0.001);
			assert.ok(2 * inset + columns * columnWidth + (columns - 1) * 24 <= width + 0.001);
			if (columns > 1) assert.ok(columnWidth >= profile.min && columnWidth <= profile.max);
		}
	}
});

test("adding a column requires its ideal reading width, including near the former jump", () => {
	for (const width of [1600, 1610, 1620, 1640]) {
		const result = columnGeometry(width);
		assert.equal(result.columns, 4);
		assert.equal(result.columnWidth, 380);
	}
	// Add a column only when its ideal width and gaps fit.
	for (const count of [5, 6, 7]) {
		const threshold = count * 340 + (count - 1) * 24;
		assert.equal(columnGeometry(threshold - 1).columns, count - 1);
		assert.equal(columnGeometry(threshold).columns, count);
		assert.equal(columnGeometry(threshold).columnWidth, 340);
	}
});

test("narrow desktop windows retain two usable columns", () => {
	for (const width of [632, 652]) {
		const result = columnGeometry(width, { gap: 20 });
		assert.equal(result.columns, 2);
		assert.ok(result.columnWidth >= 280);
	}
});

test("desktop fill uses the whole width without changing the column-count rule", () => {
	for (const windowWidth of [900, 1440, 2200]) {
		const width = windowWidth - 24;
		const layout = columnGeometry(width, { fill: true });
		assert.equal(layout.columns, columnGeometry(width).columns);
		assert.ok(Math.abs(layout.inset) < 0.001);
		assert.ok(
			Math.abs(layout.columns * layout.columnWidth + (layout.columns - 1) * 24 - width) < 0.001,
		);
	}
});

test("resizing cards releases the height held for content updates", async () => {
	const { JSDOM } = await import("jsdom");
	const { FeedLayout } = await import("../../apps/web/interactions/layout.ts");
	const dom = new JSDOM(
		'<div id="feed-grid"><article class="feed-item" style="width:340px;min-height:229px"></article></div>',
	);
	const previous = Object.fromEntries(
		["window", "document", "getComputedStyle"].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	for (const [key, value] of Object.entries({
		window: dom.window,
		document: dom.window.document,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	}))
		Object.defineProperty(globalThis, key, { configurable: true, value });
	try {
		const grid = dom.window.document.querySelector("#feed-grid")!;
		const card = grid.firstElementChild as HTMLElement;
		let width = 340;
		Object.defineProperty(grid, "clientWidth", { get: () => width });
		const layout = Object.create(FeedLayout.prototype);
		layout.container = grid;
		layout.layout();
		assert.equal(card.style.minHeight, "229px", "same-width updates retain their anchor");
		width = 358;
		layout.layout();
		assert.equal(card.style.minHeight, "", "a new width must use the content's new height");
	} finally {
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
		dom.window.close();
	}
});

test("phone reflow lays out immediately and cancels a running desktop FLIP", async () => {
	const { JSDOM } = await import("jsdom");
	const { FeedLayout } = await import("../../apps/web/interactions/layout.ts");
	const { MotionEngine } = await import("../../apps/web/interactions/motion.ts");
	const dom = new JSDOM('<div id="feed-grid"><article class="feed-item"></article></div>');
	const previous = Object.fromEntries(
		["window", "document", "getComputedStyle"].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	for (const [key, value] of Object.entries({
		window: dom.window,
		document: dom.window.document,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	}))
		Object.defineProperty(globalThis, key, { configurable: true, value });
	const originalFlip = MotionEngine.flip;
	let flips = 0;
	MotionEngine.flip = () => flips++;
	try {
		const grid = dom.window.document.querySelector("#feed-grid")!;
		const card = grid.firstElementChild as HTMLElement;
		Object.defineProperty(grid, "clientWidth", { value: 358 });
		Object.defineProperty(card, "offsetHeight", { value: 120 });
		const layout = Object.create(FeedLayout.prototype);
		layout.container = grid;
		dom.window.innerWidth = 651;
		layout.layout(true);
		assert.equal(flips, 1, "desktop layout still animates");
		let cancelled = false;
		MotionEngine.layoutAnimations.set(card, { cancel: () => (cancelled = true) });
		dom.window.innerWidth = 650;
		layout.layout(true);
		assert.equal(flips, 1, "phone layout must not start a new FLIP");
		assert.equal(cancelled, true);
		assert.equal(MotionEngine.layoutAnimations.has(card), false);
		assert.equal(card.style.top, "0px");
		assert.equal(card.style.width, "358px");
		assert.equal(grid.style.height, "120px");
	} finally {
		MotionEngine.flip = originalFlip;
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
		dom.window.close();
	}
});
